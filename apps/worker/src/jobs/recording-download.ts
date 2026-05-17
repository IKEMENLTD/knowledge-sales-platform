import { STORAGE_BUCKETS } from '@ksp/shared';
import { env } from '../env.js';
import { logger, type Logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  pgmqDelete,
  pgmqEnsureQueue,
  pgmqRead,
  pgmqSend,
  type PgmqRow,
} from '../lib/pgmq.js';
import { downloadZoomRecording, ZoomNotConfiguredError } from '../lib/zoom.js';
import { captureException } from '../lib/sentry.js';
import {
  jobDurationSeconds,
  jobsProcessedTotal,
} from '../lib/metrics.js';

/**
 * pgmq `process_recording` consumer の 1 ステップ目 = ダウンロード。
 *
 * 役割:
 *   1. Zoom download_url から audio/video バイト列を取得
 *      - ZOOM_* env 不在時は **mock blob** (固定 64KB) を生成して進める
 *   2. Supabase Storage 'recordings' bucket (or R2) に upload
 *   3. recordings.video_storage_key / processing_status='downloading' を更新
 *   4. `transcribe_recording` queue (新規) に enqueue
 *
 * 失敗時:
 *   - recordings.processing_error を更新し processing_status='failed'
 *   - 再試行は pgmq 側 read_ct で制御 (worker 起動側で max_attempts=3 想定)
 *
 * NOTE: pgmq には `transcribe_recording` キューが migration 上は無いので、
 *       runtime で `select pgmq.create('transcribe_recording')` を一度叩いて
 *       無ければ作る。冪等。
 */

export interface ProcessRecordingMessage {
  /** 既存 webhook が enqueue する payload */
  zoomMeetingId?: string;
  zoomRecordingUuid?: string;
  meetingDbId?: string | null;
  eventTs?: number;
  downloadToken?: string;
  reqId?: string;
  /** processRecordingPayload schema (shared/types.ts) 形 (新規 enqueue 経路) */
  zoomRecordingId?: string;
  meetingId?: string;
  downloadUrl?: string;
  expiresAt?: string;
}

export interface DownloadJobResult {
  recordingId: string | null;
  storageKey: string;
  bytesWritten: number;
  via: 'zoom' | 'mock';
}

const TRANSCRIBE_QUEUE = 'transcribe_recording';

/**
 * Round 2 Architect HIGH-A-03: queue 作成 は lib/pgmq.ts の `pgmqEnsureQueue`
 * 経由に統一。旧実装は毎回 `postgres()` を new していたため接続が暴走していた。
 * `_log` は API 互換のため受け取るが、出力は pgmqEnsureQueue 側の logger.child 任せ。
 */
async function ensureTranscribeQueue(_log: Logger): Promise<void> {
  await pgmqEnsureQueue(TRANSCRIBE_QUEUE);
}

/**
 * Mock blob を生成する (Zoom 鍵不在 / dev / CI 用)。
 * 64KB の決定論的 byte pattern。
 */
function makeMockBlob(): { bytes: Uint8Array; contentType: string } {
  const size = 64 * 1024;
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) buf[i] = i & 0xff;
  return { bytes: buf, contentType: 'audio/mp4' };
}

/**
 * Supabase Storage に upload する。R2 鍵が揃っていれば R2 を優先する余地はあるが、
 * Phase1 scaffold では Supabase Storage 'recordings' bucket に統一する。
 */
async function uploadToStorage(args: {
  storageKey: string;
  bytes: Uint8Array;
  contentType: string;
  log: Logger;
}): Promise<void> {
  const { storageKey, bytes, contentType, log } = args;
  try {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.recordings)
      .upload(storageKey, bytes, {
        contentType,
        upsert: true,
      });
    if (error) {
      // bucket 不在 / RLS の場合は warn だけ吐いて続行 (P1 scaffold)
      log.warn({ err: error.message, key: storageKey }, 'storage upload failed (soft-fail)');
      return;
    }
    log.debug({ key: storageKey, bytes: bytes.length }, 'storage upload ok');
  } catch (err) {
    log.warn(
      { err: (err as Error).message, key: storageKey },
      'storage upload threw (soft-fail)',
    );
  }
}

export async function runRecordingDownload(
  message: ProcessRecordingMessage,
  opts: { fetchImpl?: typeof fetch; nowMs?: () => number } = {},
): Promise<DownloadJobResult> {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const log = logger.child({
    op: 'recording.download',
    meetingDbId: message.meetingDbId ?? message.meetingId,
    zoomRecordingUuid: message.zoomRecordingUuid ?? message.zoomRecordingId,
    reqId: message.reqId,
  });

  // 1) recordings 行の特定
  //    webhook 経路: meetingDbId + zoomRecordingUuid
  //    手動経路: meetingId + zoomRecordingId
  const zoomRecordingUuid =
    message.zoomRecordingUuid ?? message.zoomRecordingId ?? null;
  const meetingDbId = message.meetingDbId ?? message.meetingId ?? null;

  let recordingId: string | null = null;
  if (meetingDbId) {
    try {
      const { data } = await supabaseAdmin
        .from('recordings')
        .select('id, processing_status')
        .eq('meeting_id', meetingDbId)
        .maybeSingle();
      recordingId = (data as { id?: string } | null)?.id ?? null;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'recordings lookup failed (continuing)');
    }
  }

  // 2) processing_status='downloading' に遷移
  if (recordingId) {
    try {
      await supabaseAdmin
        .from('recordings')
        .update({ processing_status: 'downloading', processing_error: null })
        .eq('id', recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'status=downloading update failed');
    }
  }

  // 3) Zoom or Mock からバイト列を取得
  let bytes: Uint8Array;
  let contentType: string;
  let via: 'zoom' | 'mock' = 'zoom';

  const haveZoomKeys =
    env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET &&
    !env.ZOOM_ACCOUNT_ID.startsWith('zoom-acct-test'); // test env 検知

  const downloadUrl = message.downloadUrl;

  if (!haveZoomKeys || !downloadUrl) {
    log.info(
      { haveZoomKeys, haveDownloadUrl: Boolean(downloadUrl) },
      'using mock blob (zoom not configured or no download_url)',
    );
    const mock = makeMockBlob();
    bytes = mock.bytes;
    contentType = mock.contentType;
    via = 'mock';
  } else {
    try {
      const res = await downloadZoomRecording(downloadUrl, {
        fetchImpl: opts.fetchImpl,
      });
      bytes = res.bytes;
      contentType = res.contentType;
    } catch (err) {
      if (err instanceof ZoomNotConfiguredError) {
        log.info('ZoomNotConfigured caught; falling back to mock blob');
        const mock = makeMockBlob();
        bytes = mock.bytes;
        contentType = mock.contentType;
        via = 'mock';
      } else {
        log.error({ err: (err as Error).message }, 'zoom download failed');
        await markFailed(recordingId, (err as Error).message, log);
        captureException(err, {
          op: 'recording.download',
          meetingDbId,
          zoomRecordingUuid,
        });
        throw err;
      }
    }
  }

  // 4) Storage upload (Supabase Storage 'recordings' bucket)
  //    キー形式: `{meetingId or unassigned}/{zoomRecordingUuid or ts}.mp4`
  const safeMeeting = meetingDbId ?? 'unassigned';
  const safeRecording = zoomRecordingUuid ?? `auto-${nowMs()}`;
  const storageKey = `${safeMeeting}/${safeRecording}.mp4`;
  await uploadToStorage({ storageKey, bytes, contentType, log });

  // 5) recordings に video_storage_key / size を保存
  if (recordingId) {
    try {
      await supabaseAdmin
        .from('recordings')
        .update({
          video_storage_key: storageKey,
          video_size_bytes: bytes.length,
        })
        .eq('id', recordingId);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'recordings storage_key update failed');
    }
  }

  // 6) `transcribe_recording` queue を ensure → enqueue
  await ensureTranscribeQueue(log);
  await pgmqSend(TRANSCRIBE_QUEUE as 'process_recording', {
    recordingId,
    meetingId: meetingDbId,
    zoomRecordingId: zoomRecordingUuid,
    storageKey,
    contentType,
    via,
    reqId: message.reqId ?? null,
  } as unknown as Record<string, unknown>);

  log.info(
    { recordingId, storageKey, bytes: bytes.length, via },
    'recording.download completed',
  );
  return {
    recordingId,
    storageKey,
    bytesWritten: bytes.length,
    via,
  };
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

// ---------------------------------------------------------------------------
// pgmq tick (Round 2 CTO HIGH-C-03): tickAll に配線するための entry。
// process_recording キューを poll → runRecordingDownload() → ack/retry。
// ---------------------------------------------------------------------------

const PROCESS_RECORDING_QUEUE = 'process_recording';
let inFlightDownloadTick = false;

/**
 * 一定間隔で `process_recording` キューから messages を取り、download job を実行する。
 * payload schema は厳密検証しない (webhook 経路と manual enqueue 経路で shape が
 * 違うため)。`runRecordingDownload` が undefined-safe に処理する。
 */
export async function tickRecordingDownload(opts?: {
  batchSize?: number;
  visibilitySec?: number;
}): Promise<{ processed: number; acked: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 3;
  const visibilitySec = opts?.visibilitySec ?? 120;
  if (inFlightDownloadTick) return { processed: 0, acked: 0, failed: 0 };
  inFlightDownloadTick = true;
  const log = logger.child({ tick: 'recording.download' });
  try {
    // process_recording は migration 上 ensure 済みのはずだが、念のため。
    await pgmqEnsureQueue(PROCESS_RECORDING_QUEUE);

    const rows: PgmqRow<unknown>[] = await pgmqRead<unknown>(PROCESS_RECORDING_QUEUE, {
      visibilityTimeoutSeconds: visibilitySec,
      batch: batchSize,
    });
    if (rows.length === 0) return { processed: 0, acked: 0, failed: 0 };

    let acked = 0;
    let failed = 0;
    for (const row of rows) {
      jobsProcessedTotal.inc({ queue: PROCESS_RECORDING_QUEUE, status: 'started' });
      const jobStart = process.hrtime.bigint();
      const message = (row.message ?? {}) as ProcessRecordingMessage;
      try {
        await runRecordingDownload(message);
        await pgmqDelete(PROCESS_RECORDING_QUEUE, row.msg_id);
        acked++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: PROCESS_RECORDING_QUEUE, status: 'done' });
        jobDurationSeconds.observe({ queue: PROCESS_RECORDING_QUEUE, status: 'done' }, durationSec);
      } catch (err) {
        failed++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: PROCESS_RECORDING_QUEUE, status: 'failed' });
        jobDurationSeconds.observe(
          { queue: PROCESS_RECORDING_QUEUE, status: 'failed' },
          durationSec,
        );
        log.error(
          { err: (err as Error).message, msgId: row.msg_id },
          'recording.download job threw; leaving in queue for retry',
        );
      }
    }
    return { processed: rows.length, acked, failed };
  } finally {
    inFlightDownloadTick = false;
  }
}
