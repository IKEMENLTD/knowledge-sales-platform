import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * 通知タイプ — A-H-03 指摘で enum 化。
 * 14_state_machines の transition で参照される識別子と一致させる。
 */
export const notificationType = [
  'recording_ready',
  'reply_received',
  'handoff_pending',
  'sync_failed',
  'mention',
  'admin_action',
] as const;
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
