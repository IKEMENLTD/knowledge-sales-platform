import { env } from '@/lib/env';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * apps/web 側から pgmq queue へ enqueue するための helper。
 *
 * apps/worker/src/lib/pgmq.ts と同設計 (RPC `pgmq_send` → SQL fallback) だが、
 * web 側は Edge / Node どちらの runtime からも呼ばれるため fallback は省略し
 * RPC 経路のみで動く前提とする。`pgmq_send(p_queue text, p_payload jsonb, p_delay int)`
 * RPC は packages/db 0013 で導入済。
 *
 * service_role キーは env.ts には載っていない (security/round1 で web の env から
 * 除去された)。worker と web で共有する pgmq enqueue だけは、Render の secret から
 * `SUPABASE_SERVICE_ROLE_KEY` を直接読み出して使用する。`createServerClient()` 経由の
 * anon client では pgmq.send が呼べないため。
 *
 * 設計判断: service_role admin client は module-level singleton にすると Next.js HMR で
 * 古いインスタンスが残るリスクがあるため、リクエスト毎に new する。コストは無視できる
 * ほど小さい (内部は単なる fetch wrapper)。
 */

export type WebPgmqQueue = 'process_business_card' | 'process_recording' | 'generate_embeddings';

interface WebPgmqSendOptions {
  delaySeconds?: number;
}

let cachedAdmin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for pgmq enqueue');
  }
  cachedAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

/**
 * pgmq.send wrapper (web 用)。
 *
 * @returns msgId が取れれば number、RPC 不在等で取れなかった場合は null
 * @throws RPC が PGRST202 以外で失敗した場合
 */
export async function pgmqSendWeb<TPayload extends Record<string, unknown>>(
  queue: WebPgmqQueue,
  payload: TPayload,
  options: WebPgmqSendOptions = {},
): Promise<{ msgId: number | null }> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('pgmq_send', {
    p_queue: queue,
    p_payload: payload as unknown as Record<string, unknown>,
    p_delay: options.delaySeconds ?? 0,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    const msg = error.message ?? '';
    // RPC 未定義時は noop で返す (Phase1 初期 migration 未適用環境)
    if (code === 'PGRST202' || /Could not find the function/i.test(msg)) {
      return { msgId: null };
    }
    throw new Error(`pgmq_send failed: ${msg}`);
  }

  const msgId = typeof data === 'number' ? data : null;
  return { msgId };
}
