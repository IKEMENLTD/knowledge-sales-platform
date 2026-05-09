import { supabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

/**
 * pgmq.send / pgmq.read / pgmq.delete のラッパ。
 *
 * 設計書 05_jobs_queues:
 *   - process_business_card / process_recording / generate_embeddings の3キュー
 *   - service_role でのみ enqueue 可能
 *
 * Supabase JS は `pgmq.send` をそのまま呼べないため、`exec_sql` 相当の汎用 RPC が
 * 用意されていない場合は `select pgmq.send($1, $2::jsonb)` を実行する RPC を
 * `pgmq_send_text(queue_name text, msg jsonb)` として packages/db 側に切り出す前提。
 *
 * P1 scaffold では migration 側 RPC が未整備なので、フォールバックとして
 * postgres-js (DATABASE_URL) で直接 SQL を発行する経路も用意する。
 *
 * NOTE(SRE/Architect): `recordings` upsert を ON CONFLICT DO NOTHING RETURNING で
 * 1行でも返ってきた場合のみ enqueue する (S-N-01: replay 防止) のは呼び出し側の責務。
 */

export type PgmqQueue =
  | 'process_business_card'
  | 'process_recording'
  | 'generate_embeddings';

interface PgmqSendOptions {
  /** 可視化遅延 (秒)。default 0。 */
  delaySeconds?: number;
}

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

  // 1) RPC 経路 (推奨): packages/db 側で
  //    create or replace function public.pgmq_send(p_queue text, p_payload jsonb, p_delay int default 0)
  //    returns bigint security definer ... が定義されていれば使う。
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

    // RPC 未定義 (PGRST202) の場合のみ SQL fallback。それ以外のエラーは throw。
    const code = (error as { code?: string }).code ?? '';
    if (code !== 'PGRST202' && !/Could not find the function/i.test(error.message ?? '')) {
      throw error;
    }
    log.warn({ err: error.message }, 'pgmq_send RPC missing, falling back to direct SQL');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'pgmq_send RPC threw, falling back');
  }

  // 2) SQL fallback (postgres-js 直結)
  // NOTE: 動的 import で循環参照を避ける + tests 環境で DATABASE_URL なしでも壊れない。
  try {
    const postgresMod = await import('postgres');
    const postgres = postgresMod.default;
    const url = process.env.DATABASE_URL;
    if (!url) {
      log.warn('DATABASE_URL not set, pgmq.send is a no-op (test/dev)');
      return { msgId: null, via: 'noop' };
    }
    const sql = postgres(url, { prepare: false, max: 2 });
    try {
      const rows = await sql<{ send: number }[]>`select pgmq.send(${queue}, ${JSON.stringify(payload)}::jsonb, ${options.delaySeconds ?? 0}) as send`;
      const first = rows[0];
      const msgId = first?.send ?? null;
      log.info({ msgId }, 'pgmq.send via direct sql ok');
      return { msgId, via: 'sql' };
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    log.error({ err: (err as Error).message }, 'pgmq.send failed both rpc and sql');
    throw err;
  }
}
