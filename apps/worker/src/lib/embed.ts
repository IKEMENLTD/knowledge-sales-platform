import { setTimeout as delay } from 'node:timers/promises';
import OpenAI from 'openai';
import { EMBEDDING_DIM, EMBEDDING_MODEL } from '@ksp/shared';
import { env } from '../env.js';
import { logger } from './logger.js';

/**
 * OpenAI text-embedding-3-small (1536-dim) クライアント wrapper。
 *
 * 設計判断:
 *   - OPENAI_API_KEY 未設定 (dev / test) では deterministic mock を返す。
 *     production では env.ts 側で fail-fast (requiredInProd) なのでここに来ない。
 *   - batch API は最大 50 件/req に統一。retry はネットワーク系のみ 1 回 (429/5xx)。
 *   - cost-guard 連携用に 「token 使用量 → USD」概算を返す helper も提供。
 *     text-embedding-3-small 価格: $0.020 / 1M tokens (2024 GA)。
 */

const BATCH_SIZE = 50;
const RETRY_MS = 1000;
// price per 1M tokens (USD); update when OpenAI repricing。
const USD_PER_TOKEN_EMBED_3_SMALL = 0.02 / 1_000_000;

/**
 * Round 2 SRE P1-SRE-03: external API timeouts.
 *   - timeout: 30s ensures we never block the embed tick forever on a hung
 *     OpenAI side (a single hung request used to keep the visibility timeout
 *     extending and never re-deliver to another worker).
 *   - maxRetries: 0 — pgmq visibility timeout is the retry mechanism; we
 *     prefer letting the message re-deliver to keep ack/duration metrics
 *     accurate.
 */
const OPENAI_REQUEST_TIMEOUT_MS = 30_000;

let _client: OpenAI | null = null;
function openaiClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return _client;
}

/** xmur3 + sfc32 ベースの seeded PRNG。同じ input なら同じ vector を返す。 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** OPENAI_API_KEY 不在時のフォールバック embedding (1536-dim, L2-normalized)。 */
export function mockEmbedding(input: string): number[] {
  const r = xmur3(input.length === 0 ? 'ksp:empty' : `ksp:${input}`);
  const v = new Array<number>(EMBEDDING_DIM);
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const x = r() * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  const scale = 1 / Math.sqrt(norm || 1);
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] = (v[i] ?? 0) * scale;
  return v;
}

export interface EmbedResult {
  vectors: number[][];
  totalTokens: number;
  spendUsd: number;
  mocked: boolean;
}

/**
 * 配列 texts を 50 件ずつ batch で embed する。
 * 429 / 5xx は 1 度だけ 1s リトライする (overload を想定)。
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { vectors: [], totalTokens: 0, spendUsd: 0, mocked: !env.OPENAI_API_KEY };
  }
  const client = openaiClient();
  if (!client) {
    logger.warn(
      { count: texts.length },
      'OPENAI_API_KEY missing; falling back to mock embeddings',
    );
    return {
      vectors: texts.map(mockEmbedding),
      totalTokens: 0,
      spendUsd: 0,
      mocked: true,
    };
  }

  const out: number[][] = new Array(texts.length);
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    let attempt = 0;
    while (true) {
      try {
        const res = await client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: slice,
        });
        if (!Array.isArray(res.data) || res.data.length !== slice.length) {
          throw new Error('OpenAI embeddings: response shape unexpected');
        }
        for (const row of res.data) {
          if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIM) {
            throw new Error(
              `OpenAI embeddings: dimension mismatch (${row.embedding?.length ?? 'null'})`,
            );
          }
          out[i + row.index] = row.embedding as number[];
        }
        totalTokens += res.usage?.total_tokens ?? 0;
        break;
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        if (attempt === 0 && (status === 429 || (status >= 500 && status < 600))) {
          attempt++;
          await delay(RETRY_MS);
          continue;
        }
        throw err;
      }
    }
  }
  // sanity check
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) throw new Error(`embedTexts: missing vector at index ${i}`);
  }
  const spendUsd = totalTokens * USD_PER_TOKEN_EMBED_3_SMALL;
  return { vectors: out, totalTokens, spendUsd, mocked: false };
}

/** 単発便利 helper (chunk 単位の re-embed 等)。 */
export async function embedOne(text: string): Promise<number[]> {
  const r = await embedTexts([text]);
  return r.vectors[0]!;
}

export function isEmbeddingMocked(): boolean {
  return !env.OPENAI_API_KEY;
}
