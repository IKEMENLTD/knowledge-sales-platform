-- ============================================================================
-- 0028_users_onboarded_at.sql
-- 19_onboarding_initial: ユーザのオンボーディング完了時刻を記録する。
-- 既存ユーザは default now() で「オンボーディング済」として扱う。
-- 新規 auth.users 同期時 (0025_auth_sync_v2) は明示的に NULL を入れて
-- /onboarding 画面を踏ませる。
-- ============================================================================

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- 既存行 (テスト用1件含む) は now() で「完了済」扱い
update public.users set onboarded_at = now() where onboarded_at is null;

-- handle_new_auth_user 関数を更新: 新規ユーザは onboarded_at = NULL
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited_raw text;
  v_is_invited  boolean := false;
begin
  v_invited_raw := nullif(new.raw_user_meta_data ->> 'invited_by', '');
  if v_invited_raw is not null then
    begin
      perform v_invited_raw::uuid;
      v_is_invited := true;
    exception when others then
      v_is_invited := false;
    end;
  end if;

  insert into public.users (id, email, name, role, is_active, onboarded_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name',
             new.raw_user_meta_data ->> 'full_name',
             split_part(new.email, '@', 1)),
    'sales',
    v_is_invited,        -- invite 経由なら即 active、自己サインアップは pending
    null                 -- /onboarding を必ず一度通す
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
