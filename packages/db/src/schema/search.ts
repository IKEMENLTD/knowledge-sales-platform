import { sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';
import { users } from './users.js';

/**
 * 検索クエリ・クリックの記録 (migration 0037)。
 * クエリログは PII リスクが高いので、30 日で pg_cron が hard delete。
 */
export const searchQueries = pgTable(
  'search_queries',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    queryText: text('query_text').notNull(),
    queryKind: text('query_kind').default('all'),
    resultCount: integer('result_count').notNull().default(0),
    vectorTopScore: numeric('vector_top_score', { precision: 4, scale: 3 }),
    bm25TopScore: numeric('bm25_top_score', { precision: 4, scale: 3 }),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    orgCreatedIdx: index('search_queries_org_idx').on(t.orgId, t.createdAt),
    userCreatedIdx: index('search_queries_user_idx').on(t.userId, t.createdAt),
    kindCheck: check(
      'search_queries_query_kind_check',
      sql`${t.queryKind} in ('all','recording','meeting','contact')`,
    ),
  }),
);

export const searchClicks = pgTable(
  'search_clicks',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    queryId: uuid('query_id')
      .notNull()
      .references(() => searchQueries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    resultKind: text('result_kind').notNull(),
    resultId: uuid('result_id').notNull(),
    rank: integer('rank').notNull(),
    score: numeric('score', { precision: 4, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    queryIdx: index('search_clicks_query_idx').on(t.queryId),
    orgCreatedIdx: index('search_clicks_org_idx').on(t.orgId, t.createdAt),
    kindCheck: check(
      'search_clicks_result_kind_check',
      sql`${t.resultKind} in ('recording','meeting','contact')`,
    ),
  }),
);

export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;
export type SearchClick = typeof searchClicks.$inferSelect;
export type NewSearchClick = typeof searchClicks.$inferInsert;
