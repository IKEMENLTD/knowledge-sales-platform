import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const userRole = ['sales', 'cs', 'manager', 'admin'] as const;
export type UserRole = (typeof userRole)[number];

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: userRole }).notNull(),
  avatarUrl: text('avatar_url'),
  timezone: text('timezone').notNull().default('Asia/Tokyo'),
  zoomUserId: text('zoom_user_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const oauthProvider = ['google', 'zoom'] as const;
export type OAuthProvider = (typeof oauthProvider)[number];

/**
 * OAuth tokens are stored as references to Supabase Vault secrets, not raw token text.
 * See 08_security_rls — token rotation/revocation is handled via Vault.
 */
export const userOauthTokens = pgTable(
  'user_oauth_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: oauthProvider }).notNull(),
    refreshTokenSecretId: uuid('refresh_token_secret_id').notNull(),
    accessTokenSecretId: uuid('access_token_secret_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    providerPerUser: uniqueIndex('user_oauth_user_provider_uq').on(t.userId, t.provider),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserOauthToken = typeof userOauthTokens.$inferSelect;
export type NewUserOauthToken = typeof userOauthTokens.$inferInsert;
