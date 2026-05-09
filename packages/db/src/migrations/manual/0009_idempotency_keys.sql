-- ============================================================================
-- 0009_idempotency_keys.sql
-- Idempotency-Key middleware の保存先 (T-5) + jobs_inflight (T-3)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- idempotency_keys
-- ----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  key text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  status text not null default 'processing'
    check (status in ('processing','done','failed')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create index if not exists idempotency_keys_user_idx on public.idempotency_keys (user_id);
create index if not exists idempotency_keys_expires_idx on public.idempotency_keys (expires_at);

alter table public.idempotency_keys enable row level security;
drop policy if exists idem_self on public.idempotency_keys;
create policy idem_self on public.idempotency_keys
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- jobs_inflight (pgmq 冪等ガード)
-- ----------------------------------------------------------------------------
create table if not exists public.jobs_inflight (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  queue_name text not null,
  idempotency_key text not null,
  acquired_by text,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (queue_name, idempotency_key)
);
create index if not exists jobs_inflight_expires_idx on public.jobs_inflight (expires_at);

alter table public.jobs_inflight enable row level security;
-- jobs_inflight は worker (service_role) しか触らないため、authenticated に何も付与しない。
revoke all on public.jobs_inflight from authenticated, anon;
