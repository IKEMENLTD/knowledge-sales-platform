import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
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

/**
 * Sensitivity tier (M-C3 / 0011_recordings_sensitivity.sql)。
 * RLS は recordings_select policy で sensitivity × role × owner の三項論理で prefilter する。
 *  - public:     全員参照可
 *  - internal:   sales/cs/manager/admin/legal が参照可
 *  - sensitive:  manager/admin/legal/owner のみ
 *  - restricted: admin/legal のみ
 */
export const recordingSensitivity = ['public', 'internal', 'sensitive', 'restricted'] as const;
export type RecordingSensitivity = (typeof recordingSensitivity)[number];

export const recordings = pgTable(
  'recordings',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    meetingId: uuid('meeting_id')
      .notNull()
      .unique()
      .references(() => meetings.id, { onDelete: 'restrict' }),
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
    /**
     * Sensitivity tier — 0011_recordings_sensitivity.sql で追加。
     * デフォルトは internal。worker 側で文字起こし完了後に PII 検知結果に基づき
     * sensitive へ昇格する場合がある。
     */
    sensitivity: text('sensitivity', { enum: recordingSensitivity }).notNull().default('internal'),
    processingStatus: text('processing_status', { enum: recordingProcessingStatus })
      .notNull()
      .default('pending'),
    processingError: text('processing_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index('recordings_status_idx').on(t.processingStatus),
    meetingIdx: index('recordings_meeting_idx').on(t.meetingId),
    orgSensitivityIdx: index('recordings_org_sensitivity_idx').on(t.orgId, t.sensitivity),
  }),
);

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
