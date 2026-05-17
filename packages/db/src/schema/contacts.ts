import { sql } from 'drizzle-orm';
import { check, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { companies } from './companies.js';
import { users } from './users.js';

export const contactStatus = [
  'new',
  'contacted',
  'scheduled',
  'met',
  'in_progress',
  'closed_won',
  'closed_lost',
  'archived',
] as const;
export type ContactStatus = (typeof contactStatus)[number];

/**
 * 名刺レビュー状態 — sales funnel の `status` とは独立。
 * Phase2 で追加された列 (0034_contacts_phase2.sql)。
 */
export const reviewStatus = [
  'pending_ocr',
  'pending_review',
  'duplicate_suspect',
  'verified',
  'merged',
] as const;
export type ReviewStatus = (typeof reviewStatus)[number];

export const contacts = pgTable(
  'contacts',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id').references(() => companies.id),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    /** Phase2: 「誰が取り込んだか」owner_user_id (担当営業) とは別概念。 */
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    name: text('name').notNull(),
    nameKana: text('name_kana'),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),
    /** Phase2: 重複検知のための正規化済キャッシュ。worker が書く。 */
    normalizedEmail: text('normalized_email'),
    normalizedPhone: text('normalized_phone'),
    businessCardImageUrl: text('business_card_image_url'),
    /** Phase2: 同一画像の重複検知用 SHA-256 hex (org_id 内 unique partial)。 */
    businessCardImageHash: text('business_card_image_hash'),
    ocrRawJson: jsonb('ocr_raw_json'),
    ocrConfidence: numeric('ocr_confidence', { precision: 3, scale: 2 }),
    /** sales funnel ステータス (new → contacted → ...) */
    status: text('status', { enum: contactStatus }).notNull().default('new'),
    /** Phase2: OCR/レビュー段階の状態 (sales status と独立)。 */
    reviewStatus: text('review_status', { enum: reviewStatus }).default('pending_ocr'),
    source: text('source').default('business_card'),
    linkedinUrl: text('linkedin_url'),
    tags: text('tags').array(),
    /** Phase2: 実撮影/取込時刻。created_at は DB row 生成時刻。 */
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    /** Phase2: soft delete。 */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    emailIdx: index('contacts_email_idx').on(t.email),
    ownerIdx: index('contacts_owner_idx').on(t.ownerUserId),
    companyIdx: index('contacts_company_idx').on(t.companyId),
    orgOwnerIdx: index('contacts_org_owner_idx').on(t.orgId, t.ownerUserId),
    // CHECK 制約: ocr_confidence は 0..1
    ocrConfidenceRange: check(
      'contacts_ocr_confidence_range',
      sql`${t.ocrConfidence} is null or (${t.ocrConfidence} >= 0 and ${t.ocrConfidence} <= 1)`,
    ),
  }),
);

export const duplicateResolution = ['pending', 'merged', 'kept_separate'] as const;
export type DuplicateResolution = (typeof duplicateResolution)[number];

export const contactDuplicates = pgTable(
  'contact_duplicates',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    newContactId: uuid('new_contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    existingContactId: uuid('existing_contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    matchScore: numeric('match_score', { precision: 3, scale: 2 }).notNull(),
    matchFields: jsonb('match_fields').notNull(),
    resolution: text('resolution', { enum: duplicateResolution }).notNull().default('pending'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    orgIdx: index('contact_duplicates_org_idx').on(t.orgId),
    matchScoreRange: check(
      'contact_duplicates_match_score_range',
      sql`${t.matchScore} >= 0 and ${t.matchScore} <= 1`,
    ),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactDuplicate = typeof contactDuplicates.$inferSelect;
export type NewContactDuplicate = typeof contactDuplicates.$inferInsert;
