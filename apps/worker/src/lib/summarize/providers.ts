import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
  TranscriptSegment,
  SentimentSample,
} from '@ksp/shared';
import {
  commitmentSchema,
  nextActionSchema,
  sentimentSampleSchema,
} from '@ksp/shared';
import { logger } from '../logger.js';

/**
 * 録画文字起こし → 商談要約 / 抽出 provider 抽象 (Phase2G T-012)。
 *
 * 設計:
 *   - 実装は 2 つ: Mock / Claude (Anthropic Messages API)
 *   - 入力は TranscribeProvider が出した TranscriptSegment[]
 *   - 出力は recordings テーブルの summary/key_points/customer_needs/objections/
 *     next_actions/commitments/sentiment_timeline を埋めるための構造化 JSON
 *   - cost は input/output tokens × per-model price で算出
 *
 * Round 4 (本実装化):
 *   - ClaudeProvider が Anthropic Messages API を実呼出。
 *     model=claude-sonnet-4-5, max_tokens=2048, timeout=60s, maxRetries=0.
 *   - response_format は強制不可なので prompt 内で「JSON のみで返す」と明示し、
 *     先頭 ```json フェンスを許容する寛容な parser で吸収する。
 *   - usage.input_tokens / output_tokens を実値として保持し cost を算出。
 *   - PII 検知は recording-summarize.ts 側の責務 (本 provider は触らない)。
 */

// ----------------------------------------------------------------------------
// 出力 schema (Mock fixture も含めて自己検証する)
// ----------------------------------------------------------------------------

export const summarizeResultSchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string()).max(20),
  customerNeeds: z.array(z.string()).max(20),
  objections: z.array(z.string()).max(20),
  nextActions: z.array(nextActionSchema).max(20),
  commitments: z.array(commitmentSchema).max(20),
  sentimentTimeline: z.array(sentimentSampleSchema).max(200),
  /** Anthropic input tokens */
  inputTokens: z.number().int().nonnegative(),
  /** Anthropic output tokens */
  outputTokens: z.number().int().nonnegative(),
  /** USD 概算 (cost-guard 用) */
  estimatedCostUsd: z.number().nonnegative(),
  /** provider 名 */
  provider: z.string().min(1),
});
export type SummarizeResult = z.infer<typeof summarizeResultSchema>;

export interface SummarizeProvider {
  readonly name: string;
  summarize(transcript: TranscriptSegment[]): Promise<SummarizeResult>;
}

export class SummarizeNotConfiguredError extends Error {
  override readonly name = 'SummarizeNotConfiguredError';
  constructor(missing: string) {
    super(`Summarize provider not configured: ${missing}`);
  }
}

/**
 * Claude が JSON を返さなかった / 期待形を満たさなかった場合の構造化エラー。
 * 呼出側 (recording-summarize.ts) は processing_status='failed' で吸収する。
 */
export class SummarizeParseError extends Error {
  override readonly name = 'SummarizeParseError';
  constructor(reason: string, public readonly rawSnippet: string) {
    super(`summarize parse failed: ${reason}`);
  }
}

// ----------------------------------------------------------------------------
// price table (USD per 1M tokens). Anthropic 公式 2026-05 時点。
// 25_v2_review_resolutions / 12_cost_estimate v2.2 と整合させる。
// ----------------------------------------------------------------------------
const PRICE_USD_PER_M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  // claude-sonnet-4-5
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  // claude-opus-4-7 (1M context)
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  // fallback (Mock など)
  default: { input: 0, output: 0 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICE_USD_PER_M_TOKENS[model] ?? PRICE_USD_PER_M_TOKENS.default!;
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}

// ============================================================================
// Mock provider
// ============================================================================

/**
 * 決定論的 fixture を返す Mock。e2e / dev / CI 向け。
 *
 * fixture は recordings テーブルの jsonb 列 1 つずつに対応。
 * - summary: 商談 1 文要約
 * - keyPoints: 3 件
 * - customerNeeds / objections: 各 2 件
 * - commitments / nextActions: 各 2 件
 * - sentimentTimeline: 3 サンプル (-1 〜 +1)
 */
export class MockSummarizeProvider implements SummarizeProvider {
  readonly name = 'mock';

  async summarize(transcript: TranscriptSegment[]): Promise<SummarizeResult> {
    const segCount = transcript.length;
    const sentimentTimeline: SentimentSample[] = [
      { atSec: 0, value: 0.1, speakerLabel: 'host' },
      { atSec: 30, value: 0.4, speakerLabel: 'guest' },
      { atSec: 90, value: 0.7, speakerLabel: 'guest' },
    ];
    for (const s of sentimentTimeline) sentimentSampleSchema.parse(s);

    const result: SummarizeResult = {
      summary:
        '営業ツール検討中の見込み客に対して、製品概要と次回見積もり送付を約束した初回商談。',
      keyPoints: [
        '営業効率化ツールの検討段階',
        '貴社製品への興味あり',
        '次回までに見積もりと導入事例を送付',
      ],
      customerNeeds: ['営業効率化', '導入実績の確認'],
      objections: ['予算規模が未確定', '社内稟議プロセスが長い'],
      nextActions: [
        { what: '見積もりを送付する', owner: 'host', dueDate: null },
        { what: '導入事例を 2 社分共有する', owner: 'host', dueDate: null },
      ],
      commitments: [
        { who: 'host', what: '見積もりを送付', byWhen: null, atSec: 78 },
        { who: 'guest', what: '社内検討の上回答', byWhen: null, atSec: 110 },
      ],
      sentimentTimeline,
      inputTokens: Math.max(100, segCount * 80),
      outputTokens: 200,
      estimatedCostUsd: 0,
      provider: 'mock',
    };
    return summarizeResultSchema.parse(result);
  }
}

// ============================================================================
// Claude provider (本実装)
// ============================================================================

/**
 * 設計書 14_llm_prompts PROMPT-01 準拠の system prompt。
 *
 * 7 項目 (summary / keyPoints / customerNeeds / objections / nextActions /
 * commitments / sentimentTimeline) を JSON で返すよう指示。
 * 余計な前置き / 説明文を抑えるため「JSON のみ」「コードフェンスは任意」と
 * 明記する (parser はフェンス除去に対応)。
 */
const SUMMARIZE_SYSTEM_PROMPT = `あなたは日本語の B2B 営業商談を構造化要約する AI アシスタントです。
次の商談トランスクリプトを読み、以下の 7 項目を JSON で返してください。

# 出力フォーマット (必ずこの JSON のみを返す。説明文や前置きは出力しない)

{
  "summary": "商談全体を 1〜2 文で日本語要約",
  "keyPoints": ["重要ポイントを最大 8 件、各 30 字以内"],
  "customerNeeds": ["顧客の課題・ニーズを最大 8 件、各 40 字以内"],
  "objections": ["顧客側の懸念・反論を最大 8 件、各 40 字以内"],
  "nextActions": [
    { "what": "次のアクション内容", "owner": "host|guest|null", "dueDate": "YYYY-MM-DD or null" }
  ],
  "commitments": [
    { "who": "host|guest", "what": "約束内容", "byWhen": "YYYY-MM-DD or null", "atSec": 秒数 }
  ],
  "sentimentTimeline": [
    { "atSec": 秒数, "value": -1〜1, "speakerLabel": "host|guest|null" }
  ]
}

# ルール
- 推測せず、トランスクリプトに根拠がある内容のみ抽出する
- 該当が無い項目は空配列 [] を返す
- sentimentTimeline は 3〜10 サンプル程度、商談前半・中盤・後半をカバーする
- atSec / byWhen / dueDate が不明な場合は null とする
- JSON 以外の文字列 (説明・コードフェンス) は出力しないこと。ただしコードフェンスで囲った場合も parse 可能とする`;

/**
 * Anthropic Claude Messages API で商談要約を JSON で返す provider。
 *
 * 実装ポイント:
 *   - SDK `@anthropic-ai/sdk` の `client.messages.create()` を使う
 *   - model: claude-sonnet-4-5 (cost と品質のバランス)
 *   - timeout 60s + AbortSignal.timeout(60s) で二重保険、maxRetries=0
 *     (pgmq visibility timeout が retry を担う)
 *   - response JSON を tolerant parser で抽出 → zod validate
 *   - usage.input_tokens / output_tokens から estimatedCostUsd 算出
 *
 * 失敗パターン:
 *   - ANTHROPIC_API_KEY 不在 / 'sk-ant-test' → SummarizeNotConfiguredError
 *   - timeout (60s 超) → APIUserAbortError / AbortError 伝播 (recording-summarize 側で failed)
 *   - JSON parse 失敗 / schema 不一致 → SummarizeParseError
 */
export class ClaudeProvider implements SummarizeProvider {
  readonly name = 'claude';

  private readonly client: Anthropic;
  /** factory から渡された (or fallback で構築した) raw key。logging では出さない。 */
  private readonly apiKey: string;
  private readonly model: string;
  /**
   * Round 2 SRE P1-SRE-03: 外部 API timeout。Anthropic SDK は
   * `new Anthropic({ timeout: ... })` で per-client timeout を取れる。
   * AbortSignal.timeout(60s) と二重に保険を掛ける。
   */
  private static readonly REQUEST_TIMEOUT_MS = 60_000;
  /** 出力上限。要約 7 項目で 2048 tokens あれば充分。 */
  private static readonly MAX_OUTPUT_TOKENS = 2048;

  constructor(
    apiKey: string | undefined = process.env.ANTHROPIC_API_KEY,
    model = 'claude-sonnet-4-5',
  ) {
    if (!apiKey || apiKey.length === 0 || apiKey === 'sk-ant-test') {
      throw new SummarizeNotConfiguredError('ANTHROPIC_API_KEY');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.client = new Anthropic({
      apiKey,
      timeout: ClaudeProvider.REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  async summarize(transcript: TranscriptSegment[]): Promise<SummarizeResult> {
    const log = logger.child({
      op: 'summarize.claude',
      model: this.model,
      segmentCount: transcript.length,
    });

    // ---- user message: transcript を [HH:MM:SS speakerLabel] text 形式で展開 ----
    const userText = formatTranscriptForPrompt(transcript);

    // ---- API call ----
    // 二重 timeout: SDK の per-client `timeout` + AbortSignal.timeout(60s)
    let res;
    try {
      res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: ClaudeProvider.MAX_OUTPUT_TOKENS,
          system: SUMMARIZE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userText }],
        },
        { signal: AbortSignal.timeout(ClaudeProvider.REQUEST_TIMEOUT_MS) },
      );
    } catch (err) {
      log.error(
        { err: (err as Error).message, name: (err as Error).name },
        'anthropic messages.create failed',
      );
      throw err;
    }

    // ---- text 抽出: content[] から type='text' のみ連結 ----
    const text = (res.content ?? [])
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (text.length === 0) {
      throw new SummarizeParseError('empty text response', '');
    }

    // ---- JSON parse (寛容: ```json``` フェンスを除去) ----
    const parsed = parseJsonLoose(text);
    if (!parsed.ok) {
      throw new SummarizeParseError(parsed.reason, text.slice(0, 200));
    }

    // ---- schema 変換 (Anthropic 側 schema → SummarizeResult) ----
    const inputTokens = Math.max(0, Number(res.usage?.input_tokens) || 0);
    const outputTokens = Math.max(0, Number(res.usage?.output_tokens) || 0);
    const estimatedCostUsd = estimateCostUsd(this.model, inputTokens, outputTokens);

    const result = buildSummarizeResult(parsed.value, {
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      provider: this.name,
    });

    log.info(
      {
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        keyPointsCount: result.keyPoints.length,
        commitmentsCount: result.commitments.length,
      },
      'claude summarize completed',
    );

    void this.apiKey;
    return summarizeResultSchema.parse(result);
  }
}

// ============================================================================
// helpers: prompt formatter / JSON parser / schema 変換
// ============================================================================

/**
 * TranscriptSegment[] → prompt 用 1 行 / segment の文字列。
 * 1 char ≈ 0.5 token なので 20000 chars ≈ 10000 tokens 想定。
 * 長文は head-tail で切らず、そのまま渡す (Sonnet の 200k context に十分収まる)。
 */
function formatTranscriptForPrompt(segments: TranscriptSegment[]): string {
  if (segments.length === 0) {
    return '(トランスクリプトなし。空配列で要約してください)';
  }
  return segments
    .map((s) => {
      const tStart = formatSec(s.startSec);
      const sp = s.speakerLabel ?? 'unknown';
      return `[${tStart} ${sp}] ${s.text}`;
    })
    .join('\n');
}

function formatSec(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * 寛容な JSON parser。
 *  - ```json ... ``` / ``` ... ``` フェンスを除去
 *  - 先頭/末尾の非 JSON テキストを `{` / `}` の対で切り出す
 */
function parseJsonLoose(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let body = text.trim();

  // code fence 除去
  const fenceMatch = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch && fenceMatch[1]) {
    body = fenceMatch[1].trim();
  }

  // 先頭が `{` でなければ、最初の `{` から最後の `}` までを取り出す
  if (!body.startsWith('{')) {
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first >= 0 && last > first) {
      body = body.slice(first, last + 1);
    }
  }

  try {
    const v = JSON.parse(body);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { ok: true, value: v as Record<string, unknown> };
    }
    return { ok: false, reason: 'top-level is not an object' };
  } catch (err) {
    return { ok: false, reason: `JSON.parse: ${(err as Error).message}` };
  }
}

/**
 * Claude が返した素 JSON → SummarizeResult への正規化。
 * - 配列以外は [] にフォールバック
 * - dueDate / byWhen の YYYY-MM-DD バリデーションは zod schema が担う
 * - summary が空文字なら placeholder を入れて schema を通す
 */
function buildSummarizeResult(
  raw: Record<string, unknown>,
  meta: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    provider: string;
  },
): SummarizeResult {
  const summary =
    typeof raw.summary === 'string' && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : '(要約なし)';

  const keyPoints = toStringArray(raw.keyPoints).slice(0, 20);
  const customerNeeds = toStringArray(raw.customerNeeds).slice(0, 20);
  const objections = toStringArray(raw.objections).slice(0, 20);

  const nextActionsRaw = Array.isArray(raw.nextActions) ? raw.nextActions : [];
  const nextActions = nextActionsRaw
    .map((n) => normalizeNextAction(n))
    .filter((n): n is z.infer<typeof nextActionSchema> => n !== null)
    .slice(0, 20);

  const commitmentsRaw = Array.isArray(raw.commitments) ? raw.commitments : [];
  const commitments = commitmentsRaw
    .map((c) => normalizeCommitment(c))
    .filter((c): c is z.infer<typeof commitmentSchema> => c !== null)
    .slice(0, 20);

  const sentimentRaw = Array.isArray(raw.sentimentTimeline) ? raw.sentimentTimeline : [];
  const sentimentTimeline = sentimentRaw
    .map((s) => normalizeSentiment(s))
    .filter((s): s is SentimentSample => s !== null)
    .slice(0, 200);

  return {
    summary,
    keyPoints,
    customerNeeds,
    objections,
    nextActions,
    commitments,
    sentimentTimeline,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    estimatedCostUsd: meta.estimatedCostUsd,
    provider: meta.provider,
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0);
}

function normalizeNextAction(v: unknown): z.infer<typeof nextActionSchema> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.what !== 'string' || o.what.trim().length === 0) return null;
  const candidate = {
    what: o.what.trim(),
    owner: typeof o.owner === 'string' && o.owner.trim().length > 0 ? o.owner.trim() : null,
    dueDate: typeof o.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.dueDate) ? o.dueDate : null,
  };
  const parsed = nextActionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function normalizeCommitment(v: unknown): z.infer<typeof commitmentSchema> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.who !== 'string' || o.who.trim().length === 0) return null;
  if (typeof o.what !== 'string' || o.what.trim().length === 0) return null;
  const candidate: Record<string, unknown> = {
    who: o.who.trim(),
    what: o.what.trim(),
    byWhen:
      typeof o.byWhen === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.byWhen) ? o.byWhen : null,
  };
  if (typeof o.atSec === 'number' && Number.isFinite(o.atSec) && o.atSec >= 0) {
    candidate.atSec = o.atSec;
  }
  const parsed = commitmentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function normalizeSentiment(v: unknown): SentimentSample | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.atSec !== 'number' || !Number.isFinite(o.atSec) || o.atSec < 0) return null;
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return null;
  // clamp -1..1
  const value = Math.max(-1, Math.min(1, o.value));
  const sp = typeof o.speakerLabel === 'string' && o.speakerLabel.length > 0 ? o.speakerLabel : null;
  const candidate: SentimentSample = { atSec: o.atSec, value, speakerLabel: sp };
  const parsed = sentimentSampleSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ============================================================================
// factory
// ============================================================================

/**
 * env 状況から SummarizeProvider を 1 つ選んで返す。
 *
 * 選択優先度:
 *   1. process.env.SUMMARIZE_PROVIDER ('mock' | 'claude' | 'anthropic' | 'auto')
 *      が明示されていればそれ。鍵が無くて構築失敗したら Mock に fallback。
 *   2. 'auto' (default) は ANTHROPIC_API_KEY (非 test) があれば Claude、なければ Mock。
 *
 * **常に成功する** (throw しない) のが規約。
 */
export function pickProvider(
  envOverride: NodeJS.ProcessEnv = process.env,
): SummarizeProvider {
  const log = logger.child({ op: 'summarize.pickProvider' });
  const explicit = (envOverride.SUMMARIZE_PROVIDER ?? '').toLowerCase().trim();

  if (explicit === 'mock') {
    return new MockSummarizeProvider();
  }
  if (explicit === 'claude' || explicit === 'anthropic') {
    try {
      return new ClaudeProvider(envOverride.ANTHROPIC_API_KEY);
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'ClaudeProvider unavailable, fallback to Mock',
      );
      return new MockSummarizeProvider();
    }
  }

  // 'auto' or unset / unknown value → ANTHROPIC_API_KEY presence 判定
  const anthropic = envOverride.ANTHROPIC_API_KEY;
  if (anthropic && anthropic.length > 0 && !anthropic.startsWith('sk-ant-test')) {
    try {
      return new ClaudeProvider(anthropic);
    } catch {
      // fallthrough
    }
  }

  log.info('no summarize API keys present; using MockSummarizeProvider');
  return new MockSummarizeProvider();
}
