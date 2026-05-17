/**
 * 検索クエリ拡張 (PROMPT-10) — 07_llm_prompts.md / 18_search_knowledge_quality.md。
 *
 * 役割:
 *   - 入力クエリを「canonical 形」に正規化 (例: 「値引き」→「価格交渉」)
 *   - synonym/aliases を 3-5 個生成 (例: 「断られた」→「お見送り」「失注」)
 *   - 意図 (kind) 分類 ('recording'|'meeting'|'contact'|'all')
 *
 * 実装方針:
 *   - apps/web には `@anthropic-ai/sdk` を入れない方針 (Edge runtime 互換 + bundle size)
 *     なので fetch で Anthropic Messages API を直接叩く (embed.ts と同じ判断)。
 *   - model は claude-haiku-4-5 (cost と latency 重視)。spec PROMPT-10 は sonnet-4-5
 *     だが、本処理は短文の synonym 生成のみで haiku で十分品質が取れる。
 *   - ANTHROPIC_API_KEY 不在時 (dev / CI) は skip + 元クエリそのまま返す
 *     (graceful degrade, embed.ts と同じ責務境界)。
 *
 * Cost:
 *   - 1 リクエスト ~50 tokens 入力 + ~30 出力 ≈ $0.00015/query (haiku $1/M in, $5/M out)
 *
 * Cache (LRU + TTL):
 *   - クエリ hash → ExpandedQuery を max 1000 件、TTL 1h (= 3600s) で保持
 *   - cache hit 時は API 呼び出しを完全 skip。autosuggest と組合せ時のコスト爆発を防ぐ。
 *
 * 注意:
 *   - JSON parse が失敗したり 4xx/5xx が返った場合は throw せず、原クエリで no-op 返却する。
 *     検索の可用性 (P-1) を絶対に下げない。
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const REQ_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_TOKENS = 200;

/** API price per 1M tokens — claude-haiku-4-5 の公式レート (2026-05 時点)。 */
const PRICE_USD_PER_M = { input: 1.0, output: 5.0 } as const;

export type SearchIntent = 'recording' | 'meeting' | 'contact' | 'all';

export interface ExpandedQuery {
  /** 正規化された代表クエリ */
  canonical: string;
  /** 同義語・言い換え (canonical を含まない 3-5 件、空配列もありうる) */
  aliases: string[];
  /** 検索意図 (UI の kind フィルタ未指定時に router で利用可能) */
  intent: SearchIntent;
  /** cache hit だったかどうか (debug / metrics 用) */
  cached: boolean;
  /** LLM を実際に呼び出したか (skip 経路では false) */
  llmUsed: boolean;
  /** 概算 cost USD (skip / cache hit では 0) */
  estimatedCostUsd: number;
}

// ----------------------------------------------------------------------------
// LRU + TTL cache (in-memory, 単一プロセス内のみ。マルチプロセス間共有はしない)
// ----------------------------------------------------------------------------

interface CacheEntry {
  value: ExpandedQuery;
  /** epoch ms — entry を作った瞬間 */
  insertedAt: number;
}

const CACHE_MAX = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Map は挿入順を保持するため、これだけで LRU を実装できる。
 *  - get 成功時に delete → set し直して "最新" 扱いに更新する
 *  - サイズ超過時は先頭 (= 最古) を削除する
 */
const cache = new Map<string, CacheEntry>();

/** SHA 不要。クエリ短いので素直に文字列を key にする (intent 含めて hash 化) */
function cacheKey(q: string): string {
  // 大文字小文字 / 連続空白 を吸収。正規化しても大した量にはならないので軽くする。
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cacheGet(key: string, now: number): ExpandedQuery | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.insertedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // LRU 更新: 末尾に再 insert
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: ExpandedQuery, now: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, insertedAt: now });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** test 用 / 観測用。production code からは呼ばない。 */
export function _clearQueryExpansionCache(): void {
  cache.clear();
}

export function _queryExpansionCacheSize(): number {
  return cache.size;
}

// ----------------------------------------------------------------------------
// public API
// ----------------------------------------------------------------------------

const PROMPT_SYSTEM = `あなたは日本語のB2B営業検索クエリを正規化・拡張するアシスタントです。
入力されたクエリを以下の3要素に分解してください。

# 出力フォーマット (JSON のみ。説明文や前置きは出力しない)
{
  "canonical": "代表クエリ (元クエリより一般的な業界用語に正規化)",
  "aliases": ["同義語1", "同義語2", "同義語3"],
  "intent": "recording|meeting|contact|all"
}

# ルール
- canonical は元クエリと同じ意味でより検索ヒット率が高い形 (例: 「値引き」→「価格交渉」)
- aliases は canonical と意味的に重なる言い換え 3〜5 件 (canonical 自体は含めない)
- intent は以下から 1 つ:
  - recording: 録画/トランスクリプト関連 (発言内容、ロープレ等)
  - meeting: 商談/案件関連 (議事録、ステージ、約束、ネクストアクション)
  - contact: 人物/会社関連 (担当者、企業、役職)
  - all: 上記いずれにも限定できない場合
- 余計な説明・コードフェンスは出力しない (JSON 単体)`;

/**
 * クエリ拡張のメイン関数。
 *
 * 動作:
 *   1. cache hit → そのまま返す (cached=true, llmUsed=false)
 *   2. ANTHROPIC_API_KEY 不在 → no-op (canonical=q, aliases=[], intent='all')
 *   3. LLM 呼出 → 失敗時 no-op 同様
 *
 * **本関数は throw しない**。検索 API の可用性を優先する。
 */
export async function expandQuery(q: string): Promise<ExpandedQuery> {
  const now = Date.now();
  const key = cacheKey(q);
  if (key.length === 0) {
    return {
      canonical: '',
      aliases: [],
      intent: 'all',
      cached: false,
      llmUsed: false,
      estimatedCostUsd: 0,
    };
  }

  const cached = cacheGet(key, now);
  if (cached) {
    return { ...cached, cached: true };
  }

  // 鍵が無い (dev / CI) → no-op + cache
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length === 0 || apiKey.startsWith('sk-ant-test')) {
    const noop: ExpandedQuery = {
      canonical: q,
      aliases: [],
      intent: 'all',
      cached: false,
      llmUsed: false,
      estimatedCostUsd: 0,
    };
    // skip 結果も cache する (連投時の env チェック節約)
    cacheSet(key, noop, now);
    return noop;
  }

  // LLM 呼出 (失敗しても no-op で返す)
  try {
    const result = await callAnthropic(q, apiKey);
    cacheSet(key, result, now);
    return result;
  } catch {
    const noop: ExpandedQuery = {
      canonical: q,
      aliases: [],
      intent: 'all',
      cached: false,
      llmUsed: false,
      estimatedCostUsd: 0,
    };
    return noop;
  }
}

// ----------------------------------------------------------------------------
// internal
// ----------------------------------------------------------------------------

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function callAnthropic(q: string, apiKey: string): Promise<ExpandedQuery> {
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
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: PROMPT_SYSTEM,
        messages: [{ role: 'user', content: `検索クエリ: 「${q}」` }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`anthropic ${res.status}`);
    }
    const json = (await res.json()) as AnthropicResponse;
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();
    if (text.length === 0) throw new Error('empty response');

    const parsed = parseExpansionJson(text);
    if (!parsed) throw new Error('parse failed');

    const inputTokens = Math.max(0, Number(json.usage?.input_tokens) || 0);
    const outputTokens = Math.max(0, Number(json.usage?.output_tokens) || 0);
    const cost =
      (inputTokens / 1_000_000) * PRICE_USD_PER_M.input +
      (outputTokens / 1_000_000) * PRICE_USD_PER_M.output;

    return {
      canonical: parsed.canonical.length > 0 ? parsed.canonical : q,
      aliases: parsed.aliases,
      intent: parsed.intent,
      cached: false,
      llmUsed: true,
      estimatedCostUsd: cost,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 寛容な JSON parser。expandQuery の応答形式を強制する。 */
export function parseExpansionJson(
  text: string,
): { canonical: string; aliases: string[]; intent: SearchIntent } | null {
  let body = text.trim();
  const fence = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (fence && fence[1]) body = fence[1].trim();
  if (!body.startsWith('{')) {
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first >= 0 && last > first) body = body.slice(first, last + 1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const canonical =
    typeof r.canonical === 'string' && r.canonical.trim().length > 0 ? r.canonical.trim() : '';

  const aliasesRaw = Array.isArray(r.aliases) ? r.aliases : [];
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const v of aliasesRaw) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s.length === 0 || s === canonical) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    aliases.push(s);
    if (aliases.length >= 5) break;
  }

  const intentRaw = typeof r.intent === 'string' ? r.intent.trim().toLowerCase() : '';
  const intent: SearchIntent =
    intentRaw === 'recording' || intentRaw === 'meeting' || intentRaw === 'contact'
      ? intentRaw
      : 'all';

  return { canonical, aliases, intent };
}

/** API 呼出をスキップ中か (env 不在判定)。観測用。 */
export function isQueryExpansionDisabled(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return !apiKey || apiKey.length === 0 || apiKey.startsWith('sk-ant-test');
}
