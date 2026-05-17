import { notificationType as sharedNotificationType } from '@ksp/shared';
import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * 通知タイプ — A-H-03 指摘で enum 化。
 * 14_state_machines の transition で参照される識別子と一致させる。
 *
 * cross-cutting P0-2 fix:
 *   `@ksp/shared` (constants.ts) の `notificationType` と SQL CHECK
 *   (`0018_notifications_type_check.sql`) と drizzle schema の 3 経路で値が
 *   ズレる事故を防ぐため、shared を single source of truth として import し
 *   re-export する。値そのものは shared 側で `as const` 配列で固定。
 */
export const notificationType = sharedNotificationType;
export type NotificationType = (typeof notificationType)[number];

export const notifications = pgTable(
  'notifications',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: notificationType }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    linkUrl: text('link_url'),
    isRead: boolean('is_read').notNull().default(false),
    /**
     * 0041 migration:
     *   既読化されたタイムスタンプ。inbox 画面の「24h 内に既読化したもの」折りたたみ
     *   や「未読 (`read_at IS NULL`) 件数 badge」の SELECT で使う。
     *   is_read と冗長だが「いつ既読化したか」を保持できるため、UX 優先で追加。
     */
    readAt: timestamp('read_at', { withTimezone: true }),
    /**
     * 0041 migration:
     *   ワーカー側 (handoff SLA escalate 等) が任意キーで追記する jsonb。
     *   想定キー:
     *     - escalated_at_48h / escalated_at_72h: ISO timestamp
     *     - escalated_to: array of user id (manager / admin)
     *     - originalNotificationId: handoff 元 notification id
     *   default '{}' なので NULL にはならない。
     */
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    userUnreadIdx: index('notifications_user_unread_idx').on(t.userId, t.isRead),
    createdAtIdx: index('notifications_created_at_idx').on(t.createdAt),
    orgUserIdx: index('notifications_org_user_idx').on(t.orgId, t.userId),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
