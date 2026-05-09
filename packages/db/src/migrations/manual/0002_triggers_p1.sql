-- ============================================================================
-- 0002_triggers_p1.sql
-- updated_at トリガー紐付け (drizzle-kit generate の 0001_init.sql 適用後に流す)
-- ============================================================================

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger set_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- HNSW index for vector similarity search (1536-d, cosine)
-- ベンチで ef_construction=128, ef_search=64 を実測調整 (P1ローンチ前必須)
create index if not exists embeddings_hnsw_idx
  on public.knowledge_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 128);
