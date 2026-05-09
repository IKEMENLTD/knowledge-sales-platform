-- ============================================================================
-- 0021_sample_data_seeds.sql
-- sample_data_seeds (A2-M-03 / 設計書 03_data_model 行439 / P1)
--
-- 19_onboarding_initial 「初回ログイン体験用サンプルデータ」適用履歴を保持する。
-- 同一 seed_kind を二重適用しないため (org_id, seed_kind) UNIQUE。
-- 適用元は admin の手動投入 + onboarding GAS のいずれかで、いずれにしても
-- service_role 経由のため authenticated は読み取りのみ (admin) を想定。
-- ============================================================================

create table if not exists public.sample_data_seeds (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  seed_kind text not null,
  payload jsonb,
  applied_by uuid references public.users(id),
  applied_at timestamptz not null default now()
);

create unique index if not exists sample_data_seeds_org_kind_uq
  on public.sample_data_seeds (org_id, seed_kind);
create index if not exists sample_data_seeds_applied_idx
  on public.sample_data_seeds (applied_at desc);

alter table public.sample_data_seeds enable row level security;

drop policy if exists sample_data_seeds_select_admin on public.sample_data_seeds;
create policy sample_data_seeds_select_admin on public.sample_data_seeds
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() = 'admin'
  );

-- INSERT/UPDATE/DELETE は service_role 経由のみ (admin が CLI から実行)
revoke insert, update, delete on public.sample_data_seeds from authenticated, anon;

comment on table public.sample_data_seeds is
  'A2-M-03: P1 onboarding 用サンプルデータ適用履歴 (idempotency: org_id+seed_kind UNIQUE)';
