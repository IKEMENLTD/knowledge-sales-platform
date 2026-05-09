-- ============================================================================
-- 0005_auth_sync_trigger.sql
-- Supabase Auth (auth.users) と public.users をプロビジョン同期するトリガー
-- 初回サインアップ時、users 行が存在しなければ作成する。
-- role は招待フローで admin が決めるので default='sales' で仮置き。
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'sales',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
