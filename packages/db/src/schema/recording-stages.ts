import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { recordings } from './recordings.js';

/**
 * recording_stages — 03_data_model 行 628 / A-C-01。
 *
 * stage1_transcript / stage2_preview / stage3_full の 3 段階成果物を行レベルで管理する。
 * recording.processing_status (pending→…→completed) が線形遷移なのに対し、
 * 本テーブルは stage 単位の retry / failed 状態を独立に保持する (M-6)。
 */
export const recordingStageName = ['stage1_transcript', 'stage2_preview', 'stage3_full'] as const;
export type RecordingStageName = (typeof recordingStageName)[number];

export const recordingStageStatus = ['queued', 'running', 'done', 'failed'] as const;
export type RecordingStageStatus = (typeof recordingStageStatus)[number];

export const recordingStages = pgTable(
  'recording_stages',
  {
    orgId: orgIdColumn(),
    recordingId: uuid('recording_id')
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    stage: text('stage', { enum: recordingStageName }).notNull(),
    status: text('status', { enum: recordingStageStatus }).notNull().default('queued'),
    artifact: jsonb('artifact'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordingId, t.stage] }),
    statusIdx: index('recording_stages_status_idx').on(t.status),
    orgRecordingIdx: index('recording_stages_org_recording_idx').on(t.orgId, t.recordingId),
  }),
);

export type RecordingStage = typeof recordingStages.$inferSelect;
export type NewRecordingStage = typeof recordingStages.$inferInsert;
