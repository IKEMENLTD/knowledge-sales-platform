-- ============================================================================
-- 0002_triggers_p1.sql
-- updated_at トリガー紐付け + HNSW index の初期作成。
--
-- 再実行耐性: 各 create trigger の前に drop trigger if exists を置く (H3-1)。
-- ============================================================================

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists set_meetings_updated_at on public.meetings;
create trigger set_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- HNSW index for vector similarity search (1536-d, cosine)
-- 0014_match_knowledge_v2.sql で (org_id, embedding) 複合 HNSW に置き換える。
-- ベンチで ef_construction=128, ef_search=64 を実測調整 (P1ローンチ前必須)
create index if not exists embeddings_hnsw_idx
  on public.knowledge_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 128);
