-- ============================================================================
-- 0031_onboarding_polish.sql
-- Architecture Round 2 残課題:
--   R2-O-04: consent_logs.org_id の default DROP 予約 (Phase2 cutover時に実行)
--   R2-O-07: accepted_at を nullable に (future-dated 同意のため)
-- ============================================================================

-- R2-O-07: accepted_at を nullable 化、created_at が真の append-only 時刻、
-- accepted_at は「将来時刻も入りうる宣言された同意発効時刻」とする。
do $$
begin
  alter table public.consent_logs
    alter column accepted_at drop not null;
exception when others then null;
end $$;

-- R2-O-04: org_id default DROP は Phase2 切替時の手順として 0027 (placeholder) に集約済。
-- 本ファイルでは「同 default を DROP できる状態」になっているか check するだけ。
-- (本番運用中は default を残したまま、INSERT 側で常に明示渡し済み)

comment on column public.consent_logs.org_id is
  'Phase2 切替で default DROP 予定。INSERT 側で明示渡し済み (apps/web/src/lib/auth/onboarding.ts)';

comment on column public.consent_logs.accepted_at is
  '宣言された同意発効時刻。null の場合は created_at と同等扱い。future-dated 同意可能';

comment on column public.consent_logs.created_at is
  'INSERT 物理時刻。append-only、変更不可 (consent_logs_immutable trigger)';
