import { env } from '@/lib/env';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * 公開 (anon) からアクセスされる /share/[code] と /api/share-links/[code] 経路で使う
 * service_role クライアント。share_links テーブルは anon に SELECT 不可なので、
 * token sha256 比較は service_role 経由でしか実行できない。
 *
 *  - module-level singleton にすると Next.js HMR で古いインスタンスが残るリスクがあるが、
 *    認証情報は安定なのでキャッシュする。
 *  - SUPABASE_SERVICE_ROLE_KEY が無い環境 (誤設定) では throw して 503 相当を返す。
 */

let cached: SupabaseClient | null = null;

export function getShareAdminClient(): SupabaseClient {
  if (cached) return cached;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for share-link verification');
  }
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
