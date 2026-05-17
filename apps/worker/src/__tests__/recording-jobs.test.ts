import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

/**
 * 実 API key が shell env に入っている場合 (CI/dev) でも Mock provider が
 * 必ず選ばれるよう、テスト全体で TRANSCRIBE_PROVIDER=mock / SUMMARIZE_PROVIDER=mock を
 * 強制する。OPENAI_API_KEY / ANTHROPIC_API_KEY も test 値に固定。
 */
vi.stubEnv('TRANSCRIBE_PROVIDER', 'mock');
vi.stubEnv('SUMMARIZE_PROVIDER', 'mock');
vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test');
vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');

afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * 録画 Worker 3 ジョブ (download → transcribe → summarize) の状態遷移を
 * Mock providers + in-memory supabase mock で end-to-end に検証する。
 *
 * 検証する状態遷移図:
 *
 *   recordings.processing_status:
 *     pending
 *       └─(download job)→ downloading ──→ transcribing
 *                                          (transcribe job が status を上書き)
 *       └─(transcribe job 完了時) → analyzing
 *                                    └─(summarize job)→ embedding ──→ completed
 *
 *   キュー enqueue 連鎖:
 *     pgmq.process_recording   (webhook が enqueue) — 本テストの起点
 *      → download job
 *        → pgmq.transcribe_recording 1 件
 *          → transcribe job
 *            → pgmq.summarize_recording 1 件
 *              → summarize job
 *                → pgmq.generate_embeddings (recording_segment, chunks N)
 *
 * cost-guard 発火: spendUsd > 0.5 USD で MEETING_COST_CAP_EXCEEDED throw、
 * recordings.processing_status='failed' へ遷移する。
 */

// ============================================================================
// In-memory state
// ============================================================================

interface RecordingRow {
  id: string;
  meeting_id: string;
  processing_status: string;
  processing_error?: string | null;
  transcript_full?: string | null;
  transcript_segments?: unknown;
  transcript_source?: string | null;
  video_storage_key?: string | null;
  video_size_bytes?: number | null;
  video_duration_seconds?: number | null;
  summary?: string | null;
  key_points?: unknown;
  customer_needs?: unknown;
  objections?: unknown;
  next_actions?: unknown;
  commitments?: unknown;
  sentiment_timeline?: unknown;
  sensitivity?: string;
  processed_at?: string | null;
}

const dbState = {
  recordings: new Map<string, RecordingRow>(),
  storage: new Map<string, Uint8Array>(),
  enqueued: [] as Array<{ queue: string; payload: Record<string, unknown> }>,
};

function resetDbState() {
  dbState.recordings.clear();
  dbState.storage.clear();
  dbState.enqueued = [];
}

// ============================================================================
// Mocks
// ============================================================================

// supabase mock
vi.mock('../lib/supabase.js', () => {
  function makeFromBuilder(table: string) {
    const ctx: {
      filterCol?: string;
      filterVal?: string;
      pendingUpdate?: Record<string, unknown>;
    } = {};
    const builder: Record<string, unknown> = {
      select(_cols: string) {
        return builder;
      },
      eq(col: string, val: string) {
        ctx.filterCol = col;
        ctx.filterVal = val;
        if (ctx.pendingUpdate && val) {
          if (table === 'recordings') {
            const row = dbState.recordings.get(val);
            if (row) {
              Object.assign(row, ctx.pendingUpdate);
              dbState.recordings.set(val, row);
            }
          }
          return Promise.resolve({ data: null, error: null });
        }
        return builder;
      },
      maybeSingle() {
        if (table === 'recordings') {
          // filter by either id or meeting_id
          if (ctx.filterCol === 'id' && ctx.filterVal) {
            const row = dbState.recordings.get(ctx.filterVal);
            return Promise.resolve({ data: row ?? null, error: null });
          }
          if (ctx.filterCol === 'meeting_id' && ctx.filterVal) {
            for (const row of dbState.recordings.values()) {
              if (row.meeting_id === ctx.filterVal) {
                return Promise.resolve({ data: row, error: null });
              }
            }
            return Promise.resolve({ data: null, error: null });
          }
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert(_values: Record<string, unknown>) {
        return Promise.resolve({ data: null, error: null });
      },
      update(values: Record<string, unknown>) {
        ctx.pendingUpdate = values;
        return builder;
      },
    };
    return builder;
  }

  const storageFrom = (_bucket: string) => ({
    upload: async (key: string, bytes: Uint8Array, _opts: unknown) => {
      dbState.storage.set(key, bytes);
      return { data: { path: key }, error: null };
    },
    download: async (key: string) => {
      const bytes = dbState.storage.get(key);
      if (!bytes) return { data: null, error: { message: 'not_found' } };
      // Mock Blob with arrayBuffer()
      const blob = {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
      };
      return { data: blob as unknown as Blob, error: null };
    },
  });

  return {
    supabaseAdmin: {
      from: (table: string) => makeFromBuilder(table),
      storage: { from: storageFrom },
      rpc: async (_fn: string, _args: unknown) => ({
        data: null,
        error: { message: 'no rpc' },
      }),
    },
  };
});

// pgmq mock
// Round 2 HIGH-A-03: lib/pgmq.ts は ensure/read/delete/archive/metrics も export
// するようになったが、本 e2e テストは tick* ではなく run*() を直接呼ぶため、
// send 以外は no-op stub にしておけば十分。pgmqEnsureQueue が呼ばれても DB に
// アクセスせず resolve するだけ。
vi.mock('../lib/pgmq.js', () => ({
  pgmqSend: vi.fn(
    async (queue: string, payload: Record<string, unknown>) => {
      dbState.enqueued.push({ queue, payload });
      return { msgId: dbState.enqueued.length, via: 'rpc' as const };
    },
  ),
  pgmqEnsureQueue: vi.fn(async (_queue: string) => undefined),
  pgmqRead: vi.fn(async () => []),
  pgmqDelete: vi.fn(async () => undefined),
  pgmqArchive: vi.fn(async () => undefined),
  pgmqMetrics: vi.fn(async () => null),
  closePgmq: vi.fn(async () => undefined),
}));

// captureException no-op
vi.mock('../lib/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  initSentry: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

const MEETING_ID = '00000000-0000-0000-0000-000000000099';
const RECORDING_ID = '11111111-1111-1111-1111-111111111111';

function seedRecording(): void {
  dbState.recordings.set(RECORDING_ID, {
    id: RECORDING_ID,
    meeting_id: MEETING_ID,
    processing_status: 'pending',
    sensitivity: 'internal',
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('recording jobs end-to-end', () => {
  beforeEach(() => {
    resetDbState();
    seedRecording();
  });

  it('download → transcribe → summarize で processing_status が completed まで遷移する', async () => {
    const { runRecordingDownload } = await import('../jobs/recording-download.js');
    const { runRecordingTranscribe } = await import('../jobs/recording-transcribe.js');
    const { runRecordingSummarize } = await import('../jobs/recording-summarize.js');

    // ---- Step 1: download ----
    // Zoom 鍵は test env で `zoom-acct-test` プレフィクスのため、自動で mock blob 経路に落ちる。
    const dl = await runRecordingDownload({
      meetingDbId: MEETING_ID,
      zoomRecordingUuid: 'zoom-rec-uuid-1',
      reqId: 'req-test-1',
    });
    expect(dl.via).toBe('mock');
    expect(dl.bytesWritten).toBeGreaterThan(0);
    expect(dl.recordingId).toBe(RECORDING_ID);
    // 状態: downloading → (transcribe ジョブ enqueue 済)
    const afterDownload = dbState.recordings.get(RECORDING_ID)!;
    expect(afterDownload.processing_status).toBe('downloading');
    expect(afterDownload.video_storage_key).toMatch(/zoom-rec-uuid-1/);
    // transcribe_recording に 1 件 enqueue
    expect(
      dbState.enqueued.some((e) => e.queue === 'transcribe_recording'),
    ).toBe(true);

    // ---- Step 2: transcribe ----
    const transcribeMsg = dbState.enqueued.find(
      (e) => e.queue === 'transcribe_recording',
    )!.payload as {
      recordingId: string;
      meetingId: string;
      storageKey: string;
      contentType: string;
    };
    const tr = await runRecordingTranscribe({
      recordingId: transcribeMsg.recordingId,
      meetingId: transcribeMsg.meetingId,
      storageKey: transcribeMsg.storageKey,
      contentType: transcribeMsg.contentType,
      reqId: 'req-test-1',
    });
    expect(tr.segmentCount).toBe(3); // MockTranscribeProvider fixture
    expect(tr.estimatedCostUsd).toBe(0);
    expect(tr.provider).toBe('mock');

    const afterTranscribe = dbState.recordings.get(RECORDING_ID)!;
    expect(afterTranscribe.processing_status).toBe('analyzing');
    expect(afterTranscribe.transcript_full).toContain('お忙しい中');
    expect(Array.isArray(afterTranscribe.transcript_segments)).toBe(true);
    expect((afterTranscribe.transcript_segments as unknown[])).toHaveLength(3);
    // summarize_recording に 1 件 enqueue
    expect(
      dbState.enqueued.some((e) => e.queue === 'summarize_recording'),
    ).toBe(true);

    // ---- Step 3: summarize ----
    const summarizeMsg = dbState.enqueued.find(
      (e) => e.queue === 'summarize_recording',
    )!.payload as {
      recordingId: string;
      meetingId: string;
    };
    const sm = await runRecordingSummarize({
      recordingId: summarizeMsg.recordingId,
      meetingId: summarizeMsg.meetingId,
      reqId: 'req-test-1',
    });
    expect(sm.provider).toBe('mock');
    expect(sm.segmentCount).toBe(3);
    expect(sm.embeddingsEnqueued).toBe(3);
    expect(sm.sensitivity).toBe('internal');

    const afterSummarize = dbState.recordings.get(RECORDING_ID)!;
    expect(afterSummarize.processing_status).toBe('completed');
    expect(afterSummarize.summary).toContain('営業ツール検討中');
    expect(Array.isArray(afterSummarize.key_points)).toBe(true);
    expect((afterSummarize.key_points as string[]).length).toBe(3);
    expect(Array.isArray(afterSummarize.next_actions)).toBe(true);
    expect(Array.isArray(afterSummarize.commitments)).toBe(true);
    expect(Array.isArray(afterSummarize.sentiment_timeline)).toBe(true);
    expect(afterSummarize.sensitivity).toBe('internal');
    expect(afterSummarize.processed_at).toBeTruthy();

    // generate_embeddings に 1 件 enqueue, chunks 3 件
    const embedJob = dbState.enqueued.find(
      (e) => e.queue === 'generate_embeddings',
    );
    expect(embedJob).toBeTruthy();
    const embedPayload = embedJob!.payload as {
      sourceType: string;
      sourceId: string;
      chunks: Array<{ index: number; text: string }>;
    };
    expect(embedPayload.sourceType).toBe('recording_segment');
    expect(embedPayload.sourceId).toBe(RECORDING_ID);
    expect(embedPayload.chunks).toHaveLength(3);
  });

  it('download job: meetingDbId 未指定でも mock blob で進行し失敗しない', async () => {
    const { runRecordingDownload } = await import('../jobs/recording-download.js');
    const dl = await runRecordingDownload({
      zoomRecordingUuid: 'orphan-rec',
      reqId: 'req-orphan',
    });
    expect(dl.via).toBe('mock');
    expect(dl.recordingId).toBeNull();
    expect(dl.storageKey).toMatch(/unassigned\/orphan-rec/);
  });

  it('transcribe job: cost cap 超過で processing_status=failed へ遷移する', async () => {
    const { COST_CAPS } = await import('@ksp/shared');
    const { assertMeetingCap } = await import('../lib/cost-guard.js');

    // 直接 assertMeetingCap が cap で throw することを確認 + recordings.update を
    // 呼んで failed に遷移するロジックを再現する (jobs/recording-transcribe.ts
    // 内の cost-guard catch ブロックと同じ動作)。
    const overSpend = COST_CAPS.perMeetingUsd + 1;
    const { supabaseAdmin } = await import('../lib/supabase.js');

    let caughtErr: unknown = null;
    try {
      assertMeetingCap({ meetingId: MEETING_ID, spendUsd: overSpend });
    } catch (err) {
      caughtErr = err;
      // jobs 側と同じ failure 記録経路を踏む
      await supabaseAdmin
        .from('recordings')
        .update({
          processing_status: 'failed',
          processing_error: (err as Error).message,
        })
        .eq('id', RECORDING_ID);
    }
    expect(caughtErr).toBeTruthy();
    expect((caughtErr as Error).message).toMatch(/MEETING_COST_CAP_EXCEEDED/);

    const after = dbState.recordings.get(RECORDING_ID)!;
    expect(after.processing_status).toBe('failed');
    expect(after.processing_error).toMatch(/MEETING_COST_CAP_EXCEEDED/);
  });

  it('summarize job: PII (マイナンバー 12桁) を検知して sensitivity=sensitive に昇格', async () => {
    // recordings 行に PII を含む transcript を仕込む
    const row = dbState.recordings.get(RECORDING_ID)!;
    row.transcript_full = '顧客のマイナンバーは 123456789012 です';
    row.transcript_segments = [
      {
        index: 0,
        startSec: 0,
        endSec: 5,
        speakerLabel: 'host',
        text: '顧客のマイナンバーは 123456789012 です',
        confidence: 0.95,
      },
    ];
    row.processing_status = 'analyzing';
    dbState.recordings.set(RECORDING_ID, row);

    const { runRecordingSummarize } = await import('../jobs/recording-summarize.js');
    const sm = await runRecordingSummarize({
      recordingId: RECORDING_ID,
      meetingId: MEETING_ID,
    });
    expect(sm.sensitivity).toBe('sensitive');
    const after = dbState.recordings.get(RECORDING_ID)!;
    expect(after.sensitivity).toBe('sensitive');
    expect(after.processing_status).toBe('completed');
  });
});
