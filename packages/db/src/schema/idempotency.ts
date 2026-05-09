import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * idempotency_keys — Idempotency-Key middleware の保存先 (T-5)。
 *
 * 同 key + 同 request_hash → 保存 response を再生
 * 同 key + 別 request_hash → 409 Conflict
 * TTL = 24h (expires_at で管理、cron で purge)
 */
export const idempotencyStatus = ['processing', 'done', 'failed'] as const;
export type IdempotencyStatus = (typeof idempotencyStatus)[number];

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    orgId: orgIdColumn(),
    key: text('key').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    status: text('status', { enum: idempotencyStatus }).notNull().default('processing'),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    userIdx: index('idempotency_keys_user_idx').on(t.userId),
    expiresIdx: index('idempotency_keys_expires_idx').on(t.expiresAt),
    statusCheck: check(
      'idempotency_keys_status_check',
      sql`${t.status} in ('processing','done','failed')`,
    ),
  }),
);

/**
 * jobs_inflight — pgmq 冪等性ガード (T-3)。
 * Webhook → pgmq enqueue 経路で SELECT FOR UPDATE SKIP LOCKED + ON CONFLICT DO NOTHING で
 * 二重投入を吸収する。
 */
export const jobsInflight = pgTable(
  'jobs_inflight',
  {
    orgId: orgIdColumn(),
    queueName: text('queue_name').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    acquiredBy: text('acquired_by'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: index('jobs_inflight_queue_key_idx').on(t.queueName, t.idempotencyKey),
    expiresIdx: index('jobs_inflight_expires_idx').on(t.expiresAt),
  }),
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type JobInflight = typeof jobsInflight.$inferSelect;
export type NewJobInflight = typeof jobsInflight.$inferInsert;
