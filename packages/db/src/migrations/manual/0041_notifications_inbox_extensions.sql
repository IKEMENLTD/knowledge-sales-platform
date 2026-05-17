-- ============================================================================
-- 0041_notifications_inbox_extensions.sql
--
-- 通知 inbox 実装 + handoff SLA escalate (Round2 P1 cross-cutting G-P0-2 partial)。
--
-- 追加するもの:
--   1. notifications.read_at timestamptz — `is_read` boolean に加え、既読タイミングを
--      保持する。inbox 画面で「24h以内に既読化された通知」を折りたたみで残す等の
--      時系列 UX に必要。既存 is_read=true の行は read_at = now() で backfill する。
--   2. notifications.metadata jsonb — handoff SLA escalate ジョブが
--      `{ escalated_at_48h: ts, escalated_at_72h: ts, originalNotificationId: ... }`
--      を追記するため。任意キーで拡張可。default '{}'。
--
-- handoff SLA worker (apps/worker/src/jobs/handoff-sla.ts) は本 column を参照して
-- 二重 escalate を防ぐ。
--
-- RLS は 0033_org_id_null_fallback の notifications_self が `for all` なので
-- 既存 policy がそのまま read_at / metadata にも適用される。追加変更不要。
-- ============================================================================

alter table public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- backfill: is_read=true の行は read_at に updated_at がなければ created_at を埋める。
-- 二重実行しないよう read_at is null 条件付きで。
update public.notifications
   set read_at = created_at
 where is_read = true
   and read_at is null;

-- 高速 unread 取得用に部分 index を追加 (user_id, read_at null のみ)。
-- 既存 notifications_user_unread_idx は (user_id, is_read) なので冗長ではあるが、
-- inbox SELECT が `read_at IS NULL ORDER BY created_at DESC` の形になるため
-- created_at 降順を含む方を別途用意する。
create index if not exists notifications_unread_by_user_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- handoff_pending の SLA escalate を worker が拾う際の高速化用 index。
-- (type, created_at) で「48h 超過 & metadata->>'escalated_at_48h' IS NULL」を引く。
create index if not exists notifications_handoff_pending_created_idx
  on public.notifications (type, created_at)
  where type = 'handoff_pending' and read_at is null;

-- ============================================================================
-- worker (service_role) が notifications を INSERT する経路向けの権限確認。
-- 既存 RLS notifications_self は authenticated を対象、service_role は bypass 可能
-- なので追加 policy は不要。コメントとしてだけ残す。
-- ============================================================================
-- NOTE: handoff SLA escalate ジョブは supabaseAdmin (service_role) 経由で
--       notifications.insert / update を実行する。RLS bypass で auth.uid()=NULL の
--       trap (TECHSTARS_LMS feedback) を踏まないよう、worker 側で user_id を必ず
--       明示する。
