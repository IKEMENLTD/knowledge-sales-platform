/**
 * LLM rerank — 18_search_knowledge_quality.md `top200→rerank top20` の実装。
 *
 * 役割:
 *   - RRF 統合後の top 30 を Claude haiku に渡し、クエリとの関連度で並べ替え
 *   - 戻り値は **クライアントが要求した limit までに切る前** の reordered hits
 *
 * 入力:
 *   - query: string (元クエリ or expanded canonical どちらでも可)
 *   - hits: SearchHit[] (RRF + recency 適用後の top 30)
 *
 * 出力:
 *   - 並べ替え済 SearchHit[] (同じ要素数。重複や脱落は無い)
 *   - reranker が動かなかった場合は **入力をそのまま返す** (no-op + 例外なし)
 *
 * Cost:
 *   - 30 hits × ~30 tokens snippet ≈ 1000 入力 + 50 出力 = ~$0.0035/query
 *     (haiku $1/M in, $5/M out — 公式)
 *   - cost-guard で COST_CAPS.perConversationUsd ($0.1) を超えるなら skip
 *
 * 設計判断:
 *   - PROMPT 設計: 各 hit に通し番号 [1..30] を振り、LLM には番号配列 (例: [5,1,12,...]) を
 *     返させる。snippet/title を逐次出力させない (output token を 1/10 に圧縮)。
 *   - LLM が壊れた応答を返した場合: 入力順をそのまま採用 (検索可用性 P-1 厳守)。
 *   - hits.length <= 1 なら API 呼出を完全 skip (並べ替え不要)。
 *
 * Phase 2 拡張:
 *   - hits に scoreBreakdown.rerank を埋める (現状は score だけ更新)
 */

import type { SearchHit } from '@ksp/shared';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const REQ_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 256;

/** haiku price (per 1M tokens). */
const PRICE_USD_PER_M = { input: 1.0, output: 5.0 } as const;

/** 1 度に rerank する最大件数。これを超えたら splice して上位だけ rerank する。 */
const RERANK_TOP_K = 30;

/** 1 hit snippet を prompt 内で何文字に丸めるか。 */
const SNIPPET_CLAMP = 140;

export interface RerankOptions {
  /**
   * 概算 cost cap (USD)。本リクエストで rerank に掛けてよい上限。
   * route.ts では COST_CAPS.perConversationUsd を渡す前提。
   */
  costCapUsd: number;
  /**
   * 入力時点での既消費 cost (query-expansion の使った分など)。
   * costCapUsd - alreadySpentUsd が rerank に使える budget となる。
   */
  alreadySpentUsd?: number;
  /** test 用 model override (default: claude-haiku-4-5)。 */
  model?: string;
}

export interface RerankResult {
  hits: SearchHit[];
  /** rerank が実際に動いたか。skip 時は入力そのまま返す。 */
  reranked: boolean;
  /** 概算 cost USD (skip 時 0)。 */
  estimatedCostUsd: number;
  /** skip 理由 (debug / logging 用、rerank=true 時は undefined)。 */
  skipReason?: 'no_api_key' | 'too_few_hits' | 'cost_cap' | 'parse_failed' | 'api_error';
}

/**
 * メイン関数。**throw しない** (検索可用性 P-1)。
 */
export async function rerankWithLLM(
  query: string,
  hits: SearchHit[],
  options: RerankOptions,
): Promise<RerankResult> {
  if (hits.length <= 1) {
    return { hits, reranked: false, estimatedCostUsd: 0, skipReason: 'too_few_hits' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length === 0 || apiKey.startsWith('sk-ant-test')) {
    return { hits, reranked: false, estimatedCostUsd: 0, skipReason: 'no_api_key' };
  }

  // cost-guard: 予測消費を事前に見積もって cap を超えるなら skip
  const slice = hits.slice(0, RERANK_TOP_K);
  const estimatedTokensIn = estimateInputTokens(query, slice);
  const estimatedTokensOut = MAX_OUTPUT_TOKENS; // 上限値で保守的に見積もる
  const projectedCost =
    (estimatedTokensIn / 1_000_000) * PRICE_USD_PER_M.input +
    (estimatedTokensOut / 1_000_000) * PRICE_USD_PER_M.output;
  const budget = options.costCapUsd - (options.alreadySpentUsd ?? 0);
  if (projectedCost > budget) {
    return { hits, reranked: false, estimatedCostUsd: 0, skipReason: 'cost_cap' };
  }

  // 実呼出
  let order: number[] | null;
  let actualCost = 0;
  try {
    const r = await callRerank(query, slice, apiKey, options.model ?? MODEL);
    order = r.order;
    actualCost = r.estimatedCostUsd;
  } catch {
    return { hits, reranked: false, estimatedCostUsd: 0, skipReason: 'api_error' };
  }

  if (!order) {
    return { hits, reranked: false, estimatedCostUsd: actualCost, skipReason: 'parse_failed' };
  }

  const reordered = applyOrder(hits, slice.length, order);
  return { hits: reordered, reranked: true, estimatedCostUsd: actualCost };
}

// ----------------------------------------------------------------------------
// internal — prompt assembly + API call + parsing
// ----------------------------------------------------------------------------

const PROMPT_SYSTEM = `あなたは日本語のB2B営業検索エンジンの再ランカーです。
ユーザーのクエリと候補リストを読み、クエリに関連性の高い順に並べ替えてください。

# 出力フォーマット (必ず JSON 配列のみ。説明文や前置きは出力しない)
[1, 5, 3, 12, ...]

# ルール
- 配列の要素は候補の番号 (1〜N)。N は候補数。
- 関連性が高い順 (= 上位に出すべき順) に並べる。
- すべての番号を 1 回ずつ含める (脱落・重複なし)。
- 配列以外 (説明、コードフェンス) は絶対に出力しない。`;

interface CallRerankResult {
  order: number[] | null;
  estimatedCostUsd: number;
}

async function callRerank(
  query: string,
  hits: SearchHit[],
  apiKey: string,
  model: string,
): Promise<CallRerankResult> {
  const userText = buildUserPrompt(query, hits);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: PROMPT_SYSTEM,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    const inputTokens = Math.max(0, Number(json.usage?.input_tokens) || 0);
    const outputTokens = Math.max(0, Number(json.usage?.output_tokens) || 0);
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * PRICE_USD_PER_M.input +
      (outputTokens / 1_000_000) * PRICE_USD_PER_M.output;

    const order = parseOrderArray(text, hits.length);
    return { order, estimatedCostUsd };
  } finally {
    clearTimeout(timer);
  }
}

/** prompt 本体組み立て (snippet を clamp、番号は 1-based)。 */
export function buildUserPrompt(query: string, hits: SearchHit[]): string {
  const lines: string[] = [];
  lines.push(`クエリ: 「${query}」`);
  lines.push('');
  lines.push('# 候補リスト');
  hits.forEach((h, i) => {
    const sn = (h.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CLAMP);
    lines.push(`[${i + 1}] ${h.kind} | ${h.title} — ${sn}`);
  });
  lines.push('');
  lines.push(
    '上記候補をクエリへの関連性が高い順に並べ替え、番号配列のみで JSON 出力してください。',
  );
  return lines.join('\n');
}

/** 4 chars ≒ 1 token ざっくり換算 (実測 ja で 3-4)。 */
function estimateInputTokens(query: string, hits: SearchHit[]): number {
  const promptOverhead = 400; // system + 固定文言
  const charBudget =
    query.length +
    hits.reduce(
      (acc, h) =>
        acc + (h.title?.length ?? 0) + Math.min(SNIPPET_CLAMP, (h.snippet ?? '').length) + 20,
      0,
    );
  return Math.ceil(charBudget / 3) + promptOverhead;
}

/**
 * 「[1,5,3,...]」を期待。
 * - 配列でなければ null
 * - 重複や範囲外は捨て、不足分は元の順序で末尾に補完
 */
export function parseOrderArray(text: string, n: number): number[] | null {
  let body = text.trim();
  // ```json``` フェンス除去
  const fence = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (fence && fence[1]) body = fence[1].trim();
  // 先頭 `[` を探す
  if (!body.startsWith('[')) {
    const first = body.indexOf('[');
    const last = body.lastIndexOf(']');
    if (first >= 0 && last > first) body = body.slice(first, last + 1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of raw) {
    const n0 = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n0)) continue;
    const i = Math.trunc(n0);
    if (i < 1 || i > n) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  // 抜けた番号があれば末尾に補完
  for (let i = 1; i <= n; i++) {
    if (!seen.has(i)) out.push(i);
  }
  return out;
}

/**
 * order (1-based, 長さ sliceLen) を hits に適用。
 * hits.length > sliceLen の場合、超過分は元の順序を保ったまま末尾に残す。
 */
export function applyOrder(hits: SearchHit[], sliceLen: number, order: number[]): SearchHit[] {
  const head: SearchHit[] = [];
  for (const idx of order) {
    const h = hits[idx - 1];
    if (h) head.push(h);
  }
  const tail = hits.slice(sliceLen);
  return [...head, ...tail];
}

/** API skip 中か (env 不在判定)。観測用。 */
export function isRerankDisabled(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return !apiKey || apiKey.length === 0 || apiKey.startsWith('sk-ant-test');
}
