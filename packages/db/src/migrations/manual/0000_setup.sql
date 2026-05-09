-- ============================================================================
-- 0000_setup.sql
-- 拡張・ヘルパー関数。drizzle-kit generate 前に必ず一度だけ流す。
--
-- 注意 (Round1 改修):
--   - pgmq.create() は冪等でないため 0013_pgmq_idempotent.sql に移譲した。
--     本ファイルでは extension の有効化と updated_at ヘルパーのみ。
--   - vector 拡張は将来 `extensions` schema に移す予定 (A-M-07)。
--     既に public で作成済みの環境は 0006/0014 で search_path を吸収する。
-- ============================================================================

-- 拡張機能 (CREATE EXTENSION IF NOT EXISTS は冪等)
create extension if not exists pgcrypto;        -- gen_random_uuid()
create extension if not exists vector;          -- knowledge_embeddings (pgvector)
create extension if not exists pgmq;            -- ジョブキュー (T-006/011/013)
create extension if not exists pg_cron;         -- 定期ジョブ
create extension if not exists supabase_vault;  -- OAuthトークン暗号化

-- updated_at 自動更新トリガー (全テーブル共通)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- pgmq キュー作成は 0013_pgmq_idempotent.sql で実施 (冪等版)
