-- ============================================================================
-- 0034_contacts_phase2.sql
--
-- 名刺取込パイプライン (T-007 〜 T-010) で必要となる contacts 列・index・enum を追加。
--
-- 追加項目:
--   - review_status: OCR/レビュー段階の状態 (sales funnel の `status` とは独立)
--   - business_card_image_hash: 同一画像の重複アップロード検知 (SHA-256 hex)
--   - captured_at: 実撮影/取込時刻 (created_at は DB row 生成、これは画像取得時)
--   - created_by_user_id: 「誰が取り込んだか」 (owner_user_id は担当営業、別概念)
--   - deleted_at: soft delete (RLS は別 migration で追加予定、ここは列のみ)
--   - normalized_email / normalized_phone: 正規化済キャッシュ (重複検知の決定性確保)
--
-- インデックス:
--   - (org_id, lower(email)) の partial unique (重複登録防止、deleted/null 除外)
--   - (org_id, business_card_image_hash) の partial unique (同一画像 dedupe)
--   - normalized_email / normalized_phone 上の通常 index (dedupe スキャン高速化)
--
-- 既存 RLS / CHECK は破壊しない (additive only)。
-- ============================================================================

-- ----- columns -----
alter table public.contacts
  add column if not exists review_status text
    check (review_status in (
      'pending_ocr',
      'pending_review',
      'duplicate_suspect',
      'verified',
      'merged'
    ))
    default 'pending_ocr';

alter table public.contacts
  add column if not exists business_card_image_hash text;

alter table public.contacts
  add column if not exists captured_at timestamptz;

alter table public.contacts
  add column if not exists created_by_user_id uuid references public.users(id);

alter table public.contacts
  add column if not exists deleted_at timestamptz;

alter table public.contacts
  add column if not exists normalized_email text;

alter table public.contacts
  add column if not exists normalized_phone text;

-- ----- backfill (best-effort) -----
-- 既存行の review_status が NULL なら verified 扱い (Phase1 までは手入力前提)。
update public.contacts
  set review_status = 'verified'
  where review_status is null;

-- 既存行の captured_at が NULL なら created_at で埋める。
update public.contacts
  set captured_at = created_at
  where captured_at is null;

-- 既存 email / phone を最低限の正規化 (lower / trim) で埋める。
-- フル正規化 (NFKC・libphonenumber) は worker 側で実施。
update public.contacts
  set normalized_email = lower(btrim(email))
  where email is not null and normalized_email is null;

update public.contacts
  set normalized_phone = regexp_replace(phone, '[^0-9+]', '', 'g')
  where phone is not null and normalized_phone is null;

-- ----- indexes (partial unique で soft-delete 行を除外) -----
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contacts_org_email_unique'
  ) then
    create unique index contacts_org_email_unique
      on public.contacts (org_id, lower(email))
      where email is not null and deleted_at is null;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contacts_org_image_hash_unique'
  ) then
    create unique index contacts_org_image_hash_unique
      on public.contacts (org_id, business_card_image_hash)
      where business_card_image_hash is not null and deleted_at is null;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contacts_review_status_idx'
  ) then
    create index contacts_review_status_idx
      on public.contacts (org_id, review_status)
      where deleted_at is null;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contacts_normalized_email_idx'
  ) then
    create index contacts_normalized_email_idx
      on public.contacts (org_id, normalized_email)
      where normalized_email is not null and deleted_at is null;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contacts_normalized_phone_idx'
  ) then
    create index contacts_normalized_phone_idx
      on public.contacts (org_id, normalized_phone)
      where normalized_phone is not null and deleted_at is null;
  end if;
end$$;

-- ----- RLS: soft-delete 行を SELECT から除外 -----
-- 既存 contacts_select_org / contacts_select_visibility 等は org_id ベースのため、
-- ここでは deleted_at is null の保護ポリシーを追加で被せる (deny override)。
-- 設計判断: deleted_at is not null を明示的に admin だけが SELECT 可能にする。
drop policy if exists contacts_select_exclude_deleted on public.contacts;
create policy contacts_select_exclude_deleted on public.contacts
  for select to authenticated
  using (
    deleted_at is null
    or public.current_user_role() = 'admin'
  );
