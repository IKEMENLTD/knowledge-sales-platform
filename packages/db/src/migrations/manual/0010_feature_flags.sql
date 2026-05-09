-- ============================================================================
-- 0010_feature_flags.sql
-- feature_flags + ab_test_assignments
-- 仕様: 22_feature_flags_ab / 08_security_rls (admin write / 全員 SELECT)
-- ============================================================================

create table if not exists public.feature_flags (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  key text not null,
  enabled boolean not null default false,
  percentage integer not null default 0
    check (percentage >= 0 and percentage <= 100),
  allowlist uuid[] not null default '{}'::uuid[],
  blocklist uuid[] not null default '{}'::uuid[],
  description text,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);
create unique index if not exists feature_flags_org_key_uq on public.feature_flags (org_id, key);

alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all on public.feature_flags
  for select to authenticated using (true);
drop policy if exists feature_flags_write_admin on public.feature_flags;
create policy feature_flags_write_admin on public.feature_flags
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- ab_test_assignments
-- ----------------------------------------------------------------------------
create table if not exists public.ab_test_assignments (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  variant text not null,
  assigned_at timestamptz not null default now()
);
create unique index if not exists ab_test_assignments_user_experiment_uq
  on public.ab_test_assignments (experiment_key, user_id);
create index if not exists ab_test_assignments_experiment_idx
  on public.ab_test_assignments (experiment_key);

alter table public.ab_test_assignments enable row level security;
drop policy if exists ab_select_self_or_admin on public.ab_test_assignments;
create policy ab_select_self_or_admin on public.ab_test_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');
drop policy if exists ab_write_admin on public.ab_test_assignments;
create policy ab_write_admin on public.ab_test_assignments
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
