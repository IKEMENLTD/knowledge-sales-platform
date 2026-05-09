-- ============================================================================
-- 0014_match_knowledge_v2.sql
-- match_knowledge を sensitivity / visibility / org_id prefilter 付きで再作成。
--
-- 仕様: 25_v2_review_resolutions T-2 (S-C-02)
--   - SECURITY DEFINER + 関数内 auth.uid() 権限判定
--   - knowledge_embeddings.metadata に { org_id, sensitivity, visibility, owner_user_id }
--     が詰まっている前提
--   - 冒頭で hnsw.ef_search = 64 を session 局所セット (A-M-01)
-- ============================================================================

-- 旧版を完全に DROP してから再作成 (シグネチャ変更を含むため)
drop function if exists public.match_knowledge(vector, integer, text[]);

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
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_org_id uuid;
begin
  -- 認証チェック
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    raise exception 'user not provisioned';
  end if;

  v_org_id := public.current_org_id();

  -- HNSW ef_search を session 局所で 64 に上げる (A-M-01)
  perform set_config('hnsw.ef_search', '64', true);

  return query
  select
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_text,
    e.metadata,
    (1 - (e.embedding <=> query_embedding))::real as similarity
  from public.knowledge_embeddings e
  where (filter_source_types is null or e.source_type = any(filter_source_types))
    -- org_id prefilter (列 + metadata 二重防御)
    and e.org_id = v_org_id
    and (
      (e.metadata->>'org_id') is null
      or (e.metadata->>'org_id')::uuid = v_org_id
    )
    -- sensitivity tier prefilter
    and (
      (e.metadata->>'sensitivity') is null
      or (e.metadata->>'sensitivity') = 'public'
      or (
        (e.metadata->>'sensitivity') = 'internal'
        and v_role in ('sales','cs','manager','admin','legal')
      )
      or (
        (e.metadata->>'sensitivity') = 'sensitive'
        and (
          v_role in ('manager','admin','legal')
          or (e.metadata->>'owner_user_id')::uuid = auth.uid()
        )
      )
      or (
        (e.metadata->>'sensitivity') = 'restricted'
        and v_role in ('admin','legal')
      )
    )
    -- visibility prefilter
    and (
      (e.metadata->>'visibility') is null
      or (e.metadata->>'visibility') <> 'private_owner'
      or (e.metadata->>'owner_user_id')::uuid = auth.uid()
      or v_role in ('admin','legal')
    )
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
end;
$$;

revoke all on function public.match_knowledge(vector, integer, text[]) from public;
grant execute on function public.match_knowledge(vector, integer, text[]) to authenticated;
