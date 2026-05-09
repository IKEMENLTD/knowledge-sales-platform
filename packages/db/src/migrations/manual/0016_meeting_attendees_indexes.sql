-- ============================================================================
-- 0016_meeting_attendees_indexes.sql
-- meeting_attendees の user_id / contact_id 部分 index 追加 (A-M-04)
-- ============================================================================

create index if not exists meeting_attendees_user_idx
  on public.meeting_attendees (user_id)
  where user_id is not null;

create index if not exists meeting_attendees_contact_idx
  on public.meeting_attendees (contact_id)
  where contact_id is not null;
