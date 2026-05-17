-- ============================================================================
-- 0042_share_links_clip_columns.sql
-- share_links に SC-46 (録画クリップ共有) に必要な追加列を足す。
--
-- 既存 0022 が定義しているのは「共有リンク汎用」までで、録画クリップ用の
-- 開始/終了秒・閲覧回数上限・revoke 時刻が無かった。Round2 P1 で SC-46 を
-- 実装するに当たり、後方互換 (既存列に手を入れない) を保ったまま列追加のみ行う。
--
-- 既存 RLS (0022 の owner / manager / admin / legal) はそのまま継承される。
-- 公開検証経路は service_role 経由の lookup (apps/web/src/app/api/share-links/[code])
-- で実装するため、本 migration では SECURITY DEFINER RPC は追加しない。
-- ============================================================================

alter table public.share_links
  add column if not exists start_sec integer,
  add column if not exists end_sec integer,
  add column if not exists view_count_cap integer,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists revoked_at timestamptz;

-- 開始 < 終了 を CHECK で担保 (両方 NULL は許可 = 録画全体共有 ケース)
alter table public.share_links
  drop constraint if exists share_links_clip_range_check;
alter table public.share_links
  add constraint share_links_clip_range_check
  check (
    (start_sec is null and end_sec is null)
    or (start_sec is not null and end_sec is not null and end_sec > start_sec and start_sec >= 0)
  );

-- view_count_cap は 1..100 (NULL = 無制限)
alter table public.share_links
  drop constraint if exists share_links_view_count_cap_range;
alter table public.share_links
  add constraint share_links_view_count_cap_range
  check (view_count_cap is null or (view_count_cap between 1 and 100));

create index if not exists share_links_active_idx
  on public.share_links (org_id, resource_id)
  where revoked_at is null;

comment on column public.share_links.start_sec is
  'クリップ開始秒 (録画全体共有なら NULL)。SC-46 (録画切出共有) で使用';
comment on column public.share_links.end_sec is
  'クリップ終了秒 (録画全体共有なら NULL)。end_sec > start_sec を CHECK で担保';
comment on column public.share_links.view_count_cap is
  '閲覧回数上限 (NULL = 無制限)。click_count >= view_count_cap で 410 Gone';
comment on column public.share_links.last_accessed_at is
  '直近アクセス時刻。GET /api/share-links/[code] で UPDATE';
comment on column public.share_links.revoked_at is
  '失効時刻 (NULL = 有効)。DELETE /api/share-links/[code] (UUID 渡し) で UPDATE';
