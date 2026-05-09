-- ============================================================================
-- 0022_share_links.sql
-- share_links (S-M-06 / L-6 / 設計書 08_security_rls)
--
-- 仕様 (08_security_rls 「share_links token = sha256でDB保存、URLのみ平文 / P1」):
--   - URL に乗せるトークンは平文。DB には sha256 ハッシュのみ保存
--   - クリップ単位で expires_at / ip_allowlist / audience / watermark_email
--   - パスワード保護対応 (argon2id 想定の password_hash 列)
--   - クリック数 / IP root の追跡列を持つ
--
-- RLS:
--   - 自分が作成した share_link は SELECT/UPDATE/DELETE 可
--   - 公開 token 検証は service_role 経由の RPC (本 migration ではテーブルのみ
--     先置き)
-- ============================================================================

create table if not exists public.share_links (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in (
    'recording',
    'recording_clip',
    'meeting_notes',
    'knowledge_item',
    'handoff'
  )),
  resource_id uuid not null,
  -- URL に載せる平文 token は sha256 化して保存。比較は SHA256 ハッシュ同士で行う
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  ip_allowlist inet[],
  audience text,
  watermark_email text,
  -- 共有経由のクリック追跡: audit_logs.id へ root を貼る
  click_log_id_root uuid,
  password_hash text,
  click_count integer not null default 0,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists share_links_resource_idx
  on public.share_links (resource_type, resource_id);
create index if not exists share_links_creator_idx
  on public.share_links (created_by);
create index if not exists share_links_org_created_idx
  on public.share_links (org_id, created_at desc);
create index if not exists share_links_expires_idx
  on public.share_links (expires_at);

alter table public.share_links enable row level security;

-- 作成者本人 / manager / admin / legal が自分の orgs の link を CRUD 可能
drop policy if exists share_links_select_owner on public.share_links;
create policy share_links_select_owner on public.share_links
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists share_links_insert_creator on public.share_links;
create policy share_links_insert_creator on public.share_links
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
  );

drop policy if exists share_links_update_owner on public.share_links;
create policy share_links_update_owner on public.share_links
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (created_by = auth.uid() or public.is_manager_or_admin())
  )
  with check (
    org_id = public.current_org_id()
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists share_links_delete_owner on public.share_links;
create policy share_links_delete_owner on public.share_links
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and (created_by = auth.uid() or public.is_manager_or_admin())
  );

-- 公開 token 検証 (anon / authenticated) は SECURITY DEFINER RPC を別途用意して
-- token sha256 比較 + expires_at + IP allowlist + password で gate する。
-- 本 migration では direct SELECT を anon/authenticated に与えない。
revoke select, insert, update, delete on public.share_links from anon;

comment on table public.share_links is
  'L-6 / S-M-06: 共有リンク。URL のみ平文、DB には sha256 ハッシュ保存。'
  ' 公開検証は SECURITY DEFINER RPC 経由のみ。';
comment on column public.share_links.token_sha256 is
  'sha256(plain_token, hex). plain_token は URL のみで保存しない (S-M-06)';
comment on column public.share_links.password_hash is
  'argon2id ハッシュ (web 側で argon2id で hash → 検証は RPC 内で同一ハッシュ比較)';
