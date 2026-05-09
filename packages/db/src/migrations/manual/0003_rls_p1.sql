-- ============================================================================
-- 0003_rls_p1.sql
-- 08_security_rls シートのP1ポリシー
-- マトリクス: sales=自分CRUD/他人R, cs=R, manager=CRUD, admin=CRUD
-- ============================================================================

-- すべてのテーブルでRLS有効化
alter table public.users enable row level security;
alter table public.user_oauth_tokens enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_duplicates enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.recordings enable row level security;
alter table public.knowledge_embeddings enable row level security;
alter table public.notifications enable row level security;

-- ----------------------------------------------------------------------------
-- ヘルパー: 現在ユーザーのrole
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in ('manager', 'admin');
$$;

-- ----------------------------------------------------------------------------
-- users
--   SELECT: 認証ユーザー全員 (社員ディレクトリ)
--   UPDATE: self or admin
--   INSERT/DELETE: admin only (実装上はSupabase Auth側からトリガー同期)
-- ----------------------------------------------------------------------------
drop policy if exists users_select_all on public.users;
create policy users_select_all on public.users
  for select to authenticated using (true);

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin')
  with check (id = auth.uid() or public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- user_oauth_tokens — 本人のみ。tokenはVault管理なのでテーブルには参照IDのみ
-- ----------------------------------------------------------------------------
drop policy if exists oauth_tokens_self on public.user_oauth_tokens;
create policy oauth_tokens_self on public.user_oauth_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- companies — 全社員参照可、書込はmanager+
-- ----------------------------------------------------------------------------
drop policy if exists companies_select_all on public.companies;
create policy companies_select_all on public.companies
  for select to authenticated using (true);

drop policy if exists companies_write_manager on public.companies;
create policy companies_write_manager on public.companies
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- INSERT は sales でも自分の名刺取込時に作るので別policy
drop policy if exists companies_insert_authenticated on public.companies;
create policy companies_insert_authenticated on public.companies
  for insert to authenticated with check (true);

-- ----------------------------------------------------------------------------
-- contacts — sales=自分CRUD/他人R, manager+=全CRUD, cs=R
-- ----------------------------------------------------------------------------
drop policy if exists contacts_select_all on public.contacts;
create policy contacts_select_all on public.contacts
  for select to authenticated using (true);

drop policy if exists contacts_insert_self on public.contacts;
create policy contacts_insert_self on public.contacts
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists contacts_update_owner_or_manager on public.contacts;
create policy contacts_update_owner_or_manager on public.contacts
  for update to authenticated
  using (owner_user_id = auth.uid() or public.is_manager_or_admin())
  with check (owner_user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- contact_duplicates — manager+ のみ閲覧/解決
-- ----------------------------------------------------------------------------
drop policy if exists contact_dup_manager on public.contact_duplicates;
create policy contact_dup_manager on public.contact_duplicates
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- ----------------------------------------------------------------------------
-- meetings — owner CRUD, 他人R, manager+ 全CRUD
-- ----------------------------------------------------------------------------
drop policy if exists meetings_select_all on public.meetings;
create policy meetings_select_all on public.meetings
  for select to authenticated using (true);

drop policy if exists meetings_insert_self on public.meetings;
create policy meetings_insert_self on public.meetings
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists meetings_update_owner_or_manager on public.meetings;
create policy meetings_update_owner_or_manager on public.meetings
  for update to authenticated
  using (owner_user_id = auth.uid() or public.is_manager_or_admin())
  with check (owner_user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists meetings_delete_admin on public.meetings;
create policy meetings_delete_admin on public.meetings
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- meeting_attendees — meetings RLS継承
-- ----------------------------------------------------------------------------
drop policy if exists attendees_select_via_meeting on public.meeting_attendees;
create policy attendees_select_via_meeting on public.meeting_attendees
  for select to authenticated using (true);

drop policy if exists attendees_write_meeting_owner on public.meeting_attendees;
create policy attendees_write_meeting_owner on public.meeting_attendees
  for all to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- recordings — 全社共有(SELECTは全員可)、書込はservice_roleのみ(worker側)
-- ----------------------------------------------------------------------------
drop policy if exists recordings_select_all on public.recordings;
create policy recordings_select_all on public.recordings
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE は service_role 経由のみ (RLSバイパス)
-- 担当営業による insights 編集は SECURITY DEFINER RPC 経由で実装する

-- ----------------------------------------------------------------------------
-- knowledge_embeddings — service_role のみ書込、SELECT は match_knowledge RPC経由
--   直接SELECTは禁止 (sensitivity prefilter漏れ防止)
-- ----------------------------------------------------------------------------
-- (デフォルトは全policy未定義=全DENY なので RLS有効化のみで十分)

-- ----------------------------------------------------------------------------
-- notifications — 本人のみ
-- ----------------------------------------------------------------------------
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
