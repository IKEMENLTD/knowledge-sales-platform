import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GoogleVisionProvider 本実装 (Round 4) の単体テスト。
 *
 * 実 HTTP は叩かず global `fetch` を `vi.fn()` で stub する。
 *
 * テスト方針:
 *   - 実 HTTP は一切叩かない (CI 環境で GOOGLE_VISION_API_KEY が無くても通る)
 *   - global.fetch を stub し、Vision REST レスポンス JSON をケースごとに切り替える
 *   - happy path / timeout / image_too_large / NotConfigured / fallback(factory) の 5 ケース
 */

// ============================================================================
// global fetch mock (vi.stubGlobal で各テストで差し替える)
// ============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  // 各テスト個別で GOOGLE_VISION_API_KEY を有効値に上書き
  vi.stubEnv('GOOGLE_VISION_API_KEY', 'AIza-fake-test-key-1234567890');
  // OCR_PROVIDER は明示的に 'auto' に置く
  vi.stubEnv('OCR_PROVIDER', 'auto');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ============================================================================
// fixtures
// ============================================================================

function makeImage(byteLength: number): Uint8Array {
  return new Uint8Array(byteLength);
}

/**
 * Vision REST の DOCUMENT_TEXT_DETECTION レスポンスを模した fixture。
 * paragraph 単位で名刺の 1 行を表現する。
 */
function visionFixture() {
  const lines: Array<{ text: string; wordConfidence: number }> = [
    { text: '株式会社ナレッジさん', wordConfidence: 0.95 },
    { text: '営業部：マネージャー', wordConfidence: 0.9 },
    { text: '山田太郎', wordConfidence: 0.92 },
    { text: 'やまだたろう', wordConfidence: 0.88 },
    { text: 'taro.yamada@example.co.jp', wordConfidence: 0.98 },
    { text: '03-1234-5678', wordConfidence: 0.93 },
    { text: '東京都千代田区丸の内1-1-1', wordConfidence: 0.85 },
  ];

  return {
    responses: [
      {
        fullTextAnnotation: {
          text: lines.map((l) => l.text).join('\n'),
          pages: [
            {
              confidence: 0.9,
              blocks: [
                {
                  blockType: 'TEXT',
                  confidence: 0.9,
                  paragraphs: lines.map((l) => ({
                    confidence: l.wordConfidence,
                    words: [
                      {
                        confidence: l.wordConfidence,
                        symbols: [...l.text].map((ch) => ({
                          text: ch,
                          confidence: l.wordConfidence,
                        })),
                      },
                    ],
                  })),
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function fakeResponseOk(body: unknown): Response {
  // Vitest 環境では node18+ の Response が利用可能
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function importProviders() {
  return await import('../lib/ocr/providers.js');
}

// ============================================================================
// tests
// ============================================================================

describe('GoogleVisionProvider', () => {
  it('happy path: Vision REST レスポンスを OcrResult に正規化し cost を 0.0015 USD で返す', async () => {
    const { GoogleVisionProvider } = await importProviders();
    mockFetch.mockResolvedValueOnce(fakeResponseOk(visionFixture()));

    const provider = new GoogleVisionProvider();
    const result = await provider.recognize(makeImage(2048), 'image/jpeg');

    // fetch 呼出パラメタ
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toContain('https://vision.googleapis.com/v1/images:annotate');
    expect(String(calledUrl)).toContain('key=AIza-fake-test-key-1234567890');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.signal).toBeInstanceOf(AbortSignal);

    // body は DOCUMENT_TEXT_DETECTION で languageHints=['ja','en']
    const body = JSON.parse(calledInit?.body as string);
    expect(body.requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION');
    expect(body.requests[0].imageContext.languageHints).toEqual(['ja', 'en']);
    expect(typeof body.requests[0].image.content).toBe('string');
    // base64 文字列であること (簡易チェック)
    expect(body.requests[0].image.content).toMatch(/^[A-Za-z0-9+/=]+$/);

    // 戻り値の中身
    expect(result.provider).toBe('gcv');
    expect(result.estimatedCostUsd).toBeCloseTo(0.0015, 6);
    expect(result.language).toBe('ja');
    expect(result.rawText).toContain('株式会社ナレッジさん');
    expect(result.rawText).toContain('taro.yamada@example.co.jp');

    // heuristic 抽出
    expect(result.fields.email).toBe('taro.yamada@example.co.jp');
    expect(result.fields.phone).toBe('03-1234-5678');
    expect(result.fields.companyName).toBe('株式会社ナレッジさん');
    // タイトルは「営業部：マネージャー」のコロン右側
    expect(result.fields.title).toBe('マネージャー');
    // 名前: ふりがな (全部ひらがな) ではない最初の remaining 行 = 山田太郎
    expect(result.fields.name).toBe('山田太郎');
    // ふりがな
    expect(result.fields.nameKana).toBe('やまだたろう');
    // 住所
    expect(result.fields.address).toBe('東京都千代田区丸の内1-1-1');

    // 信頼度 (page0.confidence=0.9)
    expect(result.overallConfidence).toBeCloseTo(0.9, 4);
    // 検出された field のみ fieldConfidence が埋まる
    expect(result.fieldConfidence.email).toBeGreaterThanOrEqual(0.95);
    expect(result.fieldConfidence.phone).toBeGreaterThanOrEqual(0.9);
    expect(result.fieldConfidence.companyName).toBeGreaterThan(0);
  });

  it('timeout: fetch が AbortError を throw すると伝播する', async () => {
    const { GoogleVisionProvider } = await importProviders();
    const abortErr = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    mockFetch.mockRejectedValueOnce(abortErr);

    const provider = new GoogleVisionProvider();
    await expect(provider.recognize(makeImage(1024), 'image/jpeg')).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('image_too_large: 25MB 超は OcrImageTooLargeError を throw し fetch は呼ばない', async () => {
    const { GoogleVisionProvider, OcrImageTooLargeError } = await importProviders();
    const provider = new GoogleVisionProvider();

    // 26MB (hard reject)
    const hardReject = makeImage(26 * 1024 * 1024);
    await expect(provider.recognize(hardReject, 'image/jpeg')).rejects.toBeInstanceOf(
      OcrImageTooLargeError,
    );
    expect(mockFetch).not.toHaveBeenCalled();

    // 21MB (soft limit: > 20MB Vision per-image cap、<= 25MB hard reject)
    mockFetch.mockReset();
    const softLimit = makeImage(21 * 1024 * 1024);
    await expect(provider.recognize(softLimit, 'image/jpeg')).rejects.toBeInstanceOf(
      OcrImageTooLargeError,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('NotConfigured: GOOGLE_VISION_API_KEY 不在で constructor が OcrNotConfiguredError を throw する', async () => {
    const { GoogleVisionProvider, OcrNotConfiguredError, pickProvider, MockOcrProvider } =
      await importProviders();

    // 1) 空文字 → throw
    vi.stubEnv('GOOGLE_VISION_API_KEY', '');
    expect(() => new GoogleVisionProvider(undefined)).toThrow(OcrNotConfiguredError);
    // 直接 undefined を渡しても同じ
    expect(() => new GoogleVisionProvider('')).toThrow(OcrNotConfiguredError);

    // 2) factory は throw せず Mock に fallback (規約: pickProvider は常に成功)
    vi.stubEnv('GOOGLE_VISION_API_KEY', '');
    vi.stubEnv('OCR_PROVIDER', 'gcv');
    const picked = pickProvider(process.env);
    expect(picked).toBeInstanceOf(MockOcrProvider);
  });

  it('factory auto: GOOGLE_VISION_API_KEY 有効値なら GoogleVisionProvider を返す / 空なら Mock を返す', async () => {
    const { pickProvider, GoogleVisionProvider, MockOcrProvider } = await importProviders();

    // 有効値 → GoogleVisionProvider
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'AIza-real-key-9999');
    vi.stubEnv('OCR_PROVIDER', 'auto');
    const withKey = pickProvider(process.env);
    expect(withKey).toBeInstanceOf(GoogleVisionProvider);

    // 空 → Mock
    vi.stubEnv('GOOGLE_VISION_API_KEY', '');
    vi.stubEnv('OCR_PROVIDER', 'auto');
    const withoutKey = pickProvider(process.env);
    expect(withoutKey).toBeInstanceOf(MockOcrProvider);

    // 明示 'mock' → Mock (key があっても)
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'AIza-real-key-9999');
    vi.stubEnv('OCR_PROVIDER', 'mock');
    const explicit = pickProvider(process.env);
    expect(explicit).toBeInstanceOf(MockOcrProvider);
  });
});
