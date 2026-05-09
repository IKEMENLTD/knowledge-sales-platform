-- ============================================================================
-- 0008_audit_logs.sql
-- audit_logs (append-only + sha256 hash chain)
--
-- 仕様: 25_v2_review_resolutions C-5
--   - INSERT は service_role のみ
--   - UPDATE/DELETE は authenticated/anon に対して REVOKE
--   - SELECT は manager / admin / legal のみ
--   - row_hash = sha256(prev_hash || action || resource_type || coalesce(resource_id::text,'')
--                       || coalesce(payload::text,'') || created_at::text)
--   - prev_hash = 直前の行 (org_id, created_at desc, id desc) の row_hash
-- ============================================================================

create table if not exists public.audit_logs (
  org_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  payload jsonb,
  prev_hash text,
  row_hash text not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx on public.audit_logs (actor_user_id);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);

-- ----------------------------------------------------------------------------
-- BEFORE INSERT trigger: prev_hash と row_hash を補完する
-- ----------------------------------------------------------------------------
create or replace function public.audit_logs_compute_hash()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_hash text;
  v_row_payload text;
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  -- 同 org の直前 hash を取る (created_at, id desc)
  select row_hash into v_prev_hash
  from public.audit_logs
  where org_id = new.org_id
  order by created_at desc, id desc
  limit 1;

  new.prev_hash := coalesce(v_prev_hash, '');

  v_row_payload := new.prev_hash
    || '|' || coalesce(new.action, '')
    || '|' || coalesce(new.resource_type, '')
    || '|' || coalesce(new.resource_id::text, '')
    || '|' || coalesce(new.payload::text, '')
    || '|' || new.created_at::text;

  new.row_hash := encode(digest(v_row_payload, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists trg_audit_logs_compute_hash on public.audit_logs;
create trigger trg_audit_logs_compute_hash
  before insert on public.audit_logs
  for each row execute function public.audit_logs_compute_hash();

-- ----------------------------------------------------------------------------
-- RLS: append-only
--   - SELECT: manager / admin / legal
--   - INSERT/UPDATE/DELETE は authenticated/anon すべて REVOKE
--   - INSERT は service_role 経由のみ (RLS をバイパス)
-- ----------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_priv on public.audit_logs;
create policy audit_logs_select_priv on public.audit_logs
  for select to authenticated
  using (
    public.current_user_role() in ('manager','admin','legal')
  );

revoke insert, update, delete on public.audit_logs from authenticated, anon;
