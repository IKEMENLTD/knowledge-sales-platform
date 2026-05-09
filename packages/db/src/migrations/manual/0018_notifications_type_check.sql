-- ============================================================================
-- 0018_notifications_type_check.sql
-- notifications.type に CHECK 制約を追加 (A2-H-01)
--
-- A-H-03 で Drizzle 側 (notifications.ts) は enum 化済だが SQL CHECK 不在のため
-- worker の直接 INSERT で typo が混入する。`@ksp/shared/constants` の
-- notificationType と一致させる形で SQL CHECK を冪等追加。
--
-- 値リストは shared/constants.ts notificationType と source of truth が同じ:
--   recording_ready, reply_received, handoff_pending, sync_failed,
--   mention, admin_action
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in (
        'recording_ready',
        'reply_received',
        'handoff_pending',
        'sync_failed',
        'mention',
        'admin_action'
      ));
  end if;
end$$;
