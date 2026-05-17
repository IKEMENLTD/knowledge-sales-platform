-- ============================================================================
-- 0036_meetings_phase2.sql
--
-- 商談機能 (T-014) 拡張。
--   - meetings.next_action: 「次の一手」を構造化保存 (UI 表示用)
--   - meetings.win_probability: 勝率予測 (0..1)
--   - meetings.deleted_at: soft delete
--   - meeting_stage_transitions: ステージ遷移の audit
--     who/when/from/to を残し、滞留時間分析に使う
-- ============================================================================

alter table public.meetings
  add column if not exists next_action text;

alter table public.meetings
  add column if not exists win_probability numeric(3, 2)
    check (win_probability is null or (win_probability >= 0 and win_probability <= 1));

alter table public.meetings
  add column if not exists deleted_at timestamptz;

-- ----- stage transition audit -----
create table if not exists public.meeting_stage_transitions (
  org_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  changed_by_user_id uuid not null references public.users(id),
  from_stage text,
  to_stage text not null,
  from_deal_status text,
  to_deal_status text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists meeting_stage_transitions_meeting_idx
  on public.meeting_stage_transitions(meeting_id);
create index if not exists meeting_stage_transitions_org_idx
  on public.meeting_stage_transitions(org_id);

alter table public.meeting_stage_transitions enable row level security;

drop policy if exists meeting_stage_transitions_select on public.meeting_stage_transitions;
create policy meeting_stage_transitions_select on public.meeting_stage_transitions
  for select to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

drop policy if exists meeting_stage_transitions_insert on public.meeting_stage_transitions;
create policy meeting_stage_transitions_insert on public.meeting_stage_transitions
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and changed_by_user_id = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

-- 監査表は append-only。UPDATE/DELETE 不可。
drop policy if exists meeting_stage_transitions_no_update on public.meeting_stage_transitions;
create policy meeting_stage_transitions_no_update on public.meeting_stage_transitions
  for update to authenticated using (false) with check (false);

drop policy if exists meeting_stage_transitions_no_delete on public.meeting_stage_transitions;
create policy meeting_stage_transitions_no_delete on public.meeting_stage_transitions
  for delete to authenticated using (false);

-- soft-delete 除外 RLS
drop policy if exists meetings_select_exclude_deleted on public.meetings;
create policy meetings_select_exclude_deleted on public.meetings
  for select to authenticated
  using (
    deleted_at is null
    or public.current_user_role() = 'admin'
  );
