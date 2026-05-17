import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrResult } from '@ksp/shared';

/**
 * Claude PROMPT-02 OCR 後処理 (Phase2 P1-CT-07) の単体テスト。
 *
 * @anthropic-ai/sdk を vi.mock で stub し、Messages API JSON レスポンスを
 * ケースごとに切り替えて以下を検証する:
 *   - happy: 山田太郎 → name="山田 太郎" / nameKana / title / department / companyName canonical
 *   - 補強失敗 (API timeout) 時に Vision 結果がそのまま返る (throw しない)
 *   - cost 推定 (input/output tokens × Sonnet 単価) が Vision cost に加算される
 *   - NotConfigured (ANTHROPIC_API_KEY 不在) で skip + warn fallback
 *   - JSON parse 失敗時に Vision 結果が壊れない
 *   - GoogleVisionProvider が constructor option { enrichWithClaude:true } で
 *     recognize 末尾に enrich を呼ぶ E2E
 *   - factory が OCR_PROVIDER='gcv+claude' で enrich 有効化された Vision を返す
 */

// ============================================================================
// @anthropic-ai/sdk mock (summarize-claude.test.ts と同じパターン)
// ============================================================================

const mockCreate = vi.fn();
const constructorCalls: Array<Record<string, unknown>> = [];

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages: { create: typeof mockCreate };
    constructor(opts: Record<string, unknown>) {
      constructorCalls.push(opts);
      this.messages = { create: mockCreate };
    }
  }
  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic,
  };
});

// dynamic import (vi.mock の hoisting が効くように top-level import を避ける)
async function importModule() {
  return await import('../lib/ocr/claude-postprocess.js');
}

async function importProviders() {
  return await import('../lib/ocr/providers.js');
}

// ============================================================================
// fixtures
// ============================================================================

/**
 * Vision REST が出した OcrResult の典型例 (heuristic 未補強)。
 * - name は「山田太郎」(姓名未分離)
 * - nameKana は「やまだたろう」(スペース未挿入)
 * - title は "営業部：マネージャー" のコロン右側 = "マネージャー" のみ
 * - companyName は "(株)ナレッジさん" (canonical 化前)
 */
function visionOcrFixture(): OcrResult {
  return {
    rawText: [
      '(株)ナレッジさん',
      '営業部：マネージャー',
      '山田太郎',
      'やまだたろう',
      'taro.yamada@example.co.jp',
      '03-1234-5678',
      '東京都千代田区丸の内1-1-1',
      'https://www.linkedin.com/in/taro-yamada',
    ].join('\n'),
    fields: {
      name: '山田太郎',
      nameKana: 'やまだたろう',
      title: 'マネージャー',
      email: 'taro.yamada@example.co.jp',
      phone: '03-1234-5678',
      companyName: '(株)ナレッジさん',
      address: '東京都千代田区丸の内1-1-1',
    },
    fieldConfidence: {
      name: 0.85,
      nameKana: 0.83,
      title: 0.84,
      email: 0.98,
      phone: 0.92,
      companyName: 0.88,
      address: 0.85,
    },
    overallConfidence: 0.87,
    language: 'ja',
    provider: 'gcv',
    estimatedCostUsd: 0.0015,
  };
}

/**
 * Claude PROMPT-02 が返す JSON レスポンスを模した fixture。
 * - 姓名分離 / フリガナ / canonical 化 / 部署分離 を反映。
 */
function anthropicEnrichedFixture(opts?: {
  jsonOverride?: string;
  usage?: { input_tokens: number; output_tokens: number };
  withFence?: boolean;
}) {
  const json =
    opts?.jsonOverride ??
    JSON.stringify({
      name: '山田 太郎',
      nameKana: 'やまだ たろう',
      title: 'マネージャー',
      department: '営業部',
      companyName: '株式会社ナレッジさん',
      email: 'taro.yamada@example.co.jp',
      phone: '03-1234-5678',
      address: '東京都千代田区丸の内1-1-1',
      linkedinUrl: 'https://www.linkedin.com/in/taro-yamada',
      confidence: 0.92,
    });

  const text = opts?.withFence ? '```json\n' + json + '\n```' : json;

  return {
    id: 'msg_postprocess_01',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text }],
    usage: opts?.usage ?? { input_tokens: 600, output_tokens: 150 },
  };
}

// ============================================================================
// tests
// ============================================================================

describe('enrichWithClaude (PROMPT-02 OCR 後処理)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    constructorCalls.length = 0;
    // 各テスト個別で ANTHROPIC_API_KEY を有効値に上書き
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-live-postprocess-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('happy: Claude が姓名分離/フリガナ/canonical/部署+役職を返す → fields が補強される', async () => {
    const { enrichWithClaude } = await importModule();
    mockCreate.mockResolvedValueOnce(anthropicEnrichedFixture());

    const vision = visionOcrFixture();
    const enriched = await enrichWithClaude(vision);

    // SDK constructor: timeout 30s, maxRetries 0
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({
      apiKey: 'sk-ant-live-postprocess-test',
      timeout: 30_000,
      maxRetries: 0,
    });

    // create() 呼出パラメタ
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [body, options] = mockCreate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
    });
    expect(typeof body.system).toBe('string');
    expect(body.system).toContain('名刺 OCR 後処理');
    expect(body.messages[0].role).toBe('user');
    // rawText / 既存 fields が prompt に含まれる
    expect(body.messages[0].content).toContain('(株)ナレッジさん');
    expect(body.messages[0].content).toContain('"山田太郎"');
    expect(options?.signal).toBeInstanceOf(AbortSignal);

    // ---- 補強された fields ----
    // 姓名分離: 山田太郎 → "山田 太郎"
    expect(enriched.fields.name).toBe('山田 太郎');
    // フリガナ: スペース挿入
    expect(enriched.fields.nameKana).toBe('やまだ たろう');
    // department + title 合体保持
    expect(enriched.fields.title).toBe('営業部 マネージャー');
    // 会社名 canonical 化
    expect(enriched.fields.companyName).toBe('株式会社ナレッジさん');
    // 既存 email/phone/address は維持
    expect(enriched.fields.email).toBe('taro.yamada@example.co.jp');
    expect(enriched.fields.phone).toBe('03-1234-5678');
    expect(enriched.fields.address).toBe('東京都千代田区丸の内1-1-1');

    // provider 識別子: 'gcv' → 'gcv+claude'
    expect(enriched.provider).toBe('gcv+claude');
    // cost: Vision 0.0015 + Claude (600×$3/M + 150×$15/M) = 0.0015 + 0.0018 + 0.00225 = 0.00555
    const claudeCost = (600 / 1_000_000) * 3.0 + (150 / 1_000_000) * 15.0;
    expect(enriched.estimatedCostUsd).toBeCloseTo(0.0015 + claudeCost, 6);

    // field-level confidence: 上書きされた field は Claude confidence (0.92)
    expect(enriched.fieldConfidence.name).toBeCloseTo(0.92, 4);
    expect(enriched.fieldConfidence.nameKana).toBeCloseTo(0.92, 4);
    expect(enriched.fieldConfidence.companyName).toBeCloseTo(0.92, 4);
    expect(enriched.fieldConfidence.title).toBeCloseTo(0.92, 4);
    // 上書きされていない field は base のまま
    expect(enriched.fieldConfidence.email).toBeCloseTo(0.98, 4);

    // rawText / overallConfidence / language は変えない
    expect(enriched.rawText).toBe(vision.rawText);
    expect(enriched.overallConfidence).toBeCloseTo(vision.overallConfidence, 4);
    expect(enriched.language).toBe('ja');
  });

  it('code fence: ```json``` で囲まれたレスポンスも寛容に parse できる', async () => {
    const { enrichWithClaude } = await importModule();
    mockCreate.mockResolvedValueOnce(anthropicEnrichedFixture({ withFence: true }));

    const enriched = await enrichWithClaude(visionOcrFixture());

    expect(enriched.provider).toBe('gcv+claude');
    expect(enriched.fields.name).toBe('山田 太郎');
    expect(enriched.fields.companyName).toBe('株式会社ナレッジさん');
  });

  it('cost 推定: 高 token 使用時に Sonnet 単価通り Vision cost に加算される', async () => {
    const { enrichWithClaude } = await importModule();
    mockCreate.mockResolvedValueOnce(
      anthropicEnrichedFixture({
        usage: { input_tokens: 2_000, output_tokens: 400 },
      }),
    );

    const vision = visionOcrFixture();
    const enriched = await enrichWithClaude(vision);

    // 2000 × $3/M + 400 × $15/M = $0.006 + $0.006 = $0.012
    const claudeCost = (2_000 / 1_000_000) * 3.0 + (400 / 1_000_000) * 15.0;
    expect(claudeCost).toBeCloseTo(0.012, 6);
    expect(enriched.estimatedCostUsd).toBeCloseTo(0.0015 + 0.012, 6);
  });

  it('補強失敗 (API timeout): Vision 結果がそのまま返り、ジョブは継続 (throw しない)', async () => {
    const { enrichWithClaude } = await importModule();
    const abortErr = Object.assign(new Error('Request was aborted.'), {
      name: 'AbortError',
    });
    mockCreate.mockRejectedValueOnce(abortErr);

    const vision = visionOcrFixture();
    const enriched = await enrichWithClaude(vision);

    // throw されず Vision 結果が "そのまま" 返る
    expect(enriched).toEqual(vision);
    expect(enriched.provider).toBe('gcv');
    expect(enriched.fields.name).toBe('山田太郎'); // 補強前
    expect(enriched.estimatedCostUsd).toBe(0.0015); // 加算されない
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('JSON parse 失敗: 非 JSON を返したら Vision 結果が壊れずそのまま返る', async () => {
    const { enrichWithClaude } = await importModule();
    mockCreate.mockResolvedValueOnce({
      id: 'msg_bad',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      stop_sequence: null,
      content: [{ type: 'text', text: 'すみません、構造化できませんでした。' }],
      usage: { input_tokens: 100, output_tokens: 30 },
    });

    const vision = visionOcrFixture();
    const enriched = await enrichWithClaude(vision);

    expect(enriched).toEqual(vision);
    expect(enriched.provider).toBe('gcv');
  });

  it('NotConfigured: ANTHROPIC_API_KEY 不在で API を呼ばず Vision 結果を返す', async () => {
    const { enrichWithClaude } = await importModule();

    // 空文字 → skip
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    let vision = visionOcrFixture();
    let enriched = await enrichWithClaude(vision);
    expect(enriched).toEqual(vision);
    expect(mockCreate).not.toHaveBeenCalled();

    // setup.ts の placeholder 'sk-ant-test' → skip (test env を誤って本番呼出しないため)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vision = visionOcrFixture();
    enriched = await enrichWithClaude(vision);
    expect(enriched).toEqual(vision);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('Claude が部分的に null を返す: 既存 Vision 値は維持され、新規分のみ補強される', async () => {
    const { enrichWithClaude } = await importModule();
    mockCreate.mockResolvedValueOnce(
      anthropicEnrichedFixture({
        jsonOverride: JSON.stringify({
          name: '山田 太郎', // 補強あり
          nameKana: null,       // 補強なし → 既存維持
          title: null,
          department: null,
          companyName: null,
          email: null,
          phone: null,
          address: null,
          linkedinUrl: null,
          confidence: 0.7,
        }),
      }),
    );

    const vision = visionOcrFixture();
    const enriched = await enrichWithClaude(vision);

    // name は補強された
    expect(enriched.fields.name).toBe('山田 太郎');
    // null だった field は元 Vision を維持
    expect(enriched.fields.nameKana).toBe('やまだたろう');
    expect(enriched.fields.title).toBe('マネージャー');
    expect(enriched.fields.companyName).toBe('(株)ナレッジさん');
    expect(enriched.fields.email).toBe('taro.yamada@example.co.jp');
    // provider は補強済 (1 field でも補強されたら昇格)
    expect(enriched.provider).toBe('gcv+claude');
  });
});

describe('GoogleVisionProvider × enrichWithClaude (E2E wiring)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockCreate.mockReset();
    constructorCalls.length = 0;
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'AIza-test-key-gcv-claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-live-postprocess-e2e');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('factory OCR_PROVIDER=gcv+claude: GoogleVisionProvider が Claude 補強有効で構築される', async () => {
    const { pickProvider, GoogleVisionProvider } = await importProviders();

    vi.stubEnv('OCR_PROVIDER', 'gcv+claude');
    const picked = pickProvider(process.env);
    expect(picked).toBeInstanceOf(GoogleVisionProvider);
  });

  it('factory OCR_PROVIDER=gcv+claude + GOOGLE_VISION_API_KEY 不在 → Mock fallback', async () => {
    const { pickProvider, MockOcrProvider } = await importProviders();

    vi.stubEnv('GOOGLE_VISION_API_KEY', '');
    vi.stubEnv('OCR_PROVIDER', 'gcv+claude');
    const picked = pickProvider(process.env);
    expect(picked).toBeInstanceOf(MockOcrProvider);
  });

  it('recognize → Vision → enrichWithClaude のチェーンが繋がる', async () => {
    const { GoogleVisionProvider } = await importProviders();

    // Vision REST レスポンス
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          responses: [
            {
              fullTextAnnotation: {
                text: '(株)ナレッジさん\n営業部：マネージャー\n山田太郎\nやまだたろう\ntaro.yamada@example.co.jp\n03-1234-5678\n東京都千代田区丸の内1-1-1',
                pages: [
                  {
                    confidence: 0.9,
                    blocks: [
                      {
                        blockType: 'TEXT',
                        confidence: 0.9,
                        paragraphs: [
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: '(株)ナレッジさん' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: '営業部：マネージャー' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: '山田太郎' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: 'やまだたろう' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: 'taro.yamada@example.co.jp' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: '03-1234-5678' }] }] },
                          { confidence: 0.9, words: [{ confidence: 0.9, symbols: [{ text: '東京都千代田区丸の内1-1-1' }] }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    // Claude PROMPT-02 レスポンス
    mockCreate.mockResolvedValueOnce(anthropicEnrichedFixture());

    const provider = new GoogleVisionProvider(undefined, { enrichWithClaude: true });
    const result = await provider.recognize(new Uint8Array(2048), 'image/jpeg');

    // 両方の API が 1 回ずつ呼ばれた
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // 最終結果は Claude 補強済
    expect(result.provider).toBe('gcv+claude');
    expect(result.fields.name).toBe('山田 太郎');
    expect(result.fields.companyName).toBe('株式会社ナレッジさん');
    expect(result.fields.title).toBe('営業部 マネージャー');

    // cost は Vision + Claude の合算
    const claudeCost = (600 / 1_000_000) * 3.0 + (150 / 1_000_000) * 15.0;
    expect(result.estimatedCostUsd).toBeCloseTo(0.0015 + claudeCost, 6);
  });
});
