-- ============================================================================
-- 0024_user_handedness.sql
-- users.handedness 列追加 (P1 — 17_offline_mobile v2.3 で P0 から昇格して P1 化)
--
-- モバイル UI で右手/左手モード切替を提供するためのユーザー設定。
-- - 'auto'  : OS / 端末から推定 (default)
-- - 'left'  : 左手モード (FAB 左下、戻る矢印が右にも複製)
-- - 'right' : 右手モード (標準)
-- ============================================================================

alter table public.users
  add column if not exists handedness text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_handedness_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_handedness_check
      check (handedness in ('left','right','auto'));
  end if;
end$$;

comment on column public.users.handedness is
  'P1 (17_offline_mobile v2.3): モバイル UI 利き手モード (left/right/auto). default=auto';
