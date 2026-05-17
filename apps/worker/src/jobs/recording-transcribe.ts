import { STORAGE_BUCKETS } from '@ksp/shared';
import { logger, type Logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  pgmqDelete,
  pgmqEnsureQueue,
  pgmqRead,
  pgmqSend,
  type PgmqRow,
} from '../lib/pgmq.js';
import { pickProvider } from '../lib/transcribe/providers.js';
import { assertMeetingCap } from '../lib/cost-guard.js';
import { captureException } from '../lib/sentry.js';
import {
  jobDurationSeconds,
  jobsProcessedTotal,
} from '../lib/metrics.js';

/**
 * pgmq `transcribe_recording` consumer = 文字起こし。
 *
 * 入力 (recording-download.ts が enqueue する形):
 *   { recordingId, meetingId, zoomRecordingId, storageKey, contentType, via, reqId }
 *
 * 役割:
 *   1. Supabase Storage から audio バイトを取得 (mock blob 経路でも同じ)
 *   2. TranscribeProvider.transcribe() → fullText + segments[]
 *   3. recordings.{transcript_full, transcript_segments, transcript_source,
 *      video_duration_seconds, processing_status='analyzing'} を UPDATE
 *   4. cost-guard: estimatedCostUsd を assertMeetingCap で検査
 *   5. `summarize_recording` queue (新規) に enqueue
 *
 * 失敗時:
 *   - recordings.processing_status='failed', processing_error 更新
 */

export interface TranscribeJobMessage {
  recordingId: string | null;
  meetingId?: string | null;
  zoomRecordingId?: string | null;
  storageKey: string;
  contentType?: string;
  via?: 'zoom' | 'mock';
  reqId?: string | null;
}

export interface TranscribeJobResult {
  recordingId: string | null;
  segmentCount: number;
  fullTextLen: number;
  estimatedCostUsd: number;
  provider: string;
}

const SUMMARIZE_QUEUE = 'summarize_recording';

/**
 * Round 2 Architect HIGH-A-03: queue 作成 は lib/pgmq.ts の `pgmqEnsureQueue`
 * 経由に統一。旧実装は毎回 `postgres()` を new していたため接続が暴走していた。
 */
async function ensureSummarizeQueue(_log: Logger): Promise<void> {
  await pgmqEnsureQueue(SUMMARIZE_QUEUE);
}

async function readAudioFromStorage(
  storageKey: string,
  log: Logger,
): Promise<Uint8Array> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.recordings)
      .download(storageKey);
    if (error || !data) {
      log.warn({ err: error?.message, key: storageKey }, 'storage download failed; using empty');
      return new Uint8Array(0);
    }
    // Supabase storage download() returns a Blob (web) — Node Fetch Blob has arrayBuffer.
    const ab = await (data as Blob).arrayBuffer();
    return new Uint8Array(ab);
  } catch (err) {
    log.warn(
      { err: (err as Error).message, key: storageKey },
      'storage download threw; using empty',
    );
    return new Uint8Array(0);
  }
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

export async function runRecordingTranscribe(
  message: TranscribeJobMessage,
): Promise<TranscribeJobResult> {
  const log = logger.child({
    op: 'recording.transcribe',
    recordingId: message.recordingId,
    storageKey: message.storageKey,
    reqId: message.reqId,
  });

  // 1) status='transcribing'
  if (message.recordingId) {
    try {
      await supabaseAdmin
        .from('recordings')
        .update({ processing_status: 'transcribing' })
        .eq('id', message.recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'status=transcribing update failed');
    }
  }

  // 2) audio bytes 取得
  const audio = await readAudioFromStorage(message.storageKey, log);
  const mime = message.contentType ?? 'audio/mp4';

  // 3) provider 選択 → transcribe
  const provider = pickProvider();
  let result;
  try {
    result = await provider.transcribe(audio, mime);
  } catch (err) {
    log.error({ err: (err as Error).message }, 'transcribe failed');
    await markFailed(message.recordingId, (err as Error).message, log);
    captureException(err, { op: 'recording.transcribe', recordingId: message.recordingId });
    throw err;
  }

  // 4) cost-guard (mock=0 で常に pass)
  if (message.meetingId) {
    try {
      assertMeetingCap({ meetingId: message.meetingId, spendUsd: result.estimatedCostUsd });
    } catch (err) {
      log.warn(
        { err: (err as Error).message, spendUsd: result.estimatedCostUsd },
        'meeting cost cap exceeded at transcribe step',
      );
      await markFailed(message.recordingId, (err as Error).message, log);
      throw err;
    }
  }

  // 5) recordings UPDATE (transcript_full / transcript_segments / analyzing)
  if (message.recordingId) {
    try {
      const lastEnd = result.segments[result.segments.length - 1]?.endSec ?? 0;
      await supabaseAdmin
        .from('recordings')
        .update({
          transcript_full: result.fullText,
          transcript_segments: result.segments,
          transcript_source: provider.name === 'whisper' ? 'whisper' : 'zoom',
          video_duration_seconds: Math.ceil(lastEnd),
          processing_status: 'analyzing',
          processing_error: null,
        })
        .eq('id', message.recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'recordings transcript update failed');
    }
  }

  // 6) summarize_recording を enqueue
  await ensureSummarizeQueue(log);
  await pgmqSend(SUMMARIZE_QUEUE as 'process_recording', {
    recordingId: message.recordingId,
    meetingId: message.meetingId ?? null,
    storageKey: message.storageKey,
    reqId: message.reqId ?? null,
  } as unknown as Record<string, unknown>);

  log.info(
    {
      recordingId: message.recordingId,
      segmentCount: result.segments.length,
      fullTextLen: result.fullText.length,
      provider: result.provider,
      estimatedCostUsd: result.estimatedCostUsd,
    },
    'recording.transcribe completed',
  );

  return {
    recordingId: message.recordingId,
    segmentCount: result.segments.length,
    fullTextLen: result.fullText.length,
    estimatedCostUsd: result.estimatedCostUsd,
    provider: result.provider,
  };
}

// ---------------------------------------------------------------------------
// pgmq tick (Round 2 CTO HIGH-C-03): tickAll に配線する entry。
// transcribe_recording キューを poll → runRecordingTranscribe() → ack/retry。
// ---------------------------------------------------------------------------

const TRANSCRIBE_QUEUE_NAME = 'transcribe_recording';
let inFlightTranscribeTick = false;

export async function tickRecordingTranscribe(opts?: {
  batchSize?: number;
  visibilitySec?: number;
}): Promise<{ processed: number; acked: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 2;
  const visibilitySec = opts?.visibilitySec ?? 300;
  if (inFlightTranscribeTick) return { processed: 0, acked: 0, failed: 0 };
  inFlightTranscribeTick = true;
  const log = logger.child({ tick: 'recording.transcribe' });
  try {
    await pgmqEnsureQueue(TRANSCRIBE_QUEUE_NAME);

    const rows: PgmqRow<unknown>[] = await pgmqRead<unknown>(TRANSCRIBE_QUEUE_NAME, {
      visibilityTimeoutSeconds: visibilitySec,
      batch: batchSize,
    });
    if (rows.length === 0) return { processed: 0, acked: 0, failed: 0 };

    let acked = 0;
    let failed = 0;
    for (const row of rows) {
      jobsProcessedTotal.inc({ queue: TRANSCRIBE_QUEUE_NAME, status: 'started' });
      const jobStart = process.hrtime.bigint();
      const message = (row.message ?? {}) as TranscribeJobMessage;
      try {
        await runRecordingTranscribe(message);
        await pgmqDelete(TRANSCRIBE_QUEUE_NAME, row.msg_id);
        acked++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: TRANSCRIBE_QUEUE_NAME, status: 'done' });
        jobDurationSeconds.observe({ queue: TRANSCRIBE_QUEUE_NAME, status: 'done' }, durationSec);
      } catch (err) {
        failed++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: TRANSCRIBE_QUEUE_NAME, status: 'failed' });
        jobDurationSeconds.observe(
          { queue: TRANSCRIBE_QUEUE_NAME, status: 'failed' },
          durationSec,
        );
        log.error(
          { err: (err as Error).message, msgId: row.msg_id },
          'recording.transcribe job threw; leaving in queue for retry',
        );
      }
    }
    return { processed: rows.length, acked, failed };
  } finally {
    inFlightTranscribeTick = false;
  }
}
