import OpenAI, { toFile } from 'openai';
import type { TranscriptSegment } from '@ksp/shared';
import { transcriptSegmentSchema } from '@ksp/shared';
import { logger } from '../logger.js';

/**
 * 録画音声 → 文字起こし provider 抽象 (Phase2G T-012, Round 3 で本実装化)。
 *
 * 設計:
 *   - 実装は 2 つ: Mock / Whisper (OpenAI whisper-1)
 *   - factory pickProvider() が env で 1 つ選ぶ。
 *     優先度: 明示 TRANSCRIBE_PROVIDER -> OPENAI_API_KEY -> Mock
 *   - env キー不在環境 (dev / CI) で throw しない。Mock に自動 fallback。
 *
 * Round 3 (実装本番化):
 *   - WhisperProvider が `openai.audio.transcriptions.create({ model: 'whisper-1',
 *     response_format: 'verbose_json' })` を実際に呼び出す。
 *   - timeout 120s / maxRetries 0、AbortSignal.timeout(120s) を二重で配線。
 *   - 25MB 超 (Whisper API hard limit) は "audio_too_large" として throw。
 *   - 50MB 超は即 reject + log warn (download 直後の sanity guard 兼用)。
 *   - cost: $0.006 per minute → estimatedCostUsd を audio 長で算出する。
 */

export interface TranscribeResult {
  /** 連結済みフルテキスト */
  fullText: string;
  /** 文節 / 30s 単位のセグメント列 (UI でタイムライン描画に使う) */
  segments: TranscriptSegment[];
  /** 言語コード (ISO 639-1) */
  language: string;
  /** provider 名 */
  provider: string;
  /** USD 概算 (cost-guard 用) */
  estimatedCostUsd: number;
  /** 推定信頼度 (0-1) */
  overallConfidence: number;
}

export interface TranscribeProvider {
  readonly name: string;
  transcribe(audio: Uint8Array, mime: string): Promise<TranscribeResult>;
}

export class TranscribeNotConfiguredError extends Error {
  override readonly name = 'TranscribeNotConfiguredError';
  constructor(missing: string) {
    super(`Transcribe provider not configured: ${missing}`);
  }
}

/**
 * 25MB を超える audio を Whisper REST に送ろうとした場合に throw する。
 * recording-transcribe.ts 側は status='failed' に落として ack する想定。
 */
export class TranscribeAudioTooLargeError extends Error {
  override readonly name = 'TranscribeAudioTooLargeError';
  constructor(byteLength: number, limitBytes: number) {
    super(
      `audio_too_large: ${byteLength} bytes > ${limitBytes} bytes (Whisper REST limit)`,
    );
  }
}

// ============================================================================
// Mock provider
// ============================================================================

/**
 * 決定論的 fixture を返す Mock。3 segments で速攻 return する。
 *
 * shared/recordings-detail.ts の transcriptSegmentSchema に準拠。
 * `audio` バイト列の中身は見ずに固定 segment を返すため、テストでは後段の
 * summarize / embed / cost-guard だけが評価対象になる。
 */
export class MockTranscribeProvider implements TranscribeProvider {
  readonly name = 'mock';

  async transcribe(_audio: Uint8Array, _mime: string): Promise<TranscribeResult> {
    void _audio;
    void _mime;
    const segments: TranscriptSegment[] = [
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
        endSec: 78.0,
        speakerLabel: 'guest',
        text: '営業効率化のツールを検討していまして、貴社のソリューションに興味があります。',
        confidence: 0.91,
      },
      {
        index: 2,
        startSec: 78.0,
        endSec: 124.0,
        speakerLabel: 'host',
        text: 'ありがとうございます。次回までに見積もりと導入事例をお送りします。',
        confidence: 0.93,
      },
    ];
    // 自己検証 (fixture 改変時の regression を即検出)
    for (const s of segments) transcriptSegmentSchema.parse(s);

    const fullText = segments.map((s) => s.text).join('\n');
    return {
      fullText,
      segments,
      language: 'ja',
      provider: 'mock',
      estimatedCostUsd: 0,
      overallConfidence: 0.93,
    };
  }
}

// ============================================================================
// Whisper provider (本実装)
// ============================================================================

/** Whisper REST API の音声ファイル上限 (multipart/form-data 1 リクエストあたり)。 */
const WHISPER_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
/** R2 download 後の sanity guard。Whisper には絶対送らずに即 reject する閾値。 */
const WHISPER_HARD_REJECT_BYTES = 50 * 1024 * 1024; // 50 MB
/** Whisper REST の単一リクエスト timeout。pgmq visibility timeout より十分短く。 */
const WHISPER_REQUEST_TIMEOUT_MS = 120_000;
/** whisper-1 公式価格 (2024 GA): $0.006 / minute。 */
const WHISPER_USD_PER_MINUTE = 0.006;

/**
 * mime → Whisper REST が受け取れるファイル名拡張子の判定。
 * Whisper は extension を URL/filename から推定するため、最低限の mapping を持つ。
 * 未知 mime は 'audio.bin' で送って Whisper 側のエラーに任せる。
 */
function fileNameForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mp4') || m.includes('m4a')) return 'audio.mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'audio.mp3';
  if (m.includes('wav')) return 'audio.wav';
  if (m.includes('webm')) return 'audio.webm';
  if (m.includes('ogg')) return 'audio.ogg';
  if (m.includes('flac')) return 'audio.flac';
  return 'audio.mp4';
}

/**
 * OpenAI Whisper API で音声を文字起こしする provider。
 *
 * 実装ポイント:
 *   - openai SDK の `audio.transcriptions.create()` (multipart) を使う。
 *   - response_format: 'verbose_json' → segments[] 取得 (start/end/avg_logprob)
 *   - language: 'ja' (英語混在も受けるが Japanese hint で精度上昇)
 *   - timeout 120s + maxRetries: 0 (pgmq visibility timeout が retry を担当)
 *   - signal: AbortSignal.timeout(120s) で SDK timeout を二重に保険
 *
 * 失敗パターン:
 *   - 25MB 超 → TranscribeAudioTooLargeError
 *   - 50MB 超 → 即 throw (Whisper に送らない)
 *   - OPENAI_API_KEY 不在 → TranscribeNotConfiguredError (factory が catch)
 */
export class WhisperProvider implements TranscribeProvider {
  readonly name = 'whisper';

  private readonly client: OpenAI;
  /** factory から渡された (or fallback で構築した) raw key。logging では出さない。 */
  private readonly apiKey: string;

  constructor(apiKey: string | undefined = process.env.OPENAI_API_KEY) {
    if (!apiKey || apiKey.length === 0 || apiKey === 'sk-openai-test') {
      throw new TranscribeNotConfiguredError('OPENAI_API_KEY');
    }
    this.apiKey = apiKey;
    this.client = new OpenAI({
      apiKey,
      timeout: WHISPER_REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  async transcribe(audio: Uint8Array, mime: string): Promise<TranscribeResult> {
    const log = logger.child({ op: 'transcribe.whisper', mime, bytes: audio.byteLength });

    // ---- size guards ----
    if (audio.byteLength > WHISPER_HARD_REJECT_BYTES) {
      log.warn(
        { bytes: audio.byteLength, limit: WHISPER_HARD_REJECT_BYTES },
        'audio exceeds hard reject limit (50MB); rejecting without API call',
      );
      throw new TranscribeAudioTooLargeError(audio.byteLength, WHISPER_HARD_REJECT_BYTES);
    }
    if (audio.byteLength > WHISPER_MAX_FILE_BYTES) {
      throw new TranscribeAudioTooLargeError(audio.byteLength, WHISPER_MAX_FILE_BYTES);
    }

    // ---- multipart file ----
    const filename = fileNameForMime(mime);
    const file = await toFile(audio, filename, { type: mime || 'application/octet-stream' });

    // ---- API call ----
    // 二重 timeout: SDK の `timeout` option (per-request) + AbortSignal.timeout()
    // どちらが先に発火しても client は AbortError を throw する。
    const verbose = await this.client.audio.transcriptions.create(
      {
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'ja',
        // 1 segment あたりの timestamp 精度を上げる。word までは取らない (cost/latency)。
        timestamp_granularities: ['segment'],
      },
      { signal: AbortSignal.timeout(WHISPER_REQUEST_TIMEOUT_MS) },
    );

    // ---- 正規化 ----
    const rawSegments = verbose.segments ?? [];
    const segments: TranscriptSegment[] = rawSegments.map((s, idx) => {
      const confidence =
        typeof s.avg_logprob === 'number' && Number.isFinite(s.avg_logprob)
          ? clamp01(Math.exp(s.avg_logprob))
          : undefined;
      const seg: TranscriptSegment = {
        index: idx,
        startSec: Math.max(0, Number(s.start) || 0),
        // Whisper は end > start を保証するが、API のレスポンス揺れに備えて
        // end <= start のときは startSec + 1e-3 で fallback (transcriptSegmentSchema.endSec.positive())。
        endSec: Math.max(Math.max(0, Number(s.start) || 0) + 0.001, Number(s.end) || 0),
        speakerLabel: 'speaker_0', // diarization は Phase2 で別 provider に切る
        text: s.text ?? '',
        ...(confidence === undefined ? {} : { confidence }),
      };
      transcriptSegmentSchema.parse(seg);
      return seg;
    });

    // verbose_json は text フィールドを必ず持つが、segments 起源で再構築すると
    // Whisper 側の連結ロジック (改行/句読点) と微妙に変わる可能性がある。
    // 後段の summarize は fullText に依存しているので Whisper 側のオリジナルを優先。
    const fullText = verbose.text ?? segments.map((s) => s.text).join('\n');

    // ---- cost ----
    // verbose.duration が秒で来る → 分換算 → $0.006/min。
    // duration が落ちている場合 (旧 API 互換) は最後の endSec を fallback。
    const durationSec =
      typeof verbose.duration === 'number' && Number.isFinite(verbose.duration)
        ? verbose.duration
        : (segments[segments.length - 1]?.endSec ?? 0);
    const estimatedCostUsd = (durationSec / 60) * WHISPER_USD_PER_MINUTE;

    // ---- overall confidence ----
    // segment confidence の平均。confidence 欠落 segment は分母から除外する。
    const confidences = segments
      .map((s) => s.confidence)
      .filter((c): c is number => typeof c === 'number');
    const overallConfidence =
      confidences.length === 0
        ? 0.5
        : confidences.reduce((a, b) => a + b, 0) / confidences.length;

    log.info(
      {
        segmentCount: segments.length,
        durationSec,
        estimatedCostUsd,
        language: verbose.language,
      },
      'whisper transcribe completed',
    );

    // suppress "unused" lint on apiKey while keeping it for future re-init paths
    void this.apiKey;

    return {
      fullText,
      segments,
      language: verbose.language ?? 'ja',
      provider: 'whisper',
      estimatedCostUsd,
      overallConfidence,
    };
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ============================================================================
// factory
// ============================================================================

/**
 * env 状況から TranscribeProvider を 1 つ選んで返す。
 *
 * 選択優先度:
 *   1. process.env.TRANSCRIBE_PROVIDER ('mock' | 'whisper' | 'openai' | 'auto')
 *      が明示されていればそれ。鍵が無くて構築失敗したら Mock に fallback。
 *   2. 'auto' (default) は OPENAI_API_KEY (非 test) があれば Whisper、なければ Mock。
 *
 * **常に成功する** (throw しない) のが規約。
 */
export function pickProvider(
  envOverride: NodeJS.ProcessEnv = process.env,
): TranscribeProvider {
  const log = logger.child({ op: 'transcribe.pickProvider' });
  const explicit = (envOverride.TRANSCRIBE_PROVIDER ?? '').toLowerCase().trim();

  if (explicit === 'mock') {
    return new MockTranscribeProvider();
  }
  if (explicit === 'whisper' || explicit === 'openai') {
    try {
      return new WhisperProvider(envOverride.OPENAI_API_KEY);
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'WhisperProvider unavailable, fallback to Mock',
      );
      return new MockTranscribeProvider();
    }
  }

  // 'auto' or unset / unknown value → OPENAI_API_KEY presence 判定
  const openaiKey = envOverride.OPENAI_API_KEY;
  if (openaiKey && openaiKey.length > 0 && !openaiKey.startsWith('sk-openai-test')) {
    try {
      return new WhisperProvider(openaiKey);
    } catch {
      // fallthrough
    }
  }

  log.info('no transcribe API keys present; using MockTranscribeProvider');
  return new MockTranscribeProvider();
}
