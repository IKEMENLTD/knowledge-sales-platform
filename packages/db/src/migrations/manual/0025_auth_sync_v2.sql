-- ============================================================================
-- 0025_auth_sync_v2.sql
-- handle_new_auth_user() v2 — is_active default false (A2-H-02 / A-M-02)
--
-- 旧 0005_auth_sync_trigger.sql は `is_active=true, role='sales'` で自動付与して
-- いたため、`signInWithOAuth` 直接呼び出し (= 招待トークンなし) で全員が sales
-- 権限を獲得していた。本 migration では既適用済 0005 を変更せず CREATE OR
-- REPLACE FUNCTION で v2 に上書きする。
--
-- 仕様:
--   - 新規 auth.users が作成された時点で public.users 行を作るが、
--     `is_active = false` で作成し、admin が招待 SOP を踏むまで RLS でブロック。
--   - role は default 'sales' のまま (招待 flow で admin が変更)。
--   - raw_user_meta_data->>'invited_by' が UUID として有効なら is_active=true で作成
--     (内部招待 flow を経由した場合のショートカット)。
--
-- NOTE: RLS 側が (is_active = false) を deny する policy はまだ無い。
--       次の migration ラウンドで `users_select_active_only` を追加し、
--       0012_rls_v2.sql の policy に `and is_active = true` を増やす予定。
--       本 migration では最小単位の trigger 上書きのみ。
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited_by uuid;
  v_is_active  boolean;
begin
  -- raw_user_meta_data->>'invited_by' が UUID として有効ならアクティブ初期化
  begin
    v_invited_by := nullif(new.raw_user_meta_data->>'invited_by', '')::uuid;
  exception when others then
    v_invited_by := null;
  end;

  v_is_active := v_invited_by is not null;

  insert into public.users (id, email, name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'sales',
    v_is_active
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- trigger 自体は 0005 で既に作成済。ここでは関数本体のみ差し替えるため
-- drop trigger は呼ばない (idempotent)。
comment on function public.handle_new_auth_user() is
  'A2-H-02 / A-M-02 対応 v2: invited_by が無い OAuth 直接サインアップは is_active=false で'
  '作成し、admin による招待 SOP 完了後に is_active=true へ切替える。';
