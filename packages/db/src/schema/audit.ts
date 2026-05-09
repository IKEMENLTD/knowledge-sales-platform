import { sql } from 'drizzle-orm';
import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * audit_logs — append-only + sha256 hash chain。
 *
 * 仕様: 25_v2_review_resolutions C-5
 *  - INSERT は service_role 経由のみ
 *  - UPDATE/DELETE は authenticated/anon すべて REVOKE
 *  - prev_hash は前行の row_hash (org_id 単位 chain)
 *  - row_hash = sha256(prev_hash || action || resource_type || coalesce(resource_id::text,'') || payload || created_at)
 *
 * Action 候補: view, create, update, delete, share, export, login, logout, admin_action
 * (08_security_rls 監査対象アクション節)。
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    payload: jsonb('payload'),
    prevHash: text('prev_hash'),
    rowHash: text('row_hash').notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    actorIdx: index('audit_logs_actor_idx').on(t.actorUserId),
    resourceIdx: index('audit_logs_resource_idx').on(t.resourceType, t.resourceId),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
    orgCreatedIdx: index('audit_logs_org_created_idx').on(t.orgId, t.createdAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
