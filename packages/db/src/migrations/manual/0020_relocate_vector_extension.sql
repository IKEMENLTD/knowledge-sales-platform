-- ============================================================================
-- 0020_relocate_vector_extension.sql
-- pgvector を public schema 直下から extensions schema 配下に移す (A2-M-02)
--
-- Supabase では create extension 時に自動で extensions schema が作成される。
-- 既存環境では extension が public 配下にあると pg_dump / pg_upgrade advisor が
-- 警告を出すため、本 migration で alter extension ... set schema を試行する。
--
-- 権限不足 / extensions schema 不在 / 依存 type が public schema 経由で resolve
-- 済の場合などは raise notice でスキップ (do$$ exception 包み込み)。
-- ============================================================================

do $$
begin
  -- extensions schema が存在しなければ作る (権限がないなら exception で抜ける)
  perform 1 from pg_namespace where nspname = 'extensions';
  if not found then
    create schema if not exists extensions;
  end if;

  alter extension vector set schema extensions;
exception when others then
  raise notice 'skip vector extension relocate: % (sqlstate=%)', sqlerrm, sqlstate;
end$$;
