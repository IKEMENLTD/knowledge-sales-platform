-- ============================================================================
-- 0029_consent_logs.sql
-- 19_onboarding_initial / 16_compliance_legal — 利用規約・プライバシーポリシー
-- 等の同意ログ。append-only で audit_logs と同じく改ざん不可な証跡として残す。
-- ============================================================================

-- users にオンボード進捗の中間カラムを追加
alter table public.users
  add column if not exists terms_consented_at  timestamptz,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists calendar_connected_at timestamptz,
  add column if not exists sample_data_loaded_at timestamptz;

-- consent_logs テーブル本体
create table if not exists public.consent_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  user_id       uuid not null references public.users(id) on delete cascade,
  consent_type  text not null check (consent_type in (
                  'terms_of_service',
                  'privacy_policy',
                  'data_processing',
                  'marketing_communications',
                  'recording_consent'
                )),
  version       text not null,
  content_hash  text not null,         -- 規約本文の sha256 (改版検知)
  accepted_at   timestamptz not null default now(),
  withdrawn_at  timestamptz,           -- 撤回時刻 (撤回されたら append-only で別 row でなく時刻のみ更新)
  ip_address    inet,
  user_agent    text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists consent_logs_user_type_idx
  on public.consent_logs (user_id, consent_type, accepted_at desc);
create index if not exists consent_logs_org_idx
  on public.consent_logs (org_id);

-- RLS: 自分の同意ログのみ閲覧可、admin/legal は全件参照可
alter table public.consent_logs enable row level security;

drop policy if exists consent_logs_self_select on public.consent_logs;
create policy consent_logs_self_select on public.consent_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('admin','legal')
  );

drop policy if exists consent_logs_self_insert on public.consent_logs;
create policy consent_logs_self_insert on public.consent_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- UPDATE は撤回 (withdrawn_at) のみ許可 — それ以外の列は変更不可
drop policy if exists consent_logs_self_withdraw on public.consent_logs;
create policy consent_logs_self_withdraw on public.consent_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE は禁止 (append-only)
revoke delete on public.consent_logs from authenticated, anon;

-- 規約本文の改ざん検知用の content_hash を強制 (空文字禁止)
do $$
begin
  alter table public.consent_logs
    add constraint consent_logs_content_hash_nonempty
    check (length(content_hash) >= 32);
exception when duplicate_object then null;
end $$;
