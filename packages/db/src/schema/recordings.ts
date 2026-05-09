import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { meetings } from './meetings.js';

export const transcriptSource = ['zoom', 'whisper'] as const;
export type TranscriptSource = (typeof transcriptSource)[number];

export const recordingProcessingStatus = [
  'pending',
  'downloading',
  'transcribing',
  'analyzing',
  'embedding',
  'completed',
  'failed',
] as const;
export type RecordingProcessingStatus = (typeof recordingProcessingStatus)[number];

export const recordings = pgTable(
  'recordings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meetingId: uuid('meeting_id')
      .notNull()
      .unique()
      .references(() => meetings.id),
    zoomRecordingId: text('zoom_recording_id').unique(),
    videoStorageUrl: text('video_storage_url'),
    videoStorageKey: text('video_storage_key'),
    videoDurationSeconds: integer('video_duration_seconds'),
    videoSizeBytes: bigint('video_size_bytes', { mode: 'number' }),
    transcriptFull: text('transcript_full'),
    transcriptSegments: jsonb('transcript_segments'),
    transcriptSource: text('transcript_source', { enum: transcriptSource }),
    summary: text('summary'),
    keyPoints: jsonb('key_points'),
    customerNeeds: jsonb('customer_needs'),
    objections: jsonb('objections'),
    nextActions: jsonb('next_actions'),
    commitments: jsonb('commitments'),
    sentimentTimeline: jsonb('sentiment_timeline'),
    processingStatus: text('processing_status', { enum: recordingProcessingStatus })
      .notNull()
      .default('pending'),
    processingError: text('processing_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    statusIdx: index('recordings_status_idx').on(t.processingStatus),
    meetingIdx: index('recordings_meeting_idx').on(t.meetingId),
  }),
);

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
