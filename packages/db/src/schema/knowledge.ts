import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgIdColumn } from './_shared.js';

/**
 * embedding 次元数 — `@ksp/shared` の EMBEDDING_DIM と同じ値。
 * 循環依存を避けるためここで再宣言する。値が乖離した場合は packages/db テストで検出する。
 */
const EMBEDDING_DIM = 1536 as const;

/**
 * pgvector(1536) — OpenAI text-embedding-3-small。
 * drizzle-orm が pgvector の `vector` 型を直接サポートしないため customType でラップする。
 * 実際の INSERT は worker 側で `[0.1, 0.2, ...]` 形式の文字列を組み立てて渡す。
 *
 * toDriver 内で次元数 assertion を行い、dimension drift (worker バグでショート/ロング配列を
 * 投入してしまうケース) を runtime で fail-fast で検出する (M4 指摘)。
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIM})`;
  },
  toDriver(value: number[]): string {
    if (!Array.isArray(value)) {
      throw new TypeError(`embedding: expected number[], got ${typeof value}`);
    }
    if (value.length !== EMBEDDING_DIM) {
      throw new RangeError(
        `embedding: dimension mismatch — expected ${EMBEDDING_DIM}, got ${value.length}`,
      );
    }
    return `[${value.join(',')}]`;
  },
});

export const embeddingSourceType = [
  'knowledge_item',
  'recording_segment',
  'meeting_notes',
  'email',
  'handoff',
] as const;
export type EmbeddingSourceType = (typeof embeddingSourceType)[number];

/**
 * knowledge_embeddings — 直接 SELECT は禁止 (RLS deny-all)。
 * クエリは public.match_knowledge RPC (SECURITY DEFINER) 経由のみ。
 *
 * metadata には以下を必ず詰める (T-2 / 0014_match_knowledge_v2.sql 前提):
 *   - org_id (uuid)
 *   - sensitivity (public|internal|sensitive|restricted)
 *   - visibility  (shared|private_owner)
 *   - owner_user_id (uuid|null)
 *
 * org_id は列としても保持して HNSW 複合 index `(org_id, embedding)` で prefilter 高速化する
 * (T-1 / 0006_add_org_id.sql)。
 */
export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    orgId: orgIdColumn(),
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sourceType: text('source_type', { enum: embeddingSourceType }).notNull(),
    sourceId: uuid('source_id').notNull(),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    embedding: vector('embedding').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    sourceIdx: index('embeddings_source_idx').on(t.sourceType, t.sourceId),
    orgSourceIdx: index('embeddings_org_source_idx').on(t.orgId, t.sourceType),
    // HNSW index (`(org_id, embedding)` 複合) は SQL migration 側で手動定義する
    //   - 0002_triggers_p1.sql で旧 index 作成
    //   - 0006_add_org_id.sql で org_id 列追加 → 0014_match_knowledge_v2.sql で複合化
  }),
);

export type KnowledgeEmbedding = typeof knowledgeEmbeddings.$inferSelect;
export type NewKnowledgeEmbedding = typeof knowledgeEmbeddings.$inferInsert;
