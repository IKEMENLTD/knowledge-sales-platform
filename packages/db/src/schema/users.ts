import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';

/**
 * v2.1 (L-1) で 'legal' を追加。退職者発言/法的開示等のレビュー権限を持つ。
 */
export const userRole = ['sales', 'cs', 'manager', 'admin', 'legal'] as const;
export type UserRole = (typeof userRole)[number];

/**
 * モバイル UI 利き手モード (P1 / 17_offline_mobile v2.3)。
 * SQL: 0024_user_handedness.sql
 */
export const userHandedness = ['left', 'right', 'auto'] as const;
export type UserHandedness = (typeof userHandedness)[number];

/**
 * users テーブル。
 *
 * セキュリティ要件:
 * - role 列の自己昇格防止 (S-C-01): BEFORE UPDATE トリガで
 *   role 変更は admin のみ許可する (SQL は 0015_users_role_guard.sql で実装)。
 * - users.id は auth.users.id をミラーする。0005_auth_sync_trigger.sql の
 *   handle_new_auth_user() が唯一の INSERT 経路 (service_role でも直接 INSERT 禁止)。
 *   0025_auth_sync_v2.sql で is_active default false に変更済 (A2-H-02)。
 */
export const users = pgTable(
  'users',
  {
    orgId: orgIdColumn(),
    // mirrors auth.users.id (do NOT default gen_random_uuid here)
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: text('role', { enum: userRole }).notNull(),
    avatarUrl: text('avatar_url'),
    timezone: text('timezone').notNull().default('Asia/Tokyo'),
    zoomUserId: text('zoom_user_id'),
    isActive: boolean('is_active').notNull().default(true),
    // P1: モバイル UI 利き手 (SQL 0024_user_handedness.sql)
    handedness: text('handedness', { enum: userHandedness }).notNull().default('auto'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    orgIdx: index('users_org_idx').on(t.orgId),
    handednessCheck: check(
      'users_handedness_check',
      sql`${t.handedness} in ('left','right','auto')`,
    ),
  }),
);

export const oauthProvider = ['google', 'zoom'] as const;
export type OAuthProvider = (typeof oauthProvider)[number];

/**
 * OAuth tokens are stored as references to Supabase Vault secrets, not raw token text.
 * See 08_security_rls — token rotation/revocation is handled via Vault.
 */
export const userOauthTokens = pgTable(
  'user_oauth_tokens',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: oauthProvider }).notNull(),
    refreshTokenSecretId: uuid('refresh_token_secret_id').notNull(),
    accessTokenSecretId: uuid('access_token_secret_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    providerPerUser: uniqueIndex('user_oauth_user_provider_uq').on(t.userId, t.provider),
    orgIdx: index('user_oauth_tokens_org_idx').on(t.orgId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserOauthToken = typeof userOauthTokens.$inferSelect;
export type NewUserOauthToken = typeof userOauthTokens.$inferInsert;
