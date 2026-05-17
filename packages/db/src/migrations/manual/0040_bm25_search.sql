-- ============================================================================
-- 0040_bm25_search.sql
--
-- 検索 P0-D-1 / P0-E-1: 真の BM25 / GIN tsvector index 導入 + embedding 重複防止。
--
-- 背景:
--   reviews/design_gap_round1/search.md D-1 / E-1 (CRITICAL):
--     - 現状 `.textSearch(col, config=simple)` で全件 sequence scan + ts_rank 不可
--     - knowledge_embeddings に UNIQUE 制約が無く再投入で重複 INSERT
--
-- 本 migration:
--   1. recordings / meetings / contacts に GENERATED ALWAYS AS STORED tsvector 列
--      `search_tsv` を追加 (config='simple'; 形態素対応は後続 migration で textsearch_ja)
--   2. それぞれ `GIN (search_tsv)` index を作成 (BM25 計算は ts_rank_cd で後段)
--   3. knowledge_embeddings に soft delete 用 `deleted_at` 列 + UNIQUE
--      `(org_id, source_type, source_id, chunk_index)` partial index を追加
--      (UPSERT による冪等再生成を可能にする)
--
-- 冪等性:
--   - すべて `add column if not exists` / `create index if not exists`
--   - tsvector 列は GENERATED ALWAYS AS STORED — backfill 不要 (既存行は自動計算)
--
-- 互換性:
--   - 既存 RLS / トリガは無変更 (additive only)
--   - PostgREST `.textSearch('search_tsv', q, { config:'simple', type:'websearch' })`
--     で API route が直接利用可能
--
-- 参照: 18_search_knowledge_quality:7 / 09_implementation_plan:22
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. recordings.search_tsv  (summary + transcript_full)
-- ----------------------------------------------------------------------------
alter table public.recordings
  add column if not exists search_tsv tsvector
    generated always as (
      to_tsvector(
        'simple',
        coalesce(summary, '') || ' ' || coalesce(transcript_full, '')
      )
    ) stored;

create index if not exists recordings_search_tsv_gin
  on public.recordings using gin (search_tsv);

-- ----------------------------------------------------------------------------
-- 2. meetings.search_tsv  (title + manual_notes)
-- ----------------------------------------------------------------------------
alter table public.meetings
  add column if not exists search_tsv tsvector
    generated always as (
      to_tsvector(
        'simple',
        coalesce(title, '') || ' ' || coalesce(manual_notes, '')
      )
    ) stored;

create index if not exists meetings_search_tsv_gin
  on public.meetings using gin (search_tsv);

-- ----------------------------------------------------------------------------
-- 3. contacts.search_tsv  (name + name_kana + title + email)
-- ----------------------------------------------------------------------------
alter table public.contacts
  add column if not exists search_tsv tsvector
    generated always as (
      to_tsvector(
        'simple',
        coalesce(name, '') || ' ' ||
        coalesce(name_kana, '') || ' ' ||
        coalesce(title, '') || ' ' ||
        coalesce(email, '')
      )
    ) stored;

create index if not exists contacts_search_tsv_gin
  on public.contacts using gin (search_tsv);

-- ----------------------------------------------------------------------------
-- 4. knowledge_embeddings: deleted_at + UNIQUE 制約 (P0-E-1)
--
-- deleted_at は将来の soft-delete 用 (search.md E-2 embedding-cleanup worker
-- が立ち上がるまでの placeholder)。partial unique index で deleted_at is null
-- 行のみに UNIQUE を効かせる (再投入は upsert で onConflict)。
-- ----------------------------------------------------------------------------
alter table public.knowledge_embeddings
  add column if not exists deleted_at timestamptz;

do $$
begin
  -- 重複行が既に存在する場合は UNIQUE 制約が貼れないため、最新 (created_at desc)
  -- のみ残し他を soft delete する。Phase1 はテスト/開発投入のみで実害は無い。
  with ranked as (
    select
      id,
      row_number() over (
        partition by org_id, source_type, source_id, chunk_index
        order by created_at desc, id desc
      ) as rn
    from public.knowledge_embeddings
    where deleted_at is null
  )
  update public.knowledge_embeddings e
    set deleted_at = now()
  from ranked
  where e.id = ranked.id and ranked.rn > 1;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'knowledge_embeddings_source_chunk_unique'
  ) then
    create unique index knowledge_embeddings_source_chunk_unique
      on public.knowledge_embeddings (org_id, source_type, source_id, chunk_index)
      where deleted_at is null;
  end if;
end$$;
