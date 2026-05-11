-- ============================================================================
-- 0033_org_id_null_fallback.sql
--
-- Phase1 シングルテナント運用で app.org_id GUC を middleware 未 SET の状態で動かす
-- ため、全 RLS policy の `org_id = current_org_id()` 述語に NULL fallback を加え、
-- current_org_id() が NULL のとき (= GUC 未設定) は org check をスキップする。
--
-- Phase2 cutover 時に 0027_phase2_chain_partition_placeholder.sql の手順で全テーブル
-- default DROP + middleware で SET LOCAL app.org_id を強制した上で、この fallback を
-- DROP すれば本来の strict policy に戻る。
--
-- 影響テーブル:
--   users (UPDATE のみ。SELECT は 0032 で対応済)
--   companies (SELECT/INSERT/ALL)
--   contacts (INSERT/UPDATE/DELETE)
--   contact_duplicates (ALL)
--   meetings (INSERT/UPDATE/DELETE)
--   meeting_attendees (SELECT/ALL)
--   notifications (ALL)
--   share_links (SELECT/INSERT/UPDATE/DELETE)
--   sample_data_seeds (SELECT only。INSERT は 0030 で applied_by 経由)
--   user_oauth_tokens (ALL)
-- ============================================================================

-- helper: current_org_id() を null-safe にラップした expression は
-- `(public.current_org_id() is null or org_id = public.current_org_id())` で統一する。

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (id = auth.uid() or public.current_user_role() = 'admin')
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (id = auth.uid() or public.current_user_role() = 'admin')
  );

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
drop policy if exists companies_select_all on public.companies;
create policy companies_select_all on public.companies
  for select to authenticated
  using (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists companies_insert_authenticated on public.companies;
create policy companies_insert_authenticated on public.companies
  for insert to authenticated
  with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists companies_write_manager on public.companies;
create policy companies_write_manager on public.companies
  for all to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.is_manager_or_admin()
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.is_manager_or_admin()
  );

-- ----------------------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------------------
drop policy if exists contacts_insert_self on public.contacts;
create policy contacts_insert_self on public.contacts
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and owner_user_id = auth.uid()
  );

drop policy if exists contacts_update_owner_or_manager on public.contacts;
create policy contacts_update_owner_or_manager on public.contacts
  for update to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.current_user_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- contact_duplicates
-- ----------------------------------------------------------------------------
drop policy if exists contact_dup_manager on public.contact_duplicates;
create policy contact_dup_manager on public.contact_duplicates
  for all to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.is_manager_or_admin()
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.is_manager_or_admin()
  );

-- ----------------------------------------------------------------------------
-- meetings
-- ----------------------------------------------------------------------------
drop policy if exists meetings_insert_self on public.meetings;
create policy meetings_insert_self on public.meetings
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and owner_user_id = auth.uid()
  );

drop policy if exists meetings_update_owner_or_manager on public.meetings;
create policy meetings_update_owner_or_manager on public.meetings
  for update to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (owner_user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists meetings_delete_admin on public.meetings;
create policy meetings_delete_admin on public.meetings
  for delete to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.current_user_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- meeting_attendees (SELECT は 0032 で部分対応、ALL/INSERT は未)
-- ----------------------------------------------------------------------------
drop policy if exists attendees_select_via_meeting on public.meeting_attendees;
-- meetings_attendees_select は 0032 で fallback 対応済なので残す
drop policy if exists attendees_write_meeting_owner on public.meeting_attendees;
create policy attendees_write_meeting_owner on public.meeting_attendees
  for all to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and (m.owner_user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications
  for all to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- share_links
-- ----------------------------------------------------------------------------
drop policy if exists share_links_select_owner on public.share_links;
create policy share_links_select_owner on public.share_links
  for select to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists share_links_insert_creator on public.share_links;
create policy share_links_insert_creator on public.share_links
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and created_by = auth.uid()
  );

drop policy if exists share_links_update_owner on public.share_links;
create policy share_links_update_owner on public.share_links
  for update to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (created_by = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists share_links_delete_owner on public.share_links;
create policy share_links_delete_owner on public.share_links
  for delete to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

-- ----------------------------------------------------------------------------
-- sample_data_seeds (SELECT のみ。INSERT は 0030 で applied_by ベース)
-- ----------------------------------------------------------------------------
drop policy if exists sample_data_seeds_select_admin on public.sample_data_seeds;
create policy sample_data_seeds_select_admin on public.sample_data_seeds
  for select to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and public.current_user_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- user_oauth_tokens
-- ----------------------------------------------------------------------------
drop policy if exists oauth_tokens_self on public.user_oauth_tokens;
create policy oauth_tokens_self on public.user_oauth_tokens
  for all to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  )
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 0030 で追加した sample_data_seeds_self_insert は既に org_id を users から
-- subselect しているので影響なし。
-- ----------------------------------------------------------------------------
