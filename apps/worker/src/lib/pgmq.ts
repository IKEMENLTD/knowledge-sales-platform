import type { Sql } from 'postgres';
import { logger } from './logger.js';
import { supabaseAdmin } from './supabase.js';

/**
 * pgmq.send / pgmq.read / pgmq.delete / pgmq.archive / pgmq.create のラッパ。
 *
 * Round 2 Architect HIGH-A-03:
 *   旧実装は `send` のみが lib に閉じており、`read` / `delete` は ocr.ts と embed.ts
 *   と recording-*.ts がそれぞれインライン (毎 tick で `postgres()` を new + close)
 *   していたため接続が暴走していた。本ファイルで singleton client を保持し、
 *   全 consumer から共通利用させる。
 *
 *   - getSql(): module-scoped postgres client (max=10, prepare=false)。
 *     `DATABASE_URL` 不在環境では throw する。
 *   - process 'beforeExit' で `sql.end({ timeout: 5 })` 呼出。
 *   - test (`NODE_ENV=test`) では `getSql()` を呼ばないルートで mock される。
 *
 * 設計書 05_jobs_queues:
 *   - process_business_card / process_recording / generate_embeddings の3キュー
 *   - 加えて recording 系で transcribe_recording / summarize_recording も使う
 *   - service_role でのみ enqueue 可能
 */

export type PgmqQueue =
  | 'process_business_card'
  | 'process_recording'
  | 'generate_embeddings'
  | 'transcribe_recording'
  | 'summarize_recording';

interface PgmqSendOptions {
  /** 可視化遅延 (秒)。default 0。 */
  delaySeconds?: number;
}

export interface PgmqRow<TPayload = Record<string, unknown>> {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: TPayload;
}

// ---------------------------------------------------------------------------
// Singleton postgres-js client
// ---------------------------------------------------------------------------

let _sql: Sql | null = null;
let _shutdownRegistered = false;

/**
 * Lazy singleton。DATABASE_URL 不在で throw する (caller が catch して no-op 判定)。
 *
 * NOTE: 同期 import で `postgres` を読み込むと test 環境の env.parse タイミングで
 * 問題になることがあるため、ここで動的 import + cache する。
 */
async function getSql(): Promise<Sql> {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error('pgmq: DATABASE_URL is not set');
  }
  if (_sql) return _sql;
  const postgresMod = await import('postgres');
  const postgres = postgresMod.default;
  _sql = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  if (!_shutdownRegistered) {
    _shutdownRegistered = true;
    const drain = (): void => {
      const sql = _sql;
      _sql = null;
      if (sql) {
        sql.end({ timeout: 5 }).catch(() => undefined);
      }
    };
    // beforeExit は process.exit() より前に発火。SIGTERM 経路は index.ts 側で
    // closePgmq() を明示 await する。
    process.once('beforeExit', drain);
  }
  return _sql;
}

/**
 * Graceful shutdown から呼ぶ。in-flight クエリの完了を最大 5 秒待ってから
 * 接続を閉じる。冪等。
 */
export async function closePgmq(): Promise<void> {
  const sql = _sql;
  _sql = null;
  if (!sql) return;
  try {
    await sql.end({ timeout: 5 });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'pgmq.close failed');
  }
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

const _ensuredQueues = new Set<string>();

/**
 * `pgmq.create(queue)` を 1 度だけ呼ぶ。冪等。
 * RPC `pgmq_create(p_queue text)` があればそちら、無ければ direct SQL fallback。
 */
export async function pgmqEnsureQueue(queue: string): Promise<void> {
  if (_ensuredQueues.has(queue)) return;
  const log = logger.child({ queue, op: 'pgmq.ensureQueue' });

  // 1) RPC 経路
  try {
    const { error } = await supabaseAdmin.rpc('pgmq_create', { p_queue: queue });
    if (!error) {
      _ensuredQueues.add(queue);
      return;
    }
    const code = (error as { code?: string }).code ?? '';
    if (code !== 'PGRST202' && !/Could not find the function/i.test(error.message ?? '')) {
      log.debug({ err: error.message }, 'pgmq_create RPC errored (non-missing); SQL fallback');
    }
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'pgmq_create RPC threw; SQL fallback');
  }

  // 2) Direct SQL
  try {
    const sql = await getSql();
    await sql`select pgmq.create(${queue})`.catch(() => null);
    _ensuredQueues.add(queue);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'pgmq.create failed (will retry on next call)');
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Supabase RPC `pgmq_send` を service_role 経由で呼ぶ。
 * `pgmq_send` RPC が DB に存在しない場合は postgres-js fallback で
 * `select pgmq.send($1, $2::jsonb)` を直接発行する。
 */
export async function pgmqSend<TPayload extends Record<string, unknown>>(
  queue: PgmqQueue,
  payload: TPayload,
  options: PgmqSendOptions = {},
): Promise<{ msgId: number | null; via: 'rpc' | 'sql' | 'noop' }> {
  const log = logger.child({ queue, op: 'pgmq.send' });

  // 1) RPC 経路
  try {
    const { data, error } = await supabaseAdmin.rpc('pgmq_send', {
      p_queue: queue,
      p_payload: payload as unknown as Record<string, unknown>,
      p_delay: options.delaySeconds ?? 0,
    });
    if (!error) {
      const msgId = typeof data === 'number' ? data : null;
      log.debug({ msgId }, 'pgmq.send via rpc ok');
      return { msgId, via: 'rpc' };
    }

    const code = (error as { code?: string }).code ?? '';
    if (code !== 'PGRST202' && !/Could not find the function/i.test(error.message ?? '')) {
      throw error;
    }
    log.warn({ err: error.message }, 'pgmq_send RPC missing, falling back to direct SQL');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'pgmq_send RPC threw, falling back');
  }

  // 2) SQL fallback
  try {
    const sql = await getSql();
    const rows = await sql<{ send: number }[]>`
      select pgmq.send(${queue}, ${JSON.stringify(payload)}::jsonb, ${options.delaySeconds ?? 0}) as send
    `;
    const first = rows[0];
    const msgId = first?.send ?? null;
    log.info({ msgId }, 'pgmq.send via direct sql ok');
    return { msgId, via: 'sql' };
  } catch (err) {
    if ((err as Error).message?.includes('DATABASE_URL is not set')) {
      log.warn('DATABASE_URL not set, pgmq.send is a no-op (test/dev)');
      return { msgId: null, via: 'noop' };
    }
    log.error({ err: (err as Error).message }, 'pgmq.send failed both rpc and sql');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Read / Delete / Archive (consumer-side)
// ---------------------------------------------------------------------------

interface PgmqReadOptions {
  /** 可視化タイムアウト (秒)。default 30。 */
  visibilityTimeoutSeconds?: number;
  /** 1 回の read で取り出すメッセージ数。default 10。 */
  batch?: number;
}

/**
 * `select * from pgmq.read(queue, vt, qty)`. 接続は singleton を使い回す。
 *
 * DATABASE_URL 不在 (test/dev) では空配列を返す。
 * pgmq extension / queue 不在は warn debug にしつつ空配列を返す (CI を壊さない)。
 */
export async function pgmqRead<TPayload = unknown>(
  queue: string,
  options: PgmqReadOptions = {},
): Promise<PgmqRow<TPayload>[]> {
  const visibility = options.visibilityTimeoutSeconds ?? 30;
  const batch = options.batch ?? 10;
  const log = logger.child({ queue, op: 'pgmq.read' });

  let sql: Sql;
  try {
    sql = await getSql();
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'getSql failed; returning empty batch');
    return [];
  }

  try {
    const rows = await sql<PgmqRow<TPayload>[]>`
      select msg_id, read_ct, enqueued_at, vt, message
      from pgmq.read(${queue}, ${visibility}, ${batch})
    `;
    return Array.from(rows);
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'pgmq.read errored; treating as empty');
    return [];
  }
}

/**
 * `select pgmq.delete(queue, msg_id)`. 成功 = ack。冪等 (既に消えていても error にならない)。
 */
export async function pgmqDelete(queue: string, msgId: number): Promise<void> {
  const log = logger.child({ queue, op: 'pgmq.delete', msgId });
  let sql: Sql;
  try {
    sql = await getSql();
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'getSql failed; pgmq.delete no-op');
    return;
  }
  try {
    await sql`select pgmq.delete(${queue}, ${msgId})`;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'pgmq.delete failed');
  }
}

/**
 * `select pgmq.archive(queue, msg_id)`. dead-letter 用 (DLQ 相当)。冪等。
 */
export async function pgmqArchive(queue: string, msgId: number): Promise<void> {
  const log = logger.child({ queue, op: 'pgmq.archive', msgId });
  let sql: Sql;
  try {
    sql = await getSql();
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'getSql failed; pgmq.archive no-op');
    return;
  }
  try {
    await sql`select pgmq.archive(${queue}, ${msgId})`;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'pgmq.archive failed');
  }
}

/**
 * `select * from pgmq.metrics(queue)`. queue depth (visible + total) を返す。
 * pgmq extension に metrics 関数が無い古い環境では null を返す (caller は skip)。
 */
export interface PgmqMetrics {
  queueLength: number;
  newestMsgAgeSec: number | null;
  oldestMsgAgeSec: number | null;
  totalMessages: number;
}

export async function pgmqMetrics(queue: string): Promise<PgmqMetrics | null> {
  const log = logger.child({ queue, op: 'pgmq.metrics' });
  let sql: Sql;
  try {
    sql = await getSql();
  } catch {
    return null;
  }
  try {
    const rows = await sql<
      Array<{
        queue_length: number | string;
        newest_msg_age_sec: number | null;
        oldest_msg_age_sec: number | null;
        total_messages: number | string;
      }>
    >`select queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages
      from pgmq.metrics(${queue})`;
    const r = rows[0];
    if (!r) return null;
    return {
      queueLength: Number(r.queue_length ?? 0),
      newestMsgAgeSec: r.newest_msg_age_sec ?? null,
      oldestMsgAgeSec: r.oldest_msg_age_sec ?? null,
      totalMessages: Number(r.total_messages ?? 0),
    };
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'pgmq.metrics failed (extension may be too old)');
    return null;
  }
}
