import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * feature_flags — 22_feature_flags_ab。
 *
 * 評価規則:
 *   enabled = false              → 全員 OFF
 *   blocklist に含まれる user_id → 強制 OFF
 *   allowlist に含まれる user_id → 強制 ON
 *   sha256(user_id || ':' || key) % 100 < percentage → ON
 *   それ以外                     → OFF
 *
 * AB_HASH_SECRET は `.env.example` で定義。
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    orgId: orgIdColumn(),
    key: text('key').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    percentage: integer('percentage').notNull().default(0),
    allowlist: uuid('allowlist').array().notNull().default(sql`'{}'::uuid[]`),
    blocklist: uuid('blocklist').array().notNull().default(sql`'{}'::uuid[]`),
    description: text('description'),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    keyUq: uniqueIndex('feature_flags_org_key_uq').on(t.orgId, t.key),
    percentageRange: check(
      'feature_flags_percentage_range',
      sql`${t.percentage} >= 0 and ${t.percentage} <= 100`,
    ),
  }),
);

/**
 * ab_test_assignments — sticky な実験割当 (UNIQUE per user x experiment)。
 */
export const abTestAssignments = pgTable(
  'ab_test_assignments',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    experimentKey: text('experiment_key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    uniqueAssignment: uniqueIndex('ab_test_assignments_user_experiment_uq').on(
      t.experimentKey,
      t.userId,
    ),
    experimentIdx: index('ab_test_assignments_experiment_idx').on(t.experimentKey),
  }),
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
export type AbTestAssignment = typeof abTestAssignments.$inferSelect;
export type NewAbTestAssignment = typeof abTestAssignments.$inferInsert;
