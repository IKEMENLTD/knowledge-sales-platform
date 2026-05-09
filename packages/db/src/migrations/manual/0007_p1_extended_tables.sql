-- ============================================================================
-- 0007_p1_extended_tables.sql
-- P1 必須補助テーブル群 (A-H-02 / S-H-01)
--   business_card_images / contact_memos / offline_queue / non_card_attachments
--   sync_failure_log / data_residency_config / recent_views / autosave_drafts
--   recording_segments / recording_stages
--
-- 全テーブルに org_id を持たせ、RLS は self / owner / org_member / org_admin の
-- 4 パターンで策定する。ヘルパー関数 current_user_role() / is_manager_or_admin() /
-- current_org_id() は 0012_rls_v2.sql で再定義 (SECURITY DEFINER + search_path 固定)。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- business_card_images
-- ----------------------------------------------------------------------------
create table if not exists public.business_card_images (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  side text not null check (side in ('front','back')),
  storage_url text not null,
  storage_key text,
  ocr_confidence numeric(3,2)
    check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  classification text,
  captured_lat numeric(9,6),
  captured_lng numeric(9,6),
  captured_at timestamptz not null default now(),
  light_quality text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists business_card_images_contact_idx
  on public.business_card_images (contact_id);
create index if not exists business_card_images_org_contact_idx
  on public.business_card_images (org_id, contact_id);

alter table public.business_card_images enable row level security;
drop policy if exists bci_select_owner_or_admin on public.business_card_images;
create policy bci_select_owner_or_admin on public.business_card_images
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.owner_user_id = auth.uid()
    )
    or public.is_manager_or_admin()
  );
drop policy if exists bci_write_owner on public.business_card_images;
create policy bci_write_owner on public.business_card_images
  for all to authenticated
  using (created_by = auth.uid() or public.is_manager_or_admin())
  with check (created_by = auth.uid() or public.is_manager_or_admin());

-- ----------------------------------------------------------------------------
-- contact_memos
-- ----------------------------------------------------------------------------
create table if not exists public.contact_memos (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('voice','text')),
  content text not null,
  audio_storage_url text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists contact_memos_contact_idx on public.contact_memos (contact_id);
create index if not exists contact_memos_org_contact_idx on public.contact_memos (org_id, contact_id);

alter table public.contact_memos enable row level security;
drop policy if exists cm_select on public.contact_memos;
create policy cm_select on public.contact_memos
  for select to authenticated
  using (
    -- contact 自体は社内全員 SELECT 可なので memo もそれに従う
    exists (select 1 from public.contacts c where c.id = contact_id)
  );
drop policy if exists cm_write_creator on public.contact_memos;
create policy cm_write_creator on public.contact_memos
  for all to authenticated
  using (created_by = auth.uid() or public.is_manager_or_admin())
  with check (created_by = auth.uid() or public.is_manager_or_admin());

-- ----------------------------------------------------------------------------
-- offline_queue (UNIQUE user_id+idempotency_key)
-- ----------------------------------------------------------------------------
create table if not exists public.offline_queue (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action_type text not null,
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued','syncing','done','failed')),
  error_message text,
  queued_at timestamptz not null default now(),
  synced_at timestamptz
);
create unique index if not exists offline_queue_user_idem_uq
  on public.offline_queue (user_id, idempotency_key);
create index if not exists offline_queue_user_idx on public.offline_queue (user_id);
create index if not exists offline_queue_status_idx on public.offline_queue (status);

alter table public.offline_queue enable row level security;
drop policy if exists offline_queue_self on public.offline_queue;
create policy offline_queue_self on public.offline_queue
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- non_card_attachments
-- ----------------------------------------------------------------------------
create table if not exists public.non_card_attachments (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.users(id),
  storage_url text not null,
  classification text not null,
  linked_meeting_id uuid references public.meetings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists non_card_attachments_uploader_idx
  on public.non_card_attachments (uploader_id);
create index if not exists non_card_attachments_meeting_idx
  on public.non_card_attachments (linked_meeting_id);

alter table public.non_card_attachments enable row level security;
drop policy if exists nca_select on public.non_card_attachments;
create policy nca_select on public.non_card_attachments
  for select to authenticated
  using (
    uploader_id = auth.uid()
    or public.is_manager_or_admin()
    or exists (
      select 1 from public.meetings m
      where m.id = linked_meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );
drop policy if exists nca_write on public.non_card_attachments;
create policy nca_write on public.non_card_attachments
  for all to authenticated
  using (uploader_id = auth.uid() or public.is_manager_or_admin())
  with check (uploader_id = auth.uid() or public.is_manager_or_admin());

-- ----------------------------------------------------------------------------
-- sync_failure_log
-- ----------------------------------------------------------------------------
create table if not exists public.sync_failure_log (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  target text not null check (target in ('google_calendar','zoom','gmail')),
  error text not null,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists sync_failure_log_user_idx on public.sync_failure_log (user_id);
create index if not exists sync_failure_log_target_idx on public.sync_failure_log (target);
create index if not exists sync_failure_log_unresolved_idx
  on public.sync_failure_log (occurred_at) where resolved_at is null;

alter table public.sync_failure_log enable row level security;
drop policy if exists sfl_select_self_or_admin on public.sync_failure_log;
create policy sfl_select_self_or_admin on public.sync_failure_log
  for select to authenticated
  using (user_id = auth.uid() or public.is_manager_or_admin());
-- INSERT/UPDATE/DELETE は service_role 経由のみ (worker が記録)
revoke insert, update, delete on public.sync_failure_log from authenticated;

-- ----------------------------------------------------------------------------
-- data_residency_config — org_admin 専用
-- ----------------------------------------------------------------------------
create table if not exists public.data_residency_config (
  org_id uuid primary key,
  region text not null default 'ap-northeast-1',
  dr_region text default 'ap-northeast-3',
  r2_bucket text,
  encryption_key_id text,
  dpa_version text,
  enforced boolean not null default true,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

alter table public.data_residency_config enable row level security;
drop policy if exists drc_select_org on public.data_residency_config;
create policy drc_select_org on public.data_residency_config
  for select to authenticated using (true);
drop policy if exists drc_write_admin on public.data_residency_config;
create policy drc_write_admin on public.data_residency_config
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- recent_views
-- ----------------------------------------------------------------------------
create table if not exists public.recent_views (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  resource_kind text not null check (resource_kind in ('meeting','contact','recording','knowledge')),
  resource_id uuid not null,
  viewed_at timestamptz not null default now()
);
create index if not exists recent_views_user_viewed_idx
  on public.recent_views (user_id, viewed_at desc);
create index if not exists recent_views_user_kind_idx
  on public.recent_views (user_id, resource_kind);

alter table public.recent_views enable row level security;
drop policy if exists recent_views_self on public.recent_views;
create policy recent_views_self on public.recent_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- autosave_drafts
-- ----------------------------------------------------------------------------
create table if not exists public.autosave_drafts (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  form_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists autosave_drafts_user_form_uq
  on public.autosave_drafts (user_id, form_key);

alter table public.autosave_drafts enable row level security;
drop policy if exists autosave_drafts_self on public.autosave_drafts;
create policy autosave_drafts_self on public.autosave_drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- recording_segments
-- ----------------------------------------------------------------------------
create table if not exists public.recording_segments (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  segment_index numeric(10,0) not null,
  speaker_id text,
  speaker_label text,
  start_seconds numeric(10,3) not null,
  end_seconds numeric(10,3) not null,
  text text not null,
  sentiment numeric(3,2)
    check (sentiment is null or (sentiment >= -1 and sentiment <= 1)),
  sensitivity text not null default 'internal'
    check (sensitivity in ('public','internal','sensitive','restricted')),
  pii_detected boolean not null default false,
  pii_redacted_text text,
  created_at timestamptz not null default now()
);
create index if not exists recording_segments_recording_idx
  on public.recording_segments (recording_id);
create index if not exists recording_segments_org_recording_idx
  on public.recording_segments (org_id, recording_id);
create unique index if not exists recording_segments_recording_idx_uq
  on public.recording_segments (recording_id, segment_index);

alter table public.recording_segments enable row level security;
drop policy if exists rec_segments_select on public.recording_segments;
create policy rec_segments_select on public.recording_segments
  for select to authenticated
  using (
    case sensitivity
      when 'public' then true
      when 'internal' then public.current_user_role() in ('sales','cs','manager','admin','legal')
      when 'sensitive' then
        public.current_user_role() in ('manager','admin','legal')
        or exists (
          select 1 from public.recordings r
          join public.meetings m on m.id = r.meeting_id
          where r.id = recording_id and m.owner_user_id = auth.uid()
        )
      when 'restricted' then public.current_user_role() in ('admin','legal')
      else false
    end
  );
-- INSERT/UPDATE/DELETE は service_role 経由のみ (worker が書き込む)
revoke insert, update, delete on public.recording_segments from authenticated;

-- ----------------------------------------------------------------------------
-- recording_stages (recording_id, stage) PK
-- ----------------------------------------------------------------------------
create table if not exists public.recording_stages (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  recording_id uuid not null references public.recordings(id) on delete cascade,
  stage text not null check (stage in ('stage1_transcript','stage2_preview','stage3_full')),
  status text not null default 'queued'
    check (status in ('queued','running','done','failed')),
  artifact jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (recording_id, stage)
);
create index if not exists recording_stages_status_idx on public.recording_stages (status);
create index if not exists recording_stages_org_recording_idx
  on public.recording_stages (org_id, recording_id);

alter table public.recording_stages enable row level security;
drop policy if exists rec_stages_select on public.recording_stages;
create policy rec_stages_select on public.recording_stages
  for select to authenticated using (true);
revoke insert, update, delete on public.recording_stages from authenticated;
