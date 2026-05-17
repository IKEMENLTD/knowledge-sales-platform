-- ============================================================================
-- 0035_storage_business_cards.sql
--
-- 名刺画像保管用の Supabase Storage バケット `business-cards` を作成し、RLS で
-- org_id プレフィックス分離を強制する。
--
-- バケット仕様:
--   - private (public = false): URL 直叩き不可
--   - file_size_limit: 10 MiB (10 * 1024 * 1024)
--   - allowed_mime_types: image/jpeg, image/png, image/webp, image/heic
--   - 命名規約: `{org_id}/{contact_id}/{yyyy-mm-dd}/{uuid}.{ext}`
--                          ^ RLS check は path 先頭の org_id を auth.uid() の users.org_id と照合
--
-- 注意:
--   - Supabase の storage.objects テーブルは Postgres の table なので RLS が直接適用可能
--   - 実運用での upload は web 側で signed URL を発行 → クライアント直 PUT する想定
-- ============================================================================

-- ----- bucket -----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-cards',
  'business-cards',
  false,
  10485760, -- 10 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- ----- helper: storage object path の先頭 segment を org_id として抽出 -----
-- name 列は 'orgid/contactid/yyyy-mm-dd/uuid.jpg' 形式を想定。
create or replace function public.storage_object_org_id(name text)
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

-- ----- RLS policies -----
-- 同名 policy が既にあれば作り直し (idempotent migration)。
drop policy if exists business_cards_select on storage.objects;
create policy business_cards_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-cards'
    and (
      public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
  );

drop policy if exists business_cards_insert on storage.objects;
create policy business_cards_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-cards'
    and (
      public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
    -- ownership: 自分の path にのみアップロード可能 (auth.uid() を 2 階層目に置く運用も可)
    and owner = auth.uid()
  );

drop policy if exists business_cards_update on storage.objects;
create policy business_cards_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-cards'
    and (
      public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
    and (owner = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    bucket_id = 'business-cards'
    and (
      public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
  );

drop policy if exists business_cards_delete on storage.objects;
create policy business_cards_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-cards'
    and (
      public.current_org_id() is null
      or public.storage_object_org_id(name) = public.current_org_id()
    )
    and (owner = auth.uid() or public.is_manager_or_admin())
  );
