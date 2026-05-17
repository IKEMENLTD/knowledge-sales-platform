-- ============================================================================
-- 0037_search_logs.sql
--
-- 検索クエリ・クリックの記録 (T-015 / T-016 / Phase 2 LTR の前提)。
-- クエリログは PII 化リスクが高いので、原文は 30 日で hard delete、
-- 直近 7 日のみ analyst が見られるよう RLS で絞る。
-- ============================================================================

create table if not exists public.search_queries (
  org_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  query_text text not null,
  query_kind text check (query_kind in ('all', 'recording', 'meeting', 'contact')) default 'all',
  result_count integer not null default 0,
  vector_top_score numeric(4, 3),
  bm25_top_score numeric(4, 3),
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists search_queries_org_idx on public.search_queries(org_id, created_at desc);
create index if not exists search_queries_user_idx on public.search_queries(user_id, created_at desc);

alter table public.search_queries enable row level security;

drop policy if exists search_queries_self_select on public.search_queries;
create policy search_queries_self_select on public.search_queries
  for select to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists search_queries_self_insert on public.search_queries;
create policy search_queries_self_insert on public.search_queries
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  );

-- 検索結果クリックログ (どの結果に着地したか — LTR 用)
create table if not exists public.search_clicks (
  org_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.search_queries(id) on delete cascade,
  user_id uuid not null references public.users(id),
  result_kind text not null check (result_kind in ('recording', 'meeting', 'contact')),
  result_id uuid not null,
  rank integer not null,
  score numeric(4, 3),
  created_at timestamptz not null default now()
);

create index if not exists search_clicks_query_idx on public.search_clicks(query_id);
create index if not exists search_clicks_org_idx on public.search_clicks(org_id, created_at desc);

alter table public.search_clicks enable row level security;

drop policy if exists search_clicks_self_select on public.search_clicks;
create policy search_clicks_self_select on public.search_clicks
  for select to authenticated
  using (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and (user_id = auth.uid() or public.is_manager_or_admin())
  );

drop policy if exists search_clicks_self_insert on public.search_clicks;
create policy search_clicks_self_insert on public.search_clicks
  for insert to authenticated
  with check (
    (public.current_org_id() is null or org_id = public.current_org_id())
    and user_id = auth.uid()
  );

-- 30日後の自動削除 (pg_cron)。MIGRATION 適用順序に依存しないよう pg_cron 拡張は無視可能。
do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) and not exists (
    select 1 from cron.job where jobname = 'search_queries_retention_30d'
  ) then
    perform cron.schedule(
      'search_queries_retention_30d',
      '17 3 * * *', -- 毎日 03:17 JST 相当 (UTC)
      $cron$delete from public.search_queries where created_at < now() - interval '30 days'$cron$
    );
  end if;
end$$;
