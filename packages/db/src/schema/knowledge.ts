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

/**
 * pgvector(1536) — OpenAI text-embedding-3-small.
 * drizzle-orm が pgvector の `vector` 型を直接サポートしないため customType でラップする。
 * 実際のINSERTは worker 側で `[0.1, 0.2, ...]` 形式の文字列を組み立てて渡す。
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
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

export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sourceType: text('source_type', { enum: embeddingSourceType }).notNull(),
    sourceId: uuid('source_id').notNull(),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    embedding: vector('embedding').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    sourceIdx: index('embeddings_source_idx').on(t.sourceType, t.sourceId),
    // HNSW index は SQL migration 側で手動定義する (drizzle-kitは未対応)
  }),
);

export type KnowledgeEmbedding = typeof knowledgeEmbeddings.$inferSelect;
export type NewKnowledgeEmbedding = typeof knowledgeEmbeddings.$inferInsert;
