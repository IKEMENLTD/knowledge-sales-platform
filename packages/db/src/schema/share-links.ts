import { sql } from 'drizzle-orm';
import { check, index, inet, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * share_links — 共有リンク (S-M-06 / L-6 / 設計書 08_security_rls)
 *
 * URL に乗せるトークンは平文。DB には sha256 ハッシュのみ保存。
 * 公開検証は SECURITY DEFINER RPC 経由でのみ実施 (本テーブル直接 SELECT は
 * authenticated にも付与しない)。
 *
 * SQL: 0022_share_links.sql
 */
export const shareResourceType = [
  'recording',
  'recording_clip',
  'meeting_notes',
  'knowledge_item',
  'handoff',
] as const;
export type ShareResourceType = (typeof shareResourceType)[number];

export const shareLinks = pgTable(
  'share_links',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    resourceType: text('resource_type', { enum: shareResourceType }).notNull(),
    resourceId: uuid('resource_id').notNull(),
    /** sha256(plain_token, hex). plain_token は URL にのみ存在 */
    tokenSha256: text('token_sha256').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 許可 IP / CIDR 配列 (NULL = 制限なし) */
    ipAllowlist: inet('ip_allowlist').array(),
    audience: text('audience'),
    watermarkEmail: text('watermark_email'),
    /** 共有経由のクリック追跡: audit_logs.id へ root を貼る */
    clickLogIdRoot: uuid('click_log_id_root'),
    passwordHash: text('password_hash'),
    clickCount: integer('click_count').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    resourceIdx: index('share_links_resource_idx').on(t.resourceType, t.resourceId),
    creatorIdx: index('share_links_creator_idx').on(t.createdBy),
    orgCreatedIdx: index('share_links_org_created_idx').on(t.orgId, t.createdAt),
    expiresIdx: index('share_links_expires_idx').on(t.expiresAt),
    // SQL 側 CHECK と同期: resource_type は enum リストに限定
    resourceTypeCheck: check(
      'share_links_resource_type_check',
      sql`${t.resourceType} in ('recording','recording_clip','meeting_notes','knowledge_item','handoff')`,
    ),
  }),
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
