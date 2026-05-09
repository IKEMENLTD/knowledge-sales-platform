-- ============================================================================
-- 0000_setup.sql
-- 拡張・ヘルパー関数。drizzle-kit generate 前に必ず一度だけ流す。
-- ============================================================================

-- 拡張機能
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

-- pgmq キュー作成 (Phase1 必須3キュー)
select pgmq.create('process_business_card');
select pgmq.create('process_recording');
select pgmq.create('generate_embeddings');
