import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { recordings } from './recordings.js';

/**
 * recording_segments — 03_data_model 行 636 / A-C-01 / S-M-03。
 *
 * jsonb blob (`recordings.transcript_segments`) を正規化したテーブル。
 * sensitivity tier ごとの行レベル RLS、PII redaction、退職者発言バッジ、
 * speaker_assignments の伝播はすべて本テーブルでサポートする。
 */
export const segmentSensitivity = ['public', 'internal', 'sensitive', 'restricted'] as const;
export type SegmentSensitivity = (typeof segmentSensitivity)[number];

export const recordingSegments = pgTable(
  'recording_segments',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    recordingId: uuid('recording_id')
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    segmentIndex: numeric('segment_index', { precision: 10, scale: 0 }).notNull(),
    speakerId: text('speaker_id'),
    speakerLabel: text('speaker_label'),
    startSeconds: numeric('start_seconds', { precision: 10, scale: 3 }).notNull(),
    endSeconds: numeric('end_seconds', { precision: 10, scale: 3 }).notNull(),
    text: text('text').notNull(),
    sentiment: numeric('sentiment', { precision: 3, scale: 2 }),
    sensitivity: text('sensitivity', { enum: segmentSensitivity }).notNull().default('internal'),
    piiDetected: boolean('pii_detected').notNull().default(false),
    piiRedactedText: text('pii_redacted_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    recordingIdx: index('recording_segments_recording_idx').on(t.recordingId),
    orgRecordingIdx: index('recording_segments_org_recording_idx').on(t.orgId, t.recordingId),
    segmentUq: uniqueIndex('recording_segments_recording_idx_uq').on(t.recordingId, t.segmentIndex),
    sentimentRange: check(
      'recording_segments_sentiment_range',
      sql`${t.sentiment} is null or (${t.sentiment} >= -1 and ${t.sentiment} <= 1)`,
    ),
  }),
);

export type RecordingSegment = typeof recordingSegments.$inferSelect;
export type NewRecordingSegment = typeof recordingSegments.$inferInsert;
