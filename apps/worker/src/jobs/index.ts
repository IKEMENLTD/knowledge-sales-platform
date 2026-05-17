import { logger } from '../lib/logger.js';
import { pgmqMetrics } from '../lib/pgmq.js';
import { pgmqQueueDepth } from '../lib/metrics.js';
import { tickEmbed } from './embed.js';
import { tickOcr } from './ocr.js';
import { tickRecordingDownload } from './recording-download.js';
import { tickRecordingSummarize } from './recording-summarize.js';
import { tickRecordingTranscribe } from './recording-transcribe.js';

/**
 * Worker job ticker (Phase2B T-009 + Round 2 CTO HIGH-C-03)。
 *
 * pgmq の各キューを定期的に poll する。Round 1 では tickOcr() しか呼んでおらず、
 * 録画パイプライン (download / transcribe / summarize) と embedding consumer は
 * 完全に未起動だった。本 Round 2 で全 consumer を並列起動する。
 *
 * 呼び出しは apps/worker/src/index.ts の `serve()` 直前から:
 *   import { startJobTickers } from './jobs/index.js';
 *   startJobTickers();
 *
 * NOTE: マルチインスタンス時は pgmq 自体の visibility timeout で重複処理は防げるが、
 *       in-process では 1 tick あたりの inFlight フラグで多重起動を抑止する。
 *       詳細は各 tick の `inFlight*Tick` を参照。
 */

const DEFAULT_INTERVAL_MS = 5_000;

/** 個別 tick の戻り値型。 */
export interface TickReport {
  ok: boolean;
  name: string;
  processed: number;
  acked: number;
  failed: number;
  durationMs: number;
}

/** 各 ticker の対 (関数 + 名前 + 対応キュー名)。 */
interface TickEntry {
  name: string;
  queue: string;
  fn: () => Promise<{ processed: number; acked: number; failed: number }>;
}

const TICK_ENTRIES: TickEntry[] = [
  { name: 'ocr', queue: 'process_business_card', fn: tickOcr },
  {
    name: 'recording.download',
    queue: 'process_recording',
    fn: tickRecordingDownload,
  },
  {
    name: 'recording.transcribe',
    queue: 'transcribe_recording',
    fn: tickRecordingTranscribe,
  },
  {
    name: 'recording.summarize',
    queue: 'summarize_recording',
    fn: tickRecordingSummarize,
  },
  { name: 'embed', queue: 'generate_embeddings', fn: tickEmbed },
];

/**
 * 全 queue の depth を pgmq.metrics で観測して pgmqQueueDepth ゲージに書き込む。
 * pgmq.metrics 関数が無い古い環境では何もしない (caller は skip)。
 *
 * Round 2 SRE P1-SRE-02: 旧実装ではこの metric は定義のみで未配線だった。
 */
async function refreshQueueDepth(): Promise<void> {
  await Promise.allSettled(
    TICK_ENTRIES.map(async (entry) => {
      try {
        const m = await pgmqMetrics(entry.queue);
        if (m) {
          pgmqQueueDepth.set({ queue: entry.queue }, m.queueLength);
        }
      } catch {
        // ignore — pgmq.metrics が無い環境では設計上 noop
      }
    }),
  );
}

/**
 * すべての job tick を 1 回ずつ並列で走らせる。失敗は throw せず TickReport[] に詰める。
 *
 * Round 2 CTO HIGH-C-03 fix: 旧実装は tickOcr() のみ呼んでいた。本実装で
 * 録画 3 段と embed を並列起動する。tick 自体は短時間で完了する想定。
 */
export async function tickAll(): Promise<TickReport[]> {
  const log = logger.child({ op: 'tickAll' });

  // metric: queue depth (best-effort — pgmq.metrics が無くても tick は走る)
  refreshQueueDepth().catch((err) => {
    log.debug({ err: (err as Error).message }, 'refreshQueueDepth failed');
  });

  const results = await Promise.allSettled(
    TICK_ENTRIES.map(async (entry): Promise<TickReport> => {
      const start = Date.now();
      try {
        const r = await entry.fn();
        return {
          ok: true,
          name: entry.name,
          processed: r.processed,
          acked: r.acked,
          failed: r.failed,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        log.warn(
          { err: (err as Error).message, tick: entry.name },
          'tick threw (continuing other consumers)',
        );
        return {
          ok: false,
          name: entry.name,
          processed: 0,
          acked: 0,
          failed: 0,
          durationMs: Date.now() - start,
        };
      }
    }),
  );

  const reports: TickReport[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      reports.push(r.value);
    } else {
      reports.push({
        ok: false,
        name: 'unknown',
        processed: 0,
        acked: 0,
        failed: 0,
        durationMs: 0,
      });
    }
  }
  return reports;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let currentTickPromise: Promise<unknown> | null = null;

/**
 * setInterval で tickAll を回し始める。テスト用に停止できるよう handle を保持する。
 *
 * NOTE: NODE_ENV=test では何もしない。テストは `tickOcr` 等を直接呼ぶ。
 */
export function startJobTickers(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (process.env.NODE_ENV === 'test') return;
  if (intervalHandle !== null) return;
  const log = logger.child({ op: 'startJobTickers' });
  log.info(
    { intervalMs, queues: TICK_ENTRIES.map((e) => e.queue) },
    'job tickers started (all consumers wired)',
  );
  intervalHandle = setInterval(() => {
    const p = tickAll().catch((err) => {
      log.warn({ err: (err as Error).message }, 'tickAll unhandled error');
    });
    currentTickPromise = p;
    p.finally(() => {
      if (currentTickPromise === p) currentTickPromise = null;
    });
  }, intervalMs);
  // ノードが exit 待ちにならないよう unref
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/**
 * テスト / graceful shutdown 用。in-flight tick が走っていれば完了まで最大
 * `awaitMs` ミリ秒待つ。
 */
export async function stopJobTickers(awaitMs = 15_000): Promise<void> {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (currentTickPromise) {
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, awaitMs));
    await Promise.race([currentTickPromise.then(() => undefined), timeout]);
    currentTickPromise = null;
  }
}
