import { EMBEDDING_DIM, EMBEDDING_MODEL } from '@ksp/shared';

/**
 * OpenAI text-embedding-3-small (1536-dim) を fetch で直接呼ぶ helper。
 *
 * 設計判断:
 *   - apps/web は SDK (openai npm) を入れずに fetch だけで済ませる
 *     (bundle size と Edge runtime 互換のため)。
 *   - OPENAI_API_KEY が無い環境 (dev/CI) では deterministic mock を返し
 *     UI/API が動くことを優先する (本番は env validator 側で必須化)。
 *   - mock は「同じ入力 → 同じ vector」を保証するため、文字列ハッシュベース。
 *     vector は L2 正規化済 (match_knowledge の cosine sim と整合)。
 *
 * セキュリティ:
 *   - API key は環境変数のみ。クライアント (NEXT_PUBLIC_*) には絶対漏らさない。
 *   - 入力テキストは 8192 token 上限 (OpenAI 制限) を超えないよう呼び出し側で
 *     trim する責務。本ファイルはバイト長 32KB で hard-cut する safety net。
 */

const MAX_INPUT_BYTES = 32 * 1024;
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const REQ_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 50;

function clampText(text: string): string {
  // UTF-8 のバイト長で打ち切り (over-allocate しない)
  const buf = new TextEncoder().encode(text);
  if (buf.byteLength <= MAX_INPUT_BYTES) return text;
  return new TextDecoder().decode(buf.slice(0, MAX_INPUT_BYTES));
}

/** xmur3 - deterministic 32-bit string hash (used for mock seeding). */
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

/** input が空でも 1536-dim L2 正規化済 vector を返す。 */
export function mockEmbedding(input: string): number[] {
  const rand = xmur3(input.length === 0 ? 'ksp:empty' : `ksp:${input}`);
  const v = new Array<number>(EMBEDDING_DIM);
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    // [-1, 1) 一様
    const r = rand() * 2 - 1;
    v[i] = r;
    norm += r * r;
  }
  const scale = 1 / Math.sqrt(norm || 1);
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] = (v[i] ?? 0) * scale;
  return v;
}

interface OpenAIEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens?: number };
}

async function fetchEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // dev / CI: mock fallback
    return inputs.map(mockEmbedding);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const e = new Error(`OpenAI embedding API failed: ${res.status} ${detail.slice(0, 200)}`);
      (e as Error & { status: number }).status = res.status;
      throw e;
    }
    const json = (await res.json()) as OpenAIEmbedResponse;
    if (!Array.isArray(json.data) || json.data.length !== inputs.length) {
      throw new Error('OpenAI embedding response shape unexpected');
    }
    // index に従って並び替え (API は通常 input 順だが念のため)
    const out = new Array<number[]>(inputs.length);
    for (const row of json.data) {
      if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIM) {
        throw new Error('OpenAI embedding dimension mismatch');
      }
      out[row.index] = row.embedding;
    }
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) throw new Error(`OpenAI embedding response missing index ${i}`);
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** 1 件用 — ハイブリッド検索のクエリ embed に使う。 */
export async function embedQuery(text: string): Promise<number[]> {
  const t = clampText(text);
  const [vec] = await fetchEmbeddings([t]);
  return vec ?? mockEmbedding(t);
}

/** 50 件ずつ batch して OpenAI に投げる。 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const clamped = texts.map(clampText);
  const out: number[][] = [];
  for (let i = 0; i < clamped.length; i += BATCH_SIZE) {
    const slice = clamped.slice(i, i + BATCH_SIZE);
    const result = await fetchEmbeddings(slice);
    out.push(...result);
  }
  return out;
}

/** OPENAI_API_KEY 未設定なら true (mock 経路)。観測ログ用。 */
export function isEmbeddingMocked(): boolean {
  return !process.env.OPENAI_API_KEY;
}
