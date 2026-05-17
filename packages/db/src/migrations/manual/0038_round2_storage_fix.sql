-- ============================================================================
-- 0038_round2_storage_fix.sql
--
-- Phase2 Round1 レビューで CTO/Architect/Security 全員が指摘した CRITICAL:
--   business-cards bucket の path 規約と RLS の不整合。
--
-- 既存 0035 では path = `{org_id}/{contact_id}/{yyyy-mm-dd}/{uuid}.{ext}` を想定したが
-- 実装 (upload-url/route.ts) は `{user_id}/{uuid}.{ext}` 形式。Phase1 で org_id NULL
-- fallback が動いている間は気付かないが、Phase2 multi-tenant cutover の瞬間に全
-- アップロードが 403 になる。
--
-- 対応:
--   path 先頭セグメントが auth.uid() と一致するか、もしくは public.users から
--   user.org_id を解決して current_org_id() と一致するか、どちらかをチェック。
--   Phase1 はシングルテナント前提のため `auth.uid()` 一致だけで十分。
--   Phase2 cutover 時にこの policy を再強化する。
-- ============================================================================

-- helper: storage path 先頭セグメントを user_id として抽出
create or replace function public.storage_object_user_id(name text)
returns uuid
language sql
immutable
parallel safe
as $$
  select case
    when name is null then null
    when position('/' in name) = 0 then null
    else nullif(split_part(name, '/', 1), '')::uuid
  end
$$;

-- RLS を再生成 (path 先頭 = auth.uid() を主、org_id を補完チェックに)
drop policy if exists business_cards_select on storage.objects;
create policy business_cards_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-cards'
    and (
      -- 自分が owner ならOK (storage.objects.owner は INSERT 時 auth.uid())
      owner = auth.uid()
      -- もしくは path 先頭が自分の user_id
      or public.storage_object_user_id(name) = auth.uid()
      -- Phase2 multi-tenant: org_id check (現状 0033 fallback で常に true)
      or public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
  );

drop policy if exists business_cards_insert on storage.objects;
create policy business_cards_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-cards'
    and owner = auth.uid()
    -- path 先頭は自分の user_id (Phase1 単純化)
    and public.storage_object_user_id(name) = auth.uid()
  );

drop policy if exists business_cards_update on storage.objects;
create policy business_cards_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-cards'
    and (owner = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    bucket_id = 'business-cards'
  );

drop policy if exists business_cards_delete on storage.objects;
create policy business_cards_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-cards'
    and (owner = auth.uid() or public.is_manager_or_admin())
  );
