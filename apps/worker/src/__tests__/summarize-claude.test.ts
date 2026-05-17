import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '@ksp/shared';

/**
 * ClaudeProvider 本実装 (Round 4) の単体テスト。
 *
 * @anthropic-ai/sdk は丸ごと `vi.mock` で差し替え、Messages API の JSON レスポンスを
 * ケースごとに切り替えて以下を検証する:
 *   - happy path (Claude fixture JSON → SummarizeResult)
 *   - timeout (AbortError 伝播)
 *   - NotConfigured (空文字 / placeholder)
 *   - cost 計算 (usage.input_tokens × $3/M + output × $15/M)
 *   - factory fallback (pickProvider が無 key で Mock に落ちる)
 *
 * テスト方針:
 *   - 実 HTTP は一切叩かない (CI 環境で ANTHROPIC_API_KEY が無くても通る)
 *   - @anthropic-ai/sdk を `vi.mock(...)` で stub し `messages.create` の挙動を
 *     `mockCreate` (mutable な vi.fn()) で差し替える
 *   - constructor の opts (apiKey/timeout/maxRetries) は `constructorCalls` で record
 */

// ============================================================================
// @anthropic-ai/sdk mock
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
async function importProviders() {
  return await import('../lib/summarize/providers.js');
}

// ============================================================================
// helpers
// ============================================================================

function makeSegments(): TranscriptSegment[] {
  return [
    {
      index: 0,
      startSec: 0,
      endSec: 12.5,
      speakerLabel: 'host',
      text: '本日はお忙しい中、お時間いただきありがとうございます。',
      confidence: 0.94,
    },
    {
      index: 1,
      startSec: 12.5,
      endSec: 78,
      speakerLabel: 'guest',
      text: '営業効率化のツールを検討しています。予算規模はまだ未確定です。',
      confidence: 0.91,
    },
    {
      index: 2,
      startSec: 78,
      endSec: 124,
      speakerLabel: 'host',
      text: '見積もりと導入事例を 2 社分、今週中にお送りします。',
      confidence: 0.93,
    },
  ];
}

/**
 * Anthropic Messages API レスポンスを模した fixture。
 * `content` は [{type:'text', text:'<JSON 文字列>'}] の 1 ブロック。
 */
function anthropicResponseFixture(opts?: {
  jsonOverride?: string;
  usage?: { input_tokens: number; output_tokens: number };
  /** JSON 文字列を ```json ... ``` フェンスで囲むかどうか */
  withFence?: boolean;
}) {
  const json =
    opts?.jsonOverride ??
    JSON.stringify({
      summary: '営業ツール検討中の見込み客に対する初回商談。次回までに見積もりを送付予定。',
      keyPoints: [
        '営業効率化ツールの検討段階',
        '貴社製品への興味あり',
        '次回までに見積もりと導入事例を送付',
      ],
      customerNeeds: ['営業効率化', '導入実績の確認'],
      objections: ['予算規模が未確定', '社内稟議プロセスが長い'],
      nextActions: [
        { what: '見積もりを送付する', owner: 'host', dueDate: null },
        { what: '導入事例を 2 社分共有する', owner: 'host', dueDate: '2026-05-24' },
      ],
      commitments: [
        { who: 'host', what: '見積もりを今週中に送付', byWhen: '2026-05-24', atSec: 78 },
        { who: 'guest', what: '社内検討の上、回答する', byWhen: null, atSec: 110 },
      ],
      sentimentTimeline: [
        { atSec: 0, value: 0.1, speakerLabel: 'host' },
        { atSec: 30, value: 0.4, speakerLabel: 'guest' },
        { atSec: 90, value: 0.7, speakerLabel: 'guest' },
      ],
    });

  const text = opts?.withFence ? '```json\n' + json + '\n```' : json;

  return {
    id: 'msg_test_01',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text }],
    usage: opts?.usage ?? { input_tokens: 4_000, output_tokens: 600 },
  };
}

// ============================================================================
// tests
// ============================================================================

describe('ClaudeProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    constructorCalls.length = 0;
    // 各テスト個別で ANTHROPIC_API_KEY を stub する (setup.ts の 'sk-ant-test' は NotConfigured 扱い)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-live-test-real-1234');
    // SUMMARIZE_PROVIDER は明示的に 'auto' に置く
    vi.stubEnv('SUMMARIZE_PROVIDER', 'auto');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('happy path: Claude JSON レスポンスを SummarizeResult に正規化し cost を usage から算出する', async () => {
    const { ClaudeProvider } = await importProviders();
    mockCreate.mockResolvedValueOnce(anthropicResponseFixture());

    const provider = new ClaudeProvider();
    const result = await provider.summarize(makeSegments());

    // SDK constructor: timeout 60s, maxRetries 0, apiKey 引き回し
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({
      apiKey: 'sk-ant-live-test-real-1234',
      timeout: 60_000,
      maxRetries: 0,
    });

    // create() 呼出パラメタ
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [body, options] = mockCreate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
    });
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(50);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    // transcript の各 segment が prompt に含まれる
    expect(body.messages[0].content).toContain('営業効率化のツールを検討しています');
    expect(body.messages[0].content).toContain('[00:00:12 guest]');
    // AbortSignal.timeout で signal が必ず渡る
    expect(options?.signal).toBeInstanceOf(AbortSignal);

    // 戻り値
    expect(result.provider).toBe('claude');
    expect(result.summary).toContain('営業ツール検討中');
    expect(result.keyPoints).toHaveLength(3);
    expect(result.customerNeeds).toEqual(['営業効率化', '導入実績の確認']);
    expect(result.objections).toEqual(['予算規模が未確定', '社内稟議プロセスが長い']);
    expect(result.nextActions).toHaveLength(2);
    expect(result.nextActions[1]).toMatchObject({
      what: '導入事例を 2 社分共有する',
      owner: 'host',
      dueDate: '2026-05-24',
    });
    expect(result.commitments).toHaveLength(2);
    expect(result.commitments[0]).toMatchObject({
      who: 'host',
      what: '見積もりを今週中に送付',
      byWhen: '2026-05-24',
      atSec: 78,
    });
    expect(result.sentimentTimeline).toHaveLength(3);
    expect(result.sentimentTimeline[2]).toMatchObject({
      atSec: 90,
      value: 0.7,
      speakerLabel: 'guest',
    });

    // cost: 4000 input × $3/M + 600 output × $15/M = $0.012 + $0.009 = $0.021
    expect(result.inputTokens).toBe(4_000);
    expect(result.outputTokens).toBe(600);
    expect(result.estimatedCostUsd).toBeCloseTo(
      (4_000 / 1_000_000) * 3.0 + (600 / 1_000_000) * 15.0,
      6,
    );
  });

  it('code fence: ```json``` で囲まれた JSON も寛容に parse できる', async () => {
    const { ClaudeProvider } = await importProviders();
    mockCreate.mockResolvedValueOnce(anthropicResponseFixture({ withFence: true }));

    const provider = new ClaudeProvider();
    const result = await provider.summarize(makeSegments());

    expect(result.keyPoints).toHaveLength(3);
    expect(result.summary).toContain('営業ツール');
  });

  it('cost 計算: 高 token 使用時に Sonnet 価格表どおりの USD 概算が出る', async () => {
    const { ClaudeProvider, estimateCostUsd } = await importProviders();
    mockCreate.mockResolvedValueOnce(
      anthropicResponseFixture({
        usage: { input_tokens: 20_000, output_tokens: 2_000 },
      }),
    );

    const provider = new ClaudeProvider();
    const result = await provider.summarize(makeSegments());

    // 20000 × $3/M + 2000 × $15/M = $0.06 + $0.03 = $0.09
    expect(result.inputTokens).toBe(20_000);
    expect(result.outputTokens).toBe(2_000);
    expect(result.estimatedCostUsd).toBeCloseTo(0.09, 6);
    expect(result.estimatedCostUsd).toBeCloseTo(
      estimateCostUsd('claude-sonnet-4-5', 20_000, 2_000),
      6,
    );
  });

  it('timeout: AbortSignal が発火すると create() の AbortError を伝播する', async () => {
    const { ClaudeProvider } = await importProviders();
    const abortErr = Object.assign(new Error('Request was aborted.'), {
      name: 'AbortError',
    });
    mockCreate.mockRejectedValueOnce(abortErr);

    const provider = new ClaudeProvider();
    await expect(provider.summarize(makeSegments())).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('parse error: Claude が JSON 以外を返したら SummarizeParseError を throw する', async () => {
    const { ClaudeProvider, SummarizeParseError } = await importProviders();
    mockCreate.mockResolvedValueOnce({
      id: 'msg_bad',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      stop_sequence: null,
      content: [{ type: 'text', text: 'すみません、要約できませんでした。' }],
      usage: { input_tokens: 100, output_tokens: 30 },
    });

    const provider = new ClaudeProvider();
    await expect(provider.summarize(makeSegments())).rejects.toBeInstanceOf(
      SummarizeParseError,
    );
  });

  it('NotConfigured: ANTHROPIC_API_KEY 不在 / test 値で constructor が SummarizeNotConfiguredError を throw する', async () => {
    const {
      ClaudeProvider,
      SummarizeNotConfiguredError,
      pickProvider,
      MockSummarizeProvider,
    } = await importProviders();

    // 1) 空文字 → throw
    expect(() => new ClaudeProvider('')).toThrow(SummarizeNotConfiguredError);

    // 2) setup.ts の placeholder 'sk-ant-test' → throw
    expect(() => new ClaudeProvider('sk-ant-test')).toThrow(SummarizeNotConfiguredError);

    // 3) factory は throw せず Mock に fallback (規約: pickProvider は常に成功)
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('SUMMARIZE_PROVIDER', 'claude');
    const picked = pickProvider(process.env);
    expect(picked).toBeInstanceOf(MockSummarizeProvider);

    // 4) SUMMARIZE_PROVIDER='mock' は鍵があっても Mock
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-live-real-key');
    vi.stubEnv('SUMMARIZE_PROVIDER', 'mock');
    expect(pickProvider(process.env)).toBeInstanceOf(MockSummarizeProvider);
  });
});
