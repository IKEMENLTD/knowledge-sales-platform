-- ============================================================================
-- 0030_onboarding_hardening.sql
-- Round 1 onboarding レビュー対応:
--   - Architecture H6 / Compliance H-1: consent_logs に (user_id,type,version)
--     UNIQUE + immutable trigger (withdrawn_at 以外の列の改ざん禁止)
--   - Architecture H1: 冪等性 (再同意で重複行を作らない)
--   - UX Critical-2: users に calendar_skipped_at / sample_skipped_at 列追加
--   - Architecture C3: sample_data_seeds で authenticated self-insert を許可
--     (seed_kind='onboarding_demo' + 自分の org_id のみ厳格 check)
-- ============================================================================

-- 1) consent_logs UNIQUE 制約
do $$
begin
  alter table public.consent_logs
    add constraint consent_logs_user_type_version_uq
    unique (user_id, consent_type, version);
exception when duplicate_object then null;
end $$;

-- 2) consent_logs immutable trigger (withdrawn_at と metadata のみ UPDATE 可)
create or replace function public.consent_logs_immutable_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.user_id        is distinct from new.user_id        or
     old.org_id         is distinct from new.org_id         or
     old.consent_type   is distinct from new.consent_type   or
     old.version        is distinct from new.version        or
     old.content_hash   is distinct from new.content_hash   or
     old.accepted_at    is distinct from new.accepted_at    or
     old.ip_address     is distinct from new.ip_address     or
     old.user_agent     is distinct from new.user_agent     or
     old.created_at     is distinct from new.created_at then
    raise exception 'consent_logs: only withdrawn_at and metadata are mutable (consent_logs_immutable)';
  end if;
  return new;
end;
$$;

drop trigger if exists consent_logs_immutable on public.consent_logs;
create trigger consent_logs_immutable
  before update on public.consent_logs
  for each row execute function public.consent_logs_immutable_check();

-- 3) users にスキップ状態の列を追加 (null=未操作、timestamp=スキップ時刻)
alter table public.users
  add column if not exists calendar_skipped_at timestamptz,
  add column if not exists sample_skipped_at   timestamptz;

-- 4) sample_data_seeds: applied_by 列を追加して self-insert 可能に
alter table public.sample_data_seeds
  add column if not exists applied_by uuid references public.users(id) on delete set null;

-- 既存の REVOKE は残しつつ、policy ベースで self-insert を許可する。
-- ただし seed_kind='onboarding_demo' に限定 (任意 kind の投入は service_role 経由のまま)。

-- 既存ポリシーを drop
do $$
begin
  drop policy if exists sample_data_seeds_self_insert on public.sample_data_seeds;
exception when undefined_object then null;
end $$;

-- authenticated に limited INSERT を GRANT (REVOKE で全部塞いだ後の意図的開放)
grant insert on public.sample_data_seeds to authenticated;

create policy sample_data_seeds_self_insert on public.sample_data_seeds
  for insert to authenticated
  with check (
    applied_by = auth.uid()
    and seed_kind = 'onboarding_demo'
    and org_id = (select org_id from public.users where id = auth.uid())
  );

-- SELECT は admin/legal だけ (既存通り)。INSERT 後の row 確認は server action 側で行う。

-- 5) consent_logs SELECT policy が user_id = auth.uid() で動くよう、必要なら GRANT 確認
-- (既存 0029 で grant 済みなのでここでは触らない)
