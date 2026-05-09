-- ============================================================================
-- 0006_add_org_id.sql
-- 全既存テーブルに org_id を追加 (T-1 / 25_v2_review_resolutions #7)。
--
-- Phase 1 はシングルテナント運用なので default '00000000-0000-0000-0000-000000000001'。
-- Phase 2 以降で auth.users.raw_app_meta_data->>'org_id' から動的に解決。
--
-- 冪等性:
--   - alter table ... add column if not exists で再実行可能
--   - drop index if exists → create index if not exists で HNSW を複合 index に置換
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 全既存テーブルへの org_id 列追加
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.user_oauth_tokens
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.companies
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.contacts
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.contact_duplicates
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.meetings
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.meeting_attendees
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.recordings
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.knowledge_embeddings
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.notifications
  add column if not exists org_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid;

-- ----------------------------------------------------------------------------
-- (org_id, ...) 複合 index — RLS の基本句 (org_id = ...) に最適化
-- ----------------------------------------------------------------------------
create index if not exists users_org_idx on public.users (org_id);
create index if not exists user_oauth_tokens_org_idx on public.user_oauth_tokens (org_id);
create index if not exists companies_org_domain_idx on public.companies (org_id, domain);
create index if not exists contacts_org_owner_idx on public.contacts (org_id, owner_user_id);
create index if not exists contact_duplicates_org_idx on public.contact_duplicates (org_id);
create index if not exists meetings_org_owner_idx on public.meetings (org_id, owner_user_id);
create index if not exists meeting_attendees_org_idx on public.meeting_attendees (org_id);
create index if not exists recordings_org_idx on public.recordings (org_id);
create index if not exists embeddings_org_source_idx on public.knowledge_embeddings (org_id, source_type);
create index if not exists notifications_org_user_idx on public.notifications (org_id, user_id);

-- ----------------------------------------------------------------------------
-- HNSW index を (org_id, embedding) 複合に置き換える (T-4)
-- 既存 embeddings_hnsw_idx は単純な embedding-only。org_id prefilter のために
-- 単純 HNSW を残しつつ、org_id 用 btree を追加する形で対応する
-- (HNSW は単一 vector 列専用のため複合 index は別 index 経由で WHERE 句 prefilter)。
-- ----------------------------------------------------------------------------
-- 既存 HNSW (embedding only) は維持。WHERE 句 (org_id = ...) の prefilter は
-- 上記 embeddings_org_source_idx + plan_cache で吸収する。
-- 大規模化したら ivfflat + partition by org_id で最適化する (T-4 後段)。
