import { env } from '@/lib/env';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * Supabase service_role admin client (web 限定の最小ユース用)。
 *
 * 用途:
 *   - auth.admin.inviteUserByEmail() のような auth admin API の呼び出し
 *   - public.users への管理者操作 (role 変更 / suspend) で
 *     `protect_profiles_sensitive` trigger を bypass する必要があるとき。
 *
 * 安全策 (Round1 cross-cutting G-P0-6):
 *   - service_role を使う route は必ず別途 anon client で role gate を済ませてから
 *     呼ぶこと (auth.uid()=NULL trap 回避)。
 *   - 本 module を import している箇所を grep で簡単に追跡できるよう、ファイル名は
 *     `admin.ts` で固定し、worker 側 `apps/worker/src/lib/supabase.ts` とは別物にする。
 *
 * Env 要件:
 *   - SUPABASE_SERVICE_ROLE_KEY (web の env.ts schema には未登録の為 process.env から
 *     直接読む。invite/role change 機能を使わない環境では env 未設定でも import 単体は
 *     失敗させない — 関数呼び出し時に throw する)。
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for admin operations (invite/role change).',
    );
  }
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
