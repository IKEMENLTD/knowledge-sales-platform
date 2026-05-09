-- ============================================================================
-- 0004_rpc_match_knowledge.sql
-- ナレッジ検索 RPC (SECURITY DEFINER + auth.uid() 権限判定 + sensitivity prefilter)
-- ハイブリッド検索 (BM25 + vector) は T-015 で /api/search 内に実装。
-- これは vector 部分の単純版 (cosine distance, top-k)。
-- ============================================================================

create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count integer default 10,
  filter_source_types text[] default null
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity real
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- 呼び出し元の認証チェック
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    raise exception 'user not provisioned';
  end if;

  return query
  select
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.knowledge_embeddings e
  where (filter_source_types is null or e.source_type = any(filter_source_types))
    -- TODO(P1.5): metadata.sensitivity が 'sensitive' の行は owner+admin のみに絞る
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
end;
$$;

-- authenticated は実行可、anon は不可
revoke all on function public.match_knowledge(vector, integer, text[]) from public;
grant execute on function public.match_knowledge(vector, integer, text[]) to authenticated;
