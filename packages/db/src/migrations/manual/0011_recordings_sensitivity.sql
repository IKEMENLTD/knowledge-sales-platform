-- ============================================================================
-- 0011_recordings_sensitivity.sql
-- recordings に sensitivity 列を追加し、RLS を sensitivity tier prefilter で書き直す。
--
-- 仕様: 25_v2_review_resolutions M-C3 / H3 (CTO)
--   - sensitivity ∈ public / internal / sensitive / restricted
--   - public:     全員参照可
--   - internal:   sales/cs/manager/admin/legal が参照可
--   - sensitive:  manager/admin/legal/owner のみ
--   - restricted: admin/legal のみ
-- ============================================================================

alter table public.recordings
  add column if not exists sensitivity text not null default 'internal'
    check (sensitivity in ('public','internal','sensitive','restricted'));

create index if not exists recordings_org_sensitivity_idx
  on public.recordings (org_id, sensitivity);

-- 既存 recordings_select_all を sensitivity prefilter 版に置き換える
drop policy if exists recordings_select_all on public.recordings;
drop policy if exists recordings_select_tiered on public.recordings;

create policy recordings_select_tiered on public.recordings
  for select to authenticated
  using (
    case sensitivity
      when 'public' then true
      when 'internal' then public.current_user_role() in ('sales','cs','manager','admin','legal')
      when 'sensitive' then
        public.current_user_role() in ('manager','admin','legal')
        or exists (
          select 1 from public.meetings m
          where m.id = meeting_id and m.owner_user_id = auth.uid()
        )
      when 'restricted' then public.current_user_role() in ('admin','legal')
      else false
    end
  );

-- INSERT/UPDATE/DELETE は引き続き service_role のみ (worker 経由)
revoke insert, update, delete on public.recordings from authenticated;

-- ----------------------------------------------------------------------------
-- 削除ポリシー一覧 (A-C-03 への明示的回答):
--   recordings.meeting_id     -> on delete restrict
--     (meeting 削除時 orphan recording を残さない / cascade は consent purge のみ
--      data_deletion_requests 経由で個別実行)
--   meetings.contact_id       -> on delete no action (アプリ層で archive)
--   meetings.owner_user_id    -> on delete no action (退職時は所有権移管 SOP)
--   contacts.owner_user_id    -> on delete no action (同上)
--   recording_segments.recording_id -> on delete cascade
--   recording_stages.recording_id   -> on delete cascade
-- 既適用 0001 で recordings.meeting_id は references のみ (no action 相当)。
-- restrict 化が必要な場合は別途 ALTER TABLE で対応する。
-- ----------------------------------------------------------------------------
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.recordings'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like '%REFERENCES%meetings(id)%';
  if v_constraint is not null then
    execute format(
      'alter table public.recordings drop constraint if exists %I',
      v_constraint
    );
  end if;
  alter table public.recordings
    add constraint recordings_meeting_id_fkey
    foreign key (meeting_id) references public.meetings(id) on delete restrict;
exception when others then
  raise notice 'skip recordings.meeting_id FK update: %', sqlerrm;
end$$;
