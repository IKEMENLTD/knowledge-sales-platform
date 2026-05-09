import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { contacts } from './contacts.js';
import { users } from './users.js';

export const meetingStatus = [
  'scheduling',
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type MeetingStatus = (typeof meetingStatus)[number];

export const meetingStage = [
  'first',
  'second',
  'demo',
  'proposal',
  'negotiation',
  'closing',
  'kickoff',
  'cs_regular',
  'cs_issue',
] as const;
export type MeetingStage = (typeof meetingStage)[number];

export const dealStatus = ['open', 'won', 'lost', 'on_hold'] as const;
export type DealStatus = (typeof dealStatus)[number];

export const meetings = pgTable(
  'meetings',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    status: text('status', { enum: meetingStatus }).notNull(),
    stage: text('stage', { enum: meetingStage }),
    googleCalendarEventId: text('google_calendar_event_id'),
    zoomMeetingId: text('zoom_meeting_id').unique(),
    zoomJoinUrl: text('zoom_join_url'),
    zoomPassword: text('zoom_password'),
    manualNotes: text('manual_notes'),
    dealStatus: text('deal_status', { enum: dealStatus }),
    dealAmount: integer('deal_amount'),
    dealCloseDate: date('deal_close_date'),
    lostReason: text('lost_reason'),
    /**
     * contracts テーブルは P2 で導入される。FK は P2 T-031 で接続予定。
     * P1 では型のみ uuid (FK 制約なし)。
     */
    contractId: uuid('contract_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    scheduledIdx: index('meetings_scheduled_idx').on(t.scheduledAt),
    contactIdx: index('meetings_contact_idx').on(t.contactId),
    zoomIdx: index('meetings_zoom_idx').on(t.zoomMeetingId),
    ownerIdx: index('meetings_owner_idx').on(t.ownerUserId),
    orgOwnerIdx: index('meetings_org_owner_idx').on(t.orgId, t.ownerUserId),
  }),
);

export const attendeeType = ['internal_user', 'external_contact'] as const;
export type AttendeeType = (typeof attendeeType)[number];

export const attendeeRole = ['owner', 'co_owner', 'observer'] as const;
export type AttendeeRole = (typeof attendeeRole)[number];

export const meetingAttendees = pgTable(
  'meeting_attendees',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    attendeeType: text('attendee_type', { enum: attendeeType }).notNull(),
    userId: uuid('user_id').references(() => users.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    role: text('role', { enum: attendeeRole }).notNull(),
    speakerLabel: text('speaker_label'),
  },
  (t) => ({
    typeXorRef: check(
      'meeting_attendees_type_xor_ref',
      sql`(
        (${t.attendeeType} = 'internal_user' AND ${t.userId} IS NOT NULL AND ${t.contactId} IS NULL)
        OR (${t.attendeeType} = 'external_contact' AND ${t.contactId} IS NOT NULL AND ${t.userId} IS NULL)
      )`,
    ),
    meetingIdx: index('meeting_attendees_meeting_idx').on(t.meetingId),
    // 部分 index: NULL 行を除外して検索効率を上げる (A-M-04)
    userIdx: index('meeting_attendees_user_idx').on(t.userId).where(sql`${t.userId} is not null`),
    contactIdx: index('meeting_attendees_contact_idx')
      .on(t.contactId)
      .where(sql`${t.contactId} is not null`),
  }),
);

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type MeetingAttendee = typeof meetingAttendees.$inferSelect;
export type NewMeetingAttendee = typeof meetingAttendees.$inferInsert;
