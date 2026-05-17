import { ocrResultSchema, type OcrResult } from '@ksp/shared';
import { logger } from '../logger.js';

/**
 * 名刺 OCR プロバイダ抽象 (Phase2B T-009, Round 4 で GoogleVision 本実装化)。
 *
 * 設計:
 *   - 実装は 3 つ: Mock / GoogleVision (本実装) / Claude (Phase2 雛形)
 *   - factory pickProvider() が env で 1 つ選ぶ。
 *     優先度: 明示 OCR_PROVIDER -> GOOGLE_VISION_API_KEY -> ANTHROPIC_API_KEY -> Mock
 *   - env キー不在環境 (dev / CI) で throw しない。MockProvider に自動 fallback。
 *   - 各 provider は OcrResult (zod 検証済) を返す責務を持つ。
 *
 * Round 4 (GoogleVision 本実装化):
 *   - GoogleVisionProvider が Cloud Vision REST `images:annotate` を実際に呼び出す。
 *   - timeout 30s + AbortSignal.timeout(30s)。
 *   - 25MB 超 (Vision REST 1 リクエスト上限) は `OcrImageTooLargeError` として throw。
 *   - cost: $1.50 / 1000 requests → 1 リクエストあたり $0.0015 を estimatedCostUsd に。
 */

export interface OcrProvider {
  readonly name: string;
  recognize(imageBytes: Uint8Array, mime: string): Promise<OcrResult>;
}

export class OcrNotConfiguredError extends Error {
  override readonly name = 'OcrNotConfiguredError';
  constructor(missing: string) {
    super(`OCR provider not configured: ${missing}`);
  }
}

/**
 * 25MB を超える image を Vision REST に送ろうとした場合に throw する。
 * ocr.ts 側は status='pending_review' に落として ack する想定。
 */
export class OcrImageTooLargeError extends Error {
  override readonly name = 'OcrImageTooLargeError';
  constructor(byteLength: number, limitBytes: number) {
    super(
      `image_too_large: ${byteLength} bytes > ${limitBytes} bytes (Vision REST limit)`,
    );
  }
}

// ============================================================================
// Mock provider
// ============================================================================

/**
 * 決定論的 fixture を返す Mock。E2E / dev / CI 向け。
 *
 * 返す内容は packages/shared/contacts.ts の ocrResultSchema に準拠。
 * `imageBytes` の SHA-256 を見ずに固定文字列を返すので、テストでは
 * 後段 normalize / dedupe のロジックだけが評価対象になる。
 */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async recognize(_imageBytes: Uint8Array, _mime: string): Promise<OcrResult> {
    const result: OcrResult = {
      rawText: [
        '株式会社ナレッジさん',
        '営業部 マネージャー',
        '山田 太郎',
        'やまだ たろう',
        'taro.yamada@example.co.jp',
        '03-1234-5678',
        '東京都千代田区丸の内1-1-1',
      ].join('\n'),
      fields: {
        name: '山田 太郎',
        nameKana: 'やまだ たろう',
        title: '営業部 マネージャー',
        email: 'taro.yamada@example.co.jp',
        phone: '03-1234-5678',
        companyName: '株式会社ナレッジさん',
        address: '東京都千代田区丸の内1-1-1',
      },
      fieldConfidence: {
        name: 0.95,
        nameKana: 0.9,
        title: 0.85,
        email: 0.98,
        phone: 0.93,
        companyName: 0.92,
        address: 0.8,
      },
      overallConfidence: 0.91,
      language: 'ja',
      provider: 'mock',
      estimatedCostUsd: 0,
    };
    // 念のため自己検証 (fixture 改変時の regression を即検出)
    return ocrResultSchema.parse(result);
  }
}

// ============================================================================
// Google Vision provider (本実装)
// ============================================================================

/** Vision REST API の 1 リクエスト image 上限 (base64 でなく original bytes 換算)。 */
const VISION_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB (Vision 公式上限は 20MB / image)
/** ハード reject 閾値。download 直後の sanity guard 兼用。 */
const VISION_HARD_REJECT_BYTES = 25 * 1024 * 1024; // 25 MB (要件: 25MB 超は throw)
/** Vision REST の単一リクエスト timeout。pgmq visibility timeout より十分短く。 */
const VISION_REQUEST_TIMEOUT_MS = 30_000;
/** Cloud Vision DOCUMENT_TEXT_DETECTION の公式価格 (2024): $1.50 / 1000 requests。 */
const VISION_USD_PER_REQUEST = 0.0015;
/** Vision REST endpoint。API key (query param) で呼ぶ簡易認証経路。 */
const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// ---- Vision REST response 型 (必要な分だけ) ----
interface VisionWord {
  symbols?: Array<{ text?: string; confidence?: number }>;
  confidence?: number;
}
interface VisionParagraph {
  words?: VisionWord[];
  confidence?: number;
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
  blockType?: string;
  confidence?: number;
}
interface VisionPage {
  blocks?: VisionBlock[];
  confidence?: number;
}
interface VisionFullTextAnnotation {
  text?: string;
  pages?: VisionPage[];
}
interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: VisionFullTextAnnotation;
    error?: { code?: number; message?: string };
  }>;
}

/**
 * Vision の word.symbols[] を連結してプレーンテキストに直す。
 */
function wordToText(word: VisionWord): string {
  return (word.symbols ?? []).map((s) => s.text ?? '').join('');
}

/**
 * paragraph 内の word を空白区切りで連結。日本語/英語混在を許容するため間に半角スペースを入れない (Vision の挙動に合わせる)。
 */
function paragraphToText(p: VisionParagraph): string {
  return (p.words ?? []).map(wordToText).join('');
}

/**
 * pages → blocks → paragraphs を「行」として配列で展開する。
 *
 * Vision の DOCUMENT_TEXT_DETECTION は paragraph 単位で意味のある単位に分かれているので、
 * paragraph = 名刺の 1 行と見なすのが現実的に最も精度が高い。
 */
function paragraphsAsLines(annotation: VisionFullTextAnnotation): string[] {
  const lines: string[] = [];
  for (const page of annotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const p of block.paragraphs ?? []) {
        const txt = paragraphToText(p).trim();
        if (txt.length > 0) lines.push(txt);
      }
    }
  }
  return lines;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// 国際電話 / 国内番号両対応。"+81-3-1234-5678", "03-1234-5678", "(03) 1234 5678" などを許容。
// 数字 10〜13 桁 (区切りを除いた数で判定する)。
const PHONE_RE = /(?:\+?\d[\s\-().]?){10,17}/;
const URL_RE = /\bhttps?:\/\/[^\s]+/i;
const COMPANY_KEYWORDS = [
  '株式会社',
  '有限会社',
  '合同会社',
  '合資会社',
  '合名会社',
  '(株)',
  '（株）',
  '(有)',
  '（有）',
  'Inc.',
  'Inc',
  'Co.,',
  'Co.',
  'Ltd.',
  'Ltd',
  'LLC',
  'Corp.',
  'Corporation',
  'Corp',
  'Limited',
  'K.K.',
];

/** 1 行が会社名候補かどうか。 */
function looksLikeCompany(line: string): boolean {
  return COMPANY_KEYWORDS.some((kw) => line.includes(kw));
}

/** 数字を抽出してその桁数を返す。区切り文字無視。 */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/**
 * 簡易 heuristic で paragraph 行群から { name, title, email, phone, companyName, address, url } を推定する。
 *
 * 規約:
 *   - email: 最初に regex マッチした行
 *   - phone: 数字 10〜13 桁の行 (国際 prefix 込みは +1 まで許容)
 *   - URL: linkedin/twitter/company web を含む可能性のある URL は別フィールド名で持たないので捨てる (rawText 経由で参照可)
 *   - title: 全角コロン (：) または半角コロン (:) を含む行の右側を採用 (例: "役職：営業部マネージャー")
 *   - companyName: COMPANY_KEYWORDS のいずれかを含む最初の行
 *   - name: 残りの行のうち、上端 (early row) かつ "ふりがな" 風 (全部ひらがな) ではない最初の行
 *   - address: 「都|道|府|県」を含み companyName と一致しない行
 */
function heuristicExtract(lines: string[]): {
  fields: OcrResult['fields'];
  remaining: string[];
} {
  const fields: OcrResult['fields'] = {};
  const remaining: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // email
    if (!fields.email) {
      const m = line.match(EMAIL_RE);
      if (m) {
        fields.email = m[0];
        continue;
      }
    }
    // phone (数字桁で判定。10〜13 桁)
    if (!fields.phone) {
      const dc = digitCount(line);
      if (dc >= 10 && dc <= 13 && PHONE_RE.test(line)) {
        // 区切りはそのまま保持 (normalizePhone は別 layer)。
        fields.phone = line;
        continue;
      }
    }
    // company
    if (!fields.companyName && looksLikeCompany(line)) {
      fields.companyName = line;
      continue;
    }
    // title (コロン後ろ、または "部" + "長/マネージャー" 風)
    if (!fields.title) {
      const colonSplit = line.split(/[：:]/);
      if (colonSplit.length >= 2 && colonSplit[1]?.trim().length) {
        const candidate = colonSplit[1]!.trim();
        // 名前ラベル ("名前: ...") は採用しない
        if (!/^名前|^Name/i.test(colonSplit[0]!.trim())) {
          fields.title = candidate;
          continue;
        }
      }
      if (/(部|課|室|チーム).*(長|マネージャ|Manager|Director|CEO|CTO|COO|VP|担当)/.test(line)) {
        fields.title = line;
        continue;
      }
    }
    // URL は捨てる (rawText に残る)
    if (URL_RE.test(line)) {
      continue;
    }
    remaining.push(line);
  }

  // name: remaining の上から、ふりがな (全部ひらがな) でない最初の行
  for (const line of remaining) {
    if (/^[぀-ゟ\s]+$/.test(line)) {
      // ふりがな候補 → nameKana 用
      if (!fields.nameKana) fields.nameKana = line;
      continue;
    }
    // 住所っぽい行は除外
    if (/[都道府県].*[市区町村]/.test(line) || /\d+[-－‐]\d+/.test(line)) {
      if (!fields.address) fields.address = line;
      continue;
    }
    if (!fields.name) {
      // 名前は 1〜25 文字程度。長すぎる行は除外。
      if (line.length >= 2 && line.length <= 30) {
        fields.name = line;
        continue;
      }
    }
    // 余り行は address fallback
    if (!fields.address && line.length <= 80) {
      fields.address = line;
    }
  }

  return { fields, remaining };
}

/**
 * Google Cloud Vision REST API で名刺画像を OCR する provider。
 *
 * 実装ポイント:
 *   - `https://vision.googleapis.com/v1/images:annotate?key=...` (API key 認証)
 *   - features: DOCUMENT_TEXT_DETECTION (印刷物向け、TEXT_DETECTION より精度が高い)
 *   - timeout 30s + maxRetries 0 (pgmq visibility timeout が retry を担当)
 *   - 25MB 超 → OcrImageTooLargeError (Vision REST 1 リクエスト hard limit)
 *
 * Phase2 (未実装):
 *   - Claude (Anthropic Vision) で 2nd pass する `gcv+claude` モード
 *     → provider 識別子 `'gcv+claude'` を ocrResultSchema が許容済 (string 型)
 */
export class GoogleVisionProvider implements OcrProvider {
  readonly name = 'gcv';

  private readonly apiKey: string;

  constructor(apiKey: string | undefined = process.env.GOOGLE_VISION_API_KEY) {
    if (!apiKey || apiKey.length === 0) {
      throw new OcrNotConfiguredError('GOOGLE_VISION_API_KEY');
    }
    this.apiKey = apiKey;
  }

  async recognize(imageBytes: Uint8Array, mime: string): Promise<OcrResult> {
    const log = logger.child({
      op: 'ocr.gcv',
      mime,
      bytes: imageBytes.byteLength,
    });

    // ---- size guards ----
    if (imageBytes.byteLength > VISION_HARD_REJECT_BYTES) {
      log.warn(
        { bytes: imageBytes.byteLength, limit: VISION_HARD_REJECT_BYTES },
        'image exceeds hard reject limit (25MB); rejecting without API call',
      );
      throw new OcrImageTooLargeError(imageBytes.byteLength, VISION_HARD_REJECT_BYTES);
    }
    if (imageBytes.byteLength > VISION_MAX_IMAGE_BYTES) {
      throw new OcrImageTooLargeError(imageBytes.byteLength, VISION_MAX_IMAGE_BYTES);
    }

    // ---- base64 encode ----
    // Node 18+ では Buffer.from(Uint8Array).toString('base64') が最速。
    const base64 = Buffer.from(imageBytes).toString('base64');

    // ---- request body ----
    const body = {
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 50 }],
          imageContext: {
            languageHints: ['ja', 'en'],
          },
        },
      ],
    };

    // ---- HTTP call ----
    const url = `${VISION_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
    const signal = AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // AbortError は呼出側で扱えるよう name を維持して rethrow
      log.warn({ err: (err as Error).message }, 'vision fetch failed');
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn({ status: res.status, body: text.slice(0, 500) }, 'vision REST returned non-2xx');
      throw new Error(`Vision REST ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as VisionResponse;
    const first = json.responses?.[0];
    if (!first) {
      throw new Error('Vision REST returned empty responses[]');
    }
    if (first.error && first.error.code && first.error.code !== 0) {
      throw new Error(
        `Vision REST per-image error ${first.error.code}: ${first.error.message ?? 'unknown'}`,
      );
    }

    // ---- 正規化 ----
    const annotation = first.fullTextAnnotation ?? {};
    const rawText = annotation.text ?? '';
    const lines = paragraphsAsLines(annotation);
    const { fields } = heuristicExtract(lines);

    // ---- 信頼度集計 ----
    // overall = page0 の confidence (Vision が出してくれる) を採用。
    // field-level は word 単位 confidence の単純平均で代用 (heuristic 抽出と field の対応が
    // 1:1 に取れていないため field 別に深追いしても精度に寄与しない)。
    const page0 = annotation.pages?.[0];
    const overallConfidence = clamp01(
      typeof page0?.confidence === 'number' && Number.isFinite(page0.confidence)
        ? page0.confidence
        : 0.5,
    );

    const wordConfidences: number[] = [];
    for (const page of annotation.pages ?? []) {
      for (const block of page.blocks ?? []) {
        for (const p of block.paragraphs ?? []) {
          for (const w of p.words ?? []) {
            if (typeof w.confidence === 'number' && Number.isFinite(w.confidence)) {
              wordConfidences.push(clamp01(w.confidence));
            }
          }
        }
      }
    }
    const avgWordConf =
      wordConfidences.length === 0
        ? overallConfidence
        : wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length;

    const fieldConfidence: OcrResult['fieldConfidence'] = {};
    // 検出された field にのみ field-level confidence を埋める (zod schema は optional)。
    if (fields.name !== undefined) fieldConfidence.name = avgWordConf;
    if (fields.nameKana !== undefined) fieldConfidence.nameKana = avgWordConf;
    if (fields.title !== undefined) fieldConfidence.title = avgWordConf;
    if (fields.email !== undefined) {
      // email は regex マッチなので Vision の不確実性に左右されにくい → 1.0 近似
      fieldConfidence.email = clamp01(Math.max(avgWordConf, 0.95));
    }
    if (fields.phone !== undefined) {
      fieldConfidence.phone = clamp01(Math.max(avgWordConf, 0.9));
    }
    if (fields.companyName !== undefined) fieldConfidence.companyName = avgWordConf;
    if (fields.address !== undefined) fieldConfidence.address = avgWordConf;

    log.info(
      {
        lines: lines.length,
        hasEmail: Boolean(fields.email),
        hasPhone: Boolean(fields.phone),
        hasCompany: Boolean(fields.companyName),
        overallConfidence,
        estimatedCostUsd: VISION_USD_PER_REQUEST,
      },
      'gcv ocr completed',
    );

    // suppress "unused" lint on apiKey while keeping it for future re-init paths
    void this.apiKey;

    const result: OcrResult = {
      rawText,
      fields,
      fieldConfidence,
      overallConfidence,
      language: 'ja',
      provider: 'gcv',
      estimatedCostUsd: VISION_USD_PER_REQUEST,
    };
    return ocrResultSchema.parse(result);
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ============================================================================
// Claude (Anthropic Vision) provider (雛形 / Phase2)
// ============================================================================

/**
 * Anthropic Claude Sonnet vision モデルで名刺画像を JSON 抽出する provider 雛形。
 *
 * env ANTHROPIC_API_KEY 不在時は constructor で throw する (factory 側で catch)。
 *
 * TODO(Phase2): PROMPT-02 連携で Vision REST の出力を Claude が補強する `gcv+claude` モード。
 *   - 1st pass: GoogleVision で rawText / 大枠 field
 *   - 2nd pass: Claude messages API (image + text) で title / companyName / address を
 *     構造化抽出して overwrite。cost は +$0.01〜0.03 / image。
 */
export class ClaudeProvider implements OcrProvider {
  readonly name = 'claude';

  private readonly apiKey: string;

  constructor(apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey || apiKey.length === 0) {
      throw new OcrNotConfiguredError('ANTHROPIC_API_KEY');
    }
    this.apiKey = apiKey;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async recognize(_imageBytes: Uint8Array, _mime: string): Promise<OcrResult> {
    // TODO(Phase2): Anthropic Messages API (vision content block)
    // model: claude-sonnet-4-5 / claude-opus-4-7
    // content: [{type:'image', source:{type:'base64', data, media_type:mime}},
    //           {type:'text', text:'JSON抽出のシステムプロンプト (PROMPT-02)'}]
    // response から { name, title, email, phone, company, address } を取り出す。
    logger.warn(
      { provider: this.name },
      'ClaudeProvider stub: returning Mock-equivalent fixture (Phase2 連携前)',
    );
    const result: OcrResult = {
      rawText: '',
      fields: {},
      fieldConfidence: {},
      overallConfidence: 0,
      language: 'ja',
      provider: 'claude',
      estimatedCostUsd: 0.01,
    };
    void this.apiKey;
    return ocrResultSchema.parse(result);
  }
}

// ============================================================================
// factory
// ============================================================================

/**
 * env 状況から OcrProvider を 1 つ選んで返す。
 *
 * 選択優先度:
 *   1. process.env.OCR_PROVIDER ('mock' | 'gcv' | 'auto') が明示されていればそれ
 *      - ただし鍵がなくて構築失敗したら Mock に fallback
 *   2. 'auto' (default) は GOOGLE_VISION_API_KEY 有無で判定 (Whisper と同じパターン)
 *   3. 何もなければ Mock
 *
 * **常に成功する** (throw しない) のが規約。dev/test/CI で API key が無くても起動可能にする。
 */
export function pickProvider(
  envOverride: NodeJS.ProcessEnv = process.env,
): OcrProvider {
  const log = logger.child({ op: 'ocr.pickProvider' });
  const explicit = (envOverride.OCR_PROVIDER ?? '').toLowerCase().trim();

  // 1) 明示指定
  if (explicit === 'mock') {
    return new MockOcrProvider();
  }
  if (explicit === 'gcv' || explicit === 'google' || explicit === 'vision') {
    try {
      return new GoogleVisionProvider(envOverride.GOOGLE_VISION_API_KEY);
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'GoogleVisionProvider unavailable, fallback to Mock',
      );
      return new MockOcrProvider();
    }
  }
  if (explicit === 'claude' || explicit === 'anthropic') {
    // Phase2 雛形。'auto' 経路では使わない。明示指定された場合のみ。
    try {
      return new ClaudeProvider(envOverride.ANTHROPIC_API_KEY);
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'ClaudeProvider unavailable, fallback to Mock',
      );
      return new MockOcrProvider();
    }
  }

  // 2) 'auto' or unset / unknown value → GOOGLE_VISION_API_KEY presence 判定
  const gvKey = envOverride.GOOGLE_VISION_API_KEY;
  if (gvKey && gvKey.length > 0) {
    try {
      return new GoogleVisionProvider(gvKey);
    } catch {
      // fallthrough
    }
  }

  // 3) fallback
  log.info('no OCR API keys present; using MockOcrProvider');
  return new MockOcrProvider();
}
