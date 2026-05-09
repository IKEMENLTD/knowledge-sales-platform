-- ============================================================================
-- 0001_init_schema.sql
-- Drizzle スキーマと同等の DDL (手書き、drizzle-kit generate の代替)
-- 対応スキーマ: packages/db/src/schema/*.ts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('sales','cs','manager','admin')),
  avatar_url text,
  timezone text not null default 'Asia/Tokyo',
  zoom_user_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- user_oauth_tokens
-- ----------------------------------------------------------------------------
create table if not exists public.user_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('google','zoom')),
  refresh_token_secret_id uuid not null,
  access_token_secret_id uuid not null,
  expires_at timestamptz not null,
  scopes text[] not null,
  created_at timestamptz not null default now()
);
create unique index if not exists user_oauth_user_provider_uq
  on public.user_oauth_tokens (user_id, provider);

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  industry text,
  size text check (size in ('small','medium','large')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_domain_idx on public.companies (domain);

-- ----------------------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  owner_user_id uuid not null references public.users(id),
  name text not null,
  name_kana text,
  title text,
  email text,
  phone text,
  business_card_image_url text,
  ocr_raw_json jsonb,
  ocr_confidence numeric(3,2),
  status text not null default 'new'
    check (status in ('new','contacted','scheduled','met','in_progress','closed_won','closed_lost','archived')),
  source text default 'business_card',
  linkedin_url text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_email_idx on public.contacts (email);
create index if not exists contacts_owner_idx on public.contacts (owner_user_id);
create index if not exists contacts_company_idx on public.contacts (company_id);

-- ----------------------------------------------------------------------------
-- contact_duplicates
-- ----------------------------------------------------------------------------
create table if not exists public.contact_duplicates (
  id uuid primary key default gen_random_uuid(),
  new_contact_id uuid not null references public.contacts(id) on delete cascade,
  existing_contact_id uuid not null references public.contacts(id) on delete cascade,
  match_score numeric(3,2) not null,
  match_fields jsonb not null,
  resolution text not null default 'pending'
    check (resolution in ('pending','merged','kept_separate')),
  resolved_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- meetings
-- ----------------------------------------------------------------------------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id),
  owner_user_id uuid not null references public.users(id),
  title text not null,
  scheduled_at timestamptz,
  duration_minutes integer not null default 60,
  status text not null
    check (status in ('scheduling','scheduled','completed','cancelled','no_show')),
  stage text check (stage in ('first','second','demo','proposal','negotiation','closing','kickoff','cs_regular','cs_issue')),
  google_calendar_event_id text,
  zoom_meeting_id text unique,
  zoom_join_url text,
  zoom_password text,
  manual_notes text,
  deal_status text check (deal_status in ('open','won','lost','on_hold')),
  deal_amount integer,
  deal_close_date date,
  lost_reason text,
  contract_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_scheduled_idx on public.meetings (scheduled_at);
create index if not exists meetings_contact_idx on public.meetings (contact_id);
create index if not exists meetings_zoom_idx on public.meetings (zoom_meeting_id);
create index if not exists meetings_owner_idx on public.meetings (owner_user_id);

-- ----------------------------------------------------------------------------
-- meeting_attendees
-- ----------------------------------------------------------------------------
create table if not exists public.meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  attendee_type text not null check (attendee_type in ('internal_user','external_contact')),
  user_id uuid references public.users(id),
  contact_id uuid references public.contacts(id),
  role text not null check (role in ('owner','co_owner','observer')),
  speaker_label text,
  constraint meeting_attendees_type_xor_ref check (
    (attendee_type = 'internal_user' and user_id is not null and contact_id is null)
    or (attendee_type = 'external_contact' and contact_id is not null and user_id is null)
  )
);
create index if not exists meeting_attendees_meeting_idx on public.meeting_attendees (meeting_id);

-- ----------------------------------------------------------------------------
-- recordings
-- ----------------------------------------------------------------------------
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.meetings(id),
  zoom_recording_id text unique,
  video_storage_url text,
  video_storage_key text,
  video_duration_seconds integer,
  video_size_bytes bigint,
  transcript_full text,
  transcript_segments jsonb,
  transcript_source text check (transcript_source in ('zoom','whisper')),
  summary text,
  key_points jsonb,
  customer_needs jsonb,
  objections jsonb,
  next_actions jsonb,
  commitments jsonb,
  sentiment_timeline jsonb,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','downloading','transcribing','analyzing','embedding','completed','failed')),
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recordings_status_idx on public.recordings (processing_status);
create index if not exists recordings_meeting_idx on public.recordings (meeting_id);

-- ----------------------------------------------------------------------------
-- knowledge_embeddings (pgvector)
-- ----------------------------------------------------------------------------
create table if not exists public.knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('knowledge_item','recording_segment','meeting_notes','email','handoff')),
  source_id uuid not null,
  chunk_text text not null,
  chunk_index integer not null default 0,
  embedding vector(1536) not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists embeddings_source_idx on public.knowledge_embeddings (source_type, source_id);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, is_read);
create index if not exists notifications_created_at_idx on public.notifications (created_at);
