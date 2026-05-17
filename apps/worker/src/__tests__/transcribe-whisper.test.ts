import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WhisperProvider 本実装 (Round 3) の単体テスト。
 *
 * openai SDK は丸ごと `vi.mock` で差し替え、verbose_json レスポンスの正規化と
 * size guard / timeout / NotConfigured の 4 ケースを検証する。
 *
 * テスト方針:
 *   - 実 HTTP は一切叩かない (CI 環境で OPENAI_API_KEY が無くても通る)
 *   - openai を `vi.mock('openai', ...)` で stub し `audio.transcriptions.create`
 *     の挙動をケースごとに切り替える (`mockCreate` を mutable な vi.fn() に持つ)
 *   - `toFile` は素通しの fake で `{ filename, type, bytes }` を返す
 */

// ============================================================================
// openai SDK mock
// ============================================================================

const mockCreate = vi.fn();
const constructorCalls: Array<Record<string, unknown>> = [];

vi.mock('openai', () => {
  // OpenAI(...) constructor: apiKey/timeout/maxRetries を記録、`audio.transcriptions.create` を expose。
  class MockOpenAI {
    audio: { transcriptions: { create: typeof mockCreate } };
    constructor(opts: Record<string, unknown>) {
      constructorCalls.push(opts);
      this.audio = { transcriptions: { create: mockCreate } };
    }
  }
  return {
    default: MockOpenAI,
    // toFile: bytes をそのまま透過する fake。テスト側で audio bytes を assert したい場合に備える。
    toFile: vi.fn(async (bytes: Uint8Array, filename: string, options: { type: string }) => ({
      __fakeFile: true,
      bytes,
      filename,
      type: options.type,
    })),
  };
});

// dynamic import (vi.mock の hoisting が効くように top-level import を避ける)
async function importProviders() {
  return await import('../lib/transcribe/providers.js');
}

// ============================================================================
// helpers
// ============================================================================

function makeAudio(byteLength: number): Uint8Array {
  return new Uint8Array(byteLength);
}

function verboseFixture() {
  return {
    text: 'こんにちは。今日はよろしくお願いします。',
    language: 'japanese',
    duration: 124.5,
    segments: [
      {
        id: 0,
        seek: 0,
        start: 0,
        end: 12.5,
        text: 'こんにちは。',
        avg_logprob: -0.1, // exp(-0.1) ≈ 0.9048
        compression_ratio: 1.0,
        no_speech_prob: 0.01,
        temperature: 0,
        tokens: [1, 2, 3],
      },
      {
        id: 1,
        seek: 1250,
        start: 12.5,
        end: 78.0,
        text: '今日はよろしくお願いします。',
        avg_logprob: -0.3, // exp(-0.3) ≈ 0.7408
        compression_ratio: 1.1,
        no_speech_prob: 0.02,
        temperature: 0,
        tokens: [4, 5, 6],
      },
    ],
  };
}

// ============================================================================
// tests
// ============================================================================

describe('WhisperProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    constructorCalls.length = 0;
    // 各テスト個別で OPENAI_API_KEY を stub する (setup.ts の 'sk-openai-test' は NotConfigured 扱い)
    vi.stubEnv('OPENAI_API_KEY', 'sk-live-test-real-1234');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('happy path: verbose_json を TranscriptSegment[] に正規化し cost を duration から算出する', async () => {
    const { WhisperProvider } = await importProviders();
    mockCreate.mockResolvedValueOnce(verboseFixture());

    const provider = new WhisperProvider();
    const result = await provider.transcribe(makeAudio(1024), 'audio/mp4');

    // SDK constructor: timeout 120s, maxRetries 0, apiKey 引き回し
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({
      apiKey: 'sk-live-test-real-1234',
      timeout: 120_000,
      maxRetries: 0,
    });

    // create() 呼出パラメタ
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [body, options] = mockCreate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'ja',
      timestamp_granularities: ['segment'],
    });
    expect(body.file).toMatchObject({ __fakeFile: true, filename: 'audio.mp4', type: 'audio/mp4' });
    // AbortSignal.timeout で signal が必ず渡る
    expect(options?.signal).toBeInstanceOf(AbortSignal);

    // 戻り値
    expect(result.provider).toBe('whisper');
    expect(result.language).toBe('japanese');
    expect(result.fullText).toBe('こんにちは。今日はよろしくお願いします。');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      index: 0,
      startSec: 0,
      endSec: 12.5,
      speakerLabel: 'speaker_0',
      text: 'こんにちは。',
    });
    // confidence = exp(avg_logprob)
    expect(result.segments[0]!.confidence).toBeCloseTo(Math.exp(-0.1), 4);
    expect(result.segments[1]!.confidence).toBeCloseTo(Math.exp(-0.3), 4);

    // cost: 124.5s / 60 * $0.006
    expect(result.estimatedCostUsd).toBeCloseTo((124.5 / 60) * 0.006, 6);
    // overall = mean(confidences)
    expect(result.overallConfidence).toBeCloseTo(
      (Math.exp(-0.1) + Math.exp(-0.3)) / 2,
      4,
    );
  });

  it('timeout: AbortSignal が発火すると create() の AbortError を伝播する', async () => {
    const { WhisperProvider } = await importProviders();
    // AbortError を模した拒否
    const abortErr = Object.assign(new Error('Request was aborted.'), {
      name: 'AbortError',
    });
    mockCreate.mockRejectedValueOnce(abortErr);

    const provider = new WhisperProvider();
    await expect(provider.transcribe(makeAudio(2048), 'audio/mp4')).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('audio_too_large: 25MB 超 50MB 以下では TranscribeAudioTooLargeError を throw し API は呼ばない', async () => {
    const { WhisperProvider, TranscribeAudioTooLargeError } = await importProviders();
    const provider = new WhisperProvider();

    // 26MB
    const tooLarge = makeAudio(26 * 1024 * 1024);
    await expect(provider.transcribe(tooLarge, 'audio/mp4')).rejects.toBeInstanceOf(
      TranscribeAudioTooLargeError,
    );
    expect(mockCreate).not.toHaveBeenCalled();

    // 51MB は同じく throw、かつ API call なし (hard reject)
    mockCreate.mockReset();
    const hardReject = makeAudio(51 * 1024 * 1024);
    await expect(provider.transcribe(hardReject, 'audio/mp4')).rejects.toBeInstanceOf(
      TranscribeAudioTooLargeError,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('NotConfigured: OPENAI_API_KEY 不在 / test 値で constructor が TranscribeNotConfiguredError を throw する', async () => {
    const { WhisperProvider, TranscribeNotConfiguredError, pickProvider, MockTranscribeProvider } =
      await importProviders();

    // 1) 空文字 → throw
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => new WhisperProvider(undefined)).toThrow(TranscribeNotConfiguredError);

    // 2) setup.ts の placeholder 'sk-openai-test' → throw
    expect(() => new WhisperProvider('sk-openai-test')).toThrow(TranscribeNotConfiguredError);

    // 3) factory は throw せず Mock に fallback (規約: pickProvider は常に成功)
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('TRANSCRIBE_PROVIDER', 'whisper');
    const picked = pickProvider(process.env);
    expect(picked).toBeInstanceOf(MockTranscribeProvider);
  });
});
