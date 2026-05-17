import { logger, type Logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  pgmqDelete,
  pgmqEnsureQueue,
  pgmqRead,
  pgmqSend,
  type PgmqRow,
} from '../lib/pgmq.js';
import { pickProvider } from '../lib/summarize/providers.js';
import type { TranscriptSegment } from '@ksp/shared';
import { transcriptSegmentSchema } from '@ksp/shared';
import { assertMeetingCap } from '../lib/cost-guard.js';
import { captureException } from '../lib/sentry.js';
import {
  jobDurationSeconds,
  jobsProcessedTotal,
  llmCostUsdTotal,
  llmTokensTotal,
} from '../lib/metrics.js';

/**
 * pgmq `summarize_recording` consumer = 商談要約 + embedding enqueue。
 *
 * 入力 (recording-transcribe.ts が enqueue する形):
 *   { recordingId, meetingId, storageKey, reqId }
 *
 * 役割:
 *   1. recordings 行から transcript_segments を取得
 *   2. SummarizeProvider.summarize() → 構造化 JSON
 *   3. PII 検知 (固定キーワード辞書) で sensitivity 昇格
 *   4. recordings.{summary, key_points, customer_needs, objections, next_actions,
 *      commitments, sentiment_timeline, sensitivity, processing_status='embedding'}
 *      を UPDATE
 *   5. cost-guard (assertMeetingCap)
 *   6. generate_embeddings queue に recording_segment chunk を enqueue
 *   7. processing_status='completed'
 *
 * 失敗時:
 *   - recordings.processing_status='failed', processing_error 更新
 */

export interface SummarizeJobMessage {
  recordingId: string | null;
  meetingId?: string | null;
  storageKey?: string;
  reqId?: string | null;
}

export interface SummarizeJobResult {
  recordingId: string | null;
  segmentCount: number;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'restricted';
  estimatedCostUsd: number;
  provider: string;
  embeddingsEnqueued: number;
}

/**
 * Phase1 用の固定 PII キーワード辞書。
 * マイナンバー / クレカ番号 / 保険証番号 / パスポート番号 / 「機密」の単語 で
 * sensitivity を 'internal' → 'sensitive' に昇格する。
 * 本格 PII 検知は Phase2 で transformers / Google DLP に差し替える。
 */
const PII_PATTERNS: RegExp[] = [
  // 12 桁マイナンバー (連続数字)
  /\b\d{12}\b/,
  // クレジットカード (4-4-4-4 or 16連続)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  // パスポート番号 (英大2 + 数字7)
  /\b[A-Z]{2}\d{7}\b/,
  // 健康保険証番号 / 患者ID
  /保険証番号|被保険者番号/,
  // 機密ワード
  /(機密|社外秘|confidential|secret)/i,
];

function detectSensitivity(
  fullText: string,
  segments: TranscriptSegment[],
): 'public' | 'internal' | 'sensitive' | 'restricted' {
  const haystack = `${fullText}\n${segments.map((s) => s.text).join('\n')}`;
  for (const re of PII_PATTERNS) {
    if (re.test(haystack)) return 'sensitive';
  }
  return 'internal';
}

async function markFailed(
  recordingId: string | null,
  errorText: string,
  log: Logger,
): Promise<void> {
  if (!recordingId) return;
  try {
    await supabaseAdmin
      .from('recordings')
      .update({
        processing_status: 'failed',
        processing_error: errorText.slice(0, 500),
      })
      .eq('id', recordingId);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'mark failed update failed');
  }
}

async function loadSegments(
  recordingId: string,
  log: Logger,
): Promise<{ fullText: string; segments: TranscriptSegment[] }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .select('transcript_full, transcript_segments')
      .eq('id', recordingId)
      .maybeSingle();
    if (error || !data) {
      log.warn({ err: error?.message }, 'recordings select failed; using empty transcript');
      return { fullText: '', segments: [] };
    }
    const row = data as {
      transcript_full: string | null;
      transcript_segments: unknown;
    };
    const rawSegs = Array.isArray(row.transcript_segments) ? row.transcript_segments : [];
    const segments: TranscriptSegment[] = [];
    for (const r of rawSegs) {
      const parsed = transcriptSegmentSchema.safeParse(r);
      if (parsed.success) segments.push(parsed.data);
    }
    return { fullText: row.transcript_full ?? '', segments };
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'loadSegments threw');
    return { fullText: '', segments: [] };
  }
}

export async function runRecordingSummarize(
  message: SummarizeJobMessage,
): Promise<SummarizeJobResult> {
  const log = logger.child({
    op: 'recording.summarize',
    recordingId: message.recordingId,
    reqId: message.reqId,
  });

  // 1) segments 取得 (recordingId が無ければ空入力で続行)
  let fullText = '';
  let segments: TranscriptSegment[] = [];
  if (message.recordingId) {
    const loaded = await loadSegments(message.recordingId, log);
    fullText = loaded.fullText;
    segments = loaded.segments;
  }

  // 2) summarize provider 実行
  const provider = pickProvider();
  let result;
  try {
    result = await provider.summarize(segments);
  } catch (err) {
    log.error({ err: (err as Error).message }, 'summarize failed');
    await markFailed(message.recordingId, (err as Error).message, log);
    captureException(err, {
      op: 'recording.summarize',
      recordingId: message.recordingId,
    });
    throw err;
  }

  // 2b) metrics: LLM token usage + cost (Round 2 SRE P1-SRE-02)
  if (provider.name !== 'mock' && result.estimatedCostUsd >= 0) {
    const modelLabel = provider.name === 'claude' ? 'claude-sonnet-4-5' : provider.name;
    if (result.inputTokens > 0) {
      llmTokensTotal.inc(
        { vendor: 'anthropic', model: modelLabel, kind: 'input' },
        result.inputTokens,
      );
    }
    if (result.outputTokens > 0) {
      llmTokensTotal.inc(
        { vendor: 'anthropic', model: modelLabel, kind: 'output' },
        result.outputTokens,
      );
    }
    if (result.estimatedCostUsd > 0) {
      llmCostUsdTotal.inc({ vendor: 'anthropic', model: modelLabel }, result.estimatedCostUsd);
    }
  }

  // 3) cost-guard
  if (message.meetingId) {
    try {
      assertMeetingCap({ meetingId: message.meetingId, spendUsd: result.estimatedCostUsd });
    } catch (err) {
      log.warn(
        { err: (err as Error).message, spendUsd: result.estimatedCostUsd },
        'meeting cost cap exceeded at summarize step',
      );
      await markFailed(message.recordingId, (err as Error).message, log);
      throw err;
    }
  }

  // 4) PII 検知 → sensitivity
  const sensitivity = detectSensitivity(fullText, segments);

  // 5) recordings UPDATE
  if (message.recordingId) {
    try {
      await supabaseAdmin
        .from('recordings')
        .update({
          summary: result.summary,
          key_points: result.keyPoints,
          customer_needs: result.customerNeeds,
          objections: result.objections,
          next_actions: result.nextActions,
          commitments: result.commitments,
          sentiment_timeline: result.sentimentTimeline,
          sensitivity,
          processing_status: 'embedding',
          processing_error: null,
        })
        .eq('id', message.recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'recordings summarize update failed');
    }
  }

  // 6) generate_embeddings に recording_segment chunk を enqueue
  let embeddingsEnqueued = 0;
  if (message.recordingId && segments.length > 0) {
    const chunks = segments.map((s, idx) => ({
      index: idx,
      text: s.text,
      metadata: {
        startSec: s.startSec,
        endSec: s.endSec,
        speakerLabel: s.speakerLabel,
      },
    }));
    try {
      await pgmqSend('generate_embeddings', {
        sourceType: 'recording_segment',
        sourceId: message.recordingId,
        chunks,
      });
      embeddingsEnqueued = chunks.length;
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'generate_embeddings enqueue failed (non-fatal)',
      );
    }
  }

  // 7) processing_status='completed'
  if (message.recordingId) {
    try {
      await supabaseAdmin
        .from('recordings')
        .update({
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', message.recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'final status=completed update failed');
    }
  }

  log.info(
    {
      recordingId: message.recordingId,
      sensitivity,
      segmentCount: segments.length,
      embeddingsEnqueued,
      provider: result.provider,
      estimatedCostUsd: result.estimatedCostUsd,
    },
    'recording.summarize completed',
  );

  return {
    recordingId: message.recordingId,
    segmentCount: segments.length,
    sensitivity,
    estimatedCostUsd: result.estimatedCostUsd,
    provider: result.provider,
    embeddingsEnqueued,
  };
}

// ---------------------------------------------------------------------------
// pgmq tick (Round 2 CTO HIGH-C-03): tickAll に配線する entry。
// summarize_recording キューを poll → runRecordingSummarize() → ack/retry。
// ---------------------------------------------------------------------------

const SUMMARIZE_QUEUE_NAME = 'summarize_recording';
let inFlightSummarizeTick = false;

export async function tickRecordingSummarize(opts?: {
  batchSize?: number;
  visibilitySec?: number;
}): Promise<{ processed: number; acked: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 2;
  const visibilitySec = opts?.visibilitySec ?? 180;
  if (inFlightSummarizeTick) return { processed: 0, acked: 0, failed: 0 };
  inFlightSummarizeTick = true;
  const log = logger.child({ tick: 'recording.summarize' });
  try {
    await pgmqEnsureQueue(SUMMARIZE_QUEUE_NAME);

    const rows: PgmqRow<unknown>[] = await pgmqRead<unknown>(SUMMARIZE_QUEUE_NAME, {
      visibilityTimeoutSeconds: visibilitySec,
      batch: batchSize,
    });
    if (rows.length === 0) return { processed: 0, acked: 0, failed: 0 };

    let acked = 0;
    let failed = 0;
    for (const row of rows) {
      jobsProcessedTotal.inc({ queue: SUMMARIZE_QUEUE_NAME, status: 'started' });
      const jobStart = process.hrtime.bigint();
      const message = (row.message ?? {}) as SummarizeJobMessage;
      try {
        await runRecordingSummarize(message);
        await pgmqDelete(SUMMARIZE_QUEUE_NAME, row.msg_id);
        acked++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: SUMMARIZE_QUEUE_NAME, status: 'done' });
        jobDurationSeconds.observe({ queue: SUMMARIZE_QUEUE_NAME, status: 'done' }, durationSec);
      } catch (err) {
        failed++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: SUMMARIZE_QUEUE_NAME, status: 'failed' });
        jobDurationSeconds.observe(
          { queue: SUMMARIZE_QUEUE_NAME, status: 'failed' },
          durationSec,
        );
        log.error(
          { err: (err as Error).message, msgId: row.msg_id },
          'recording.summarize job threw; leaving in queue for retry',
        );
      }
    }
    return { processed: rows.length, acked, failed };
  } finally {
    inFlightSummarizeTick = false;
  }
}
