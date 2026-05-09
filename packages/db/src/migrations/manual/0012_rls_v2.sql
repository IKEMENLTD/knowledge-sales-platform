-- ============================================================================
-- 0012_rls_v2.sql
-- 0003_rls_p1.sql の policy を drop → org_id 統一版で再作成。
--
-- 主な変更点:
--   - current_user_role() / is_manager_or_admin() を SECURITY DEFINER + search_path 固定で再定義
--   - current_org_id() ヘルパー追加 (current_setting('app.org_id', true)::uuid を吸収)
--   - 全 policy 句に (org_id = public.current_org_id()) prefilter を追加
--   - users の role 列自己昇格を policy + 0015 の trigger で多重防御
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ヘルパー関数 (SECURITY DEFINER + search_path 固定)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_user_role() in ('manager','admin','legal');
$$;

-- current_org_id():
--   - app.org_id GUC が設定されていればそれを返す (P2 マルチテナント運用用)。
--   - 未設定なら DEFAULT_ORG_ID (P1 シングルテナント) を返す。
create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := current_setting('app.org_id', true);
  if v is null or v = '' then
    return '00000000-0000-0000-0000-000000000001'::uuid;
  end if;
  return v::uuid;
exception when others then
  return '00000000-0000-0000-0000-000000000001'::uuid;
end;
$$;

-- ----------------------------------------------------------------------------
-- users
--   SELECT: 同 org の認証ユーザー
--   UPDATE: self (role 以外) or admin
--     -> role 列の自己昇格は 0015_users_role_guard.sql の BEFORE UPDATE trigger で
--        二重防御する (RLS では列レベルを表現できないため)
--   INSERT/DELETE: admin only
-- ----------------------------------------------------------------------------
drop policy if exists users_select_all on public.users;
create policy users_select_all on public.users
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (id = auth.uid() or public.current_user_role() = 'admin')
  )
  with check (
    org_id = public.current_org_id()
    and (id = auth.uid() or public.current_user_role() = 'admin')
  );

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- user_oauth_tokens
-- ----------------------------------------------------------------------------
drop policy if exists oauth_tokens_self on public.user_oauth_tokens;
create policy oauth_tokens_self on public.user_oauth_tokens
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
  )
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
drop policy if exists companies_select_all on public.companies;
create policy companies_select_all on public.companies
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists companies_write_manager on public.companies;
create policy companies_write_manager on public.companies
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.is_manager_or_admin()
  )
  with check (
    org_id = public.current_org_id()
    and public.is_manager_or_admin()
  );

drop policy if exists companies_insert_authenticated on public.companies;
create policy companies_insert_authenticated on public.companies
  for insert to authenticated
  with check (org_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------------------
drop policy if exists contacts_select_all on public.contacts;
create policy contacts_select_all on public.contacts
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists contacts_insert_self on public.contacts;
create policy contacts_insert_self on public.contacts
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and owner_user_id = auth.uid()
  );

drop policy if exists contacts_update_owner_or_manager on public.contacts;
create policy contacts_update_owner_or_manager on public.contacts
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    org_id = public.current_org_id()
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- contact_duplicates
-- ----------------------------------------------------------------------------
drop policy if exists contact_dup_manager on public.contact_duplicates;
create policy contact_dup_manager on public.contact_duplicates
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.is_manager_or_admin()
  )
  with check (
    org_id = public.current_org_id()
    and public.is_manager_or_admin()
  );

-- ----------------------------------------------------------------------------
-- meetings
-- ----------------------------------------------------------------------------
drop policy if exists meetings_select_all on public.meetings;
create policy meetings_select_all on public.meetings
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists meetings_insert_self on public.meetings;
create policy meetings_insert_self on public.meetings
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and owner_user_id = auth.uid()
  );

drop policy if exists meetings_update_owner_or_manager on public.meetings;
create policy meetings_update_owner_or_manager on public.meetings
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    org_id = public.current_org_id()
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists meetings_delete_admin on public.meetings;
create policy meetings_delete_admin on public.meetings
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- meeting_attendees
-- ----------------------------------------------------------------------------
drop policy if exists attendees_select_via_meeting on public.meeting_attendees;
create policy attendees_select_via_meeting on public.meeting_attendees
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists attendees_write_meeting_owner on public.meeting_attendees;
create policy attendees_write_meeting_owner on public.meeting_attendees
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  )
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- recordings は 0011_recordings_sensitivity.sql で sensitivity tier 適用済
-- ここでは org prefilter を追加する形で 0011 の policy を上書き
-- ----------------------------------------------------------------------------
drop policy if exists recordings_select_tiered on public.recordings;
create policy recordings_select_tiered on public.recordings
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
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
    )
  );

-- ----------------------------------------------------------------------------
-- knowledge_embeddings — 直接アクセス完全禁止 (RPC 経由のみ)
-- ----------------------------------------------------------------------------
revoke select on public.knowledge_embeddings from authenticated, anon;

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
  )
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
  );
