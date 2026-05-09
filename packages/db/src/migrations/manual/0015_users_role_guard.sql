-- ============================================================================
-- 0015_users_role_guard.sql
-- users.role 列の自己昇格防止 (S-C-01)
--
-- BEFORE UPDATE トリガで OLD.role <> NEW.role かつ呼び出し元 role が
-- admin でなければ RAISE EXCEPTION する。
--
-- service_role 経由 (handle_new_auth_user 等) でも auth.uid() が null の場合は
-- system actor 扱いでスキップ (= 許可)。
-- ============================================================================

create or replace function public.guard_users_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role text;
begin
  -- role 列に変更がない場合はそのまま通す
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- service_role / system context (auth.uid() が null) は許可
  if auth.uid() is null then
    return new;
  end if;

  v_actor_role := public.current_user_role();
  if v_actor_role <> 'admin' then
    raise exception 'role change requires admin (actor=%, target=%)', v_actor_role, new.id
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_users_role on public.users;
create trigger guard_users_role
  before update on public.users
  for each row execute function public.guard_users_role_change();
