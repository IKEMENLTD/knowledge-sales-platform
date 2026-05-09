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

export const contacts = pgTable(
  'contacts',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id').references(() => companies.id),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    nameKana: text('name_kana'),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),
    businessCardImageUrl: text('business_card_image_url'),
    ocrRawJson: jsonb('ocr_raw_json'),
    ocrConfidence: numeric('ocr_confidence', { precision: 3, scale: 2 }),
    status: text('status', { enum: contactStatus }).notNull().default('new'),
    source: text('source').default('business_card'),
    linkedinUrl: text('linkedin_url'),
    tags: text('tags').array(),
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
