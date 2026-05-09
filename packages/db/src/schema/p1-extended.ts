import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { contacts } from './contacts.js';
import { meetings } from './meetings.js';
import { users } from './users.js';

/**
 * p1-extended — 03_data_model「追加テーブル(現場UX補完 v2)」P1 マーク群。
 * すべて 0007_p1_extended_tables.sql で CREATE + RLS。
 */

// ----------------------------------------------------------------------------
// business_card_images — 名刺画像 (表/裏 別レコード)
// ----------------------------------------------------------------------------
export const businessCardSide = ['front', 'back'] as const;
export type BusinessCardSide = (typeof businessCardSide)[number];

export const businessCardImages = pgTable(
  'business_card_images',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    side: text('side', { enum: businessCardSide }).notNull(),
    storageUrl: text('storage_url').notNull(),
    storageKey: text('storage_key'),
    ocrConfidence: numeric('ocr_confidence', { precision: 3, scale: 2 }),
    classification: text('classification'),
    capturedLat: numeric('captured_lat', { precision: 9, scale: 6 }),
    capturedLng: numeric('captured_lng', { precision: 9, scale: 6 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().default(sql`now()`),
    lightQuality: text('light_quality'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    contactIdx: index('business_card_images_contact_idx').on(t.contactId),
    orgContactIdx: index('business_card_images_org_contact_idx').on(t.orgId, t.contactId),
    ocrConfRange: check(
      'business_card_images_ocr_conf_range',
      sql`${t.ocrConfidence} is null or (${t.ocrConfidence} >= 0 and ${t.ocrConfidence} <= 1)`,
    ),
  }),
);

// ----------------------------------------------------------------------------
// contact_memos — 音声/テキストメモ
// ----------------------------------------------------------------------------
export const contactMemoKind = ['voice', 'text'] as const;
export type ContactMemoKind = (typeof contactMemoKind)[number];

export const contactMemos = pgTable(
  'contact_memos',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: contactMemoKind }).notNull(),
    content: text('content').notNull(),
    audioStorageUrl: text('audio_storage_url'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    contactIdx: index('contact_memos_contact_idx').on(t.contactId),
    orgContactIdx: index('contact_memos_org_contact_idx').on(t.orgId, t.contactId),
  }),
);

// ----------------------------------------------------------------------------
// offline_queue — IndexedDB sync (UNIQUE user_id+idempotency_key)
// ----------------------------------------------------------------------------
export const offlineQueueStatus = ['queued', 'syncing', 'done', 'failed'] as const;
export type OfflineQueueStatus = (typeof offlineQueueStatus)[number];

export const offlineQueue = pgTable(
  'offline_queue',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: offlineQueueStatus }).notNull().default('queued'),
    errorMessage: text('error_message'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().default(sql`now()`),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('offline_queue_user_idx').on(t.userId),
    statusIdx: index('offline_queue_status_idx').on(t.status),
    userIdemUq: uniqueIndex('offline_queue_user_idem_uq').on(t.userId, t.idempotencyKey),
  }),
);

// ----------------------------------------------------------------------------
// non_card_attachments — 名刺以外の添付 (パンフ/メモ等)
// ----------------------------------------------------------------------------
export const nonCardAttachments = pgTable(
  'non_card_attachments',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id),
    storageUrl: text('storage_url').notNull(),
    classification: text('classification').notNull(),
    linkedMeetingId: uuid('linked_meeting_id').references(() => meetings.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    uploaderIdx: index('non_card_attachments_uploader_idx').on(t.uploaderId),
    meetingIdx: index('non_card_attachments_meeting_idx').on(t.linkedMeetingId),
  }),
);

// ----------------------------------------------------------------------------
// sync_failure_log — Google/Zoom/Gmail 同期失敗ログ
// ----------------------------------------------------------------------------
export const syncFailureTarget = ['google_calendar', 'zoom', 'gmail'] as const;
export type SyncFailureTarget = (typeof syncFailureTarget)[number];

export const syncFailureLog = pgTable(
  'sync_failure_log',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    target: text('target', { enum: syncFailureTarget }).notNull(),
    error: text('error').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('sync_failure_log_user_idx').on(t.userId),
    targetIdx: index('sync_failure_log_target_idx').on(t.target),
    unresolvedIdx: index('sync_failure_log_unresolved_idx')
      .on(t.occurredAt)
      .where(sql`${t.resolvedAt} is null`),
  }),
);

// ----------------------------------------------------------------------------
// data_residency_config — org 単位の保管リージョン (org_admin 専用)
// ----------------------------------------------------------------------------
export const dataResidencyConfig = pgTable('data_residency_config', {
  orgId: uuid('org_id').primaryKey(),
  region: text('region').notNull().default('ap-northeast-1'),
  drRegion: text('dr_region').default('ap-northeast-3'),
  r2Bucket: text('r2_bucket'),
  encryptionKeyId: text('encryption_key_id'),
  dpaVersion: text('dpa_version'),
  enforced: boolean('enforced').notNull().default(true),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ----------------------------------------------------------------------------
// recent_views — ダッシュボード「最近見たもの」
// ----------------------------------------------------------------------------
export const recentViewKind = ['meeting', 'contact', 'recording', 'knowledge'] as const;
export type RecentViewKind = (typeof recentViewKind)[number];

export const recentViews = pgTable(
  'recent_views',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resourceKind: text('resource_kind', { enum: recentViewKind }).notNull(),
    resourceId: uuid('resource_id').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    userViewedIdx: index('recent_views_user_viewed_idx').on(t.userId, t.viewedAt),
    userKindIdx: index('recent_views_user_kind_idx').on(t.userId, t.resourceKind),
  }),
);

// ----------------------------------------------------------------------------
// autosave_drafts — フォーム自動保存
// ----------------------------------------------------------------------------
export const autosaveDrafts = pgTable(
  'autosave_drafts',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    formKey: text('form_key').notNull(),
    payload: jsonb('payload').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    userFormUq: uniqueIndex('autosave_drafts_user_form_uq').on(t.userId, t.formKey),
  }),
);

export type BusinessCardImage = typeof businessCardImages.$inferSelect;
export type NewBusinessCardImage = typeof businessCardImages.$inferInsert;
export type ContactMemo = typeof contactMemos.$inferSelect;
export type NewContactMemo = typeof contactMemos.$inferInsert;
export type OfflineQueueItem = typeof offlineQueue.$inferSelect;
export type NewOfflineQueueItem = typeof offlineQueue.$inferInsert;
export type NonCardAttachment = typeof nonCardAttachments.$inferSelect;
export type NewNonCardAttachment = typeof nonCardAttachments.$inferInsert;
export type SyncFailureLog = typeof syncFailureLog.$inferSelect;
export type NewSyncFailureLog = typeof syncFailureLog.$inferInsert;
export type DataResidencyConfig = typeof dataResidencyConfig.$inferSelect;
export type NewDataResidencyConfig = typeof dataResidencyConfig.$inferInsert;
export type RecentView = typeof recentViews.$inferSelect;
export type NewRecentView = typeof recentViews.$inferInsert;
export type AutosaveDraft = typeof autosaveDrafts.$inferSelect;
export type NewAutosaveDraft = typeof autosaveDrafts.$inferInsert;
