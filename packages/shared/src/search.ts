import { z } from 'zod';

/**
 * 検索機能 (T-015 / T-016) の API I/O。
 */

export const searchKindValues = ['all', 'recording', 'meeting', 'contact'] as const;
export const searchKindSchema = z.enum(searchKindValues);
export type SearchKind = z.infer<typeof searchKindSchema>;

export const searchRequestSchema = z.object({
  q: z.string().trim().min(1).max(500),
  kind: searchKindSchema.optional().default('all'),
  ownerUserId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).max(1000).optional().default(0),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchHitSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['recording', 'meeting', 'contact']),
  title: z.string(),
  context: z.string(),
  snippet: z.string(),
  /** RRF 合算後 final score (0..1 にスケール) */
  score: z.number().min(0).max(1),
  /** explain 用 — 内訳 */
  scoreBreakdown: z
    .object({
      vector: z.number().min(0).max(1).optional(),
      bm25: z.number().min(0).max(1).optional(),
      rrf: z.number().min(0).optional(),
    })
    .optional(),
  href: z.string(),
  /** 録画なら 該当時刻 (sec) */
  atSec: z.number().int().nonnegative().optional(),
  /** sensitivity (UI で表示制御) */
  sensitivity: z.enum(['public', 'internal', 'sensitive', 'restricted']).optional(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  queryId: z.string().uuid(),
  query: z.string(),
  total: z.number().int().nonnegative(),
  hits: z.array(searchHitSchema),
  durationMs: z.number().int().nonnegative(),
  /** デモ環境フラグ (本番では false) */
  demo: z.boolean().optional(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const searchClickRequestSchema = z.object({
  queryId: z.string().uuid(),
  resultKind: z.enum(['recording', 'meeting', 'contact']),
  resultId: z.string().uuid(),
  rank: z.number().int().min(1).max(50),
  score: z.number().min(0).max(1).optional(),
});
export type SearchClickRequest = z.infer<typeof searchClickRequestSchema>;
