import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Storage `business-cards` バケットへの署名付きアップロード URL を発行する。
 *
 * 設計:
 *   - 0035 で `business-cards` バケット + RLS (auth.uid() = path 先頭セグメント) が
 *     作られている前提。signed upload URL 経由なら RLS は server 側鍵で発行された
 *     token に委譲され、クライアントは Authorization なしで PUT できる。
 *   - TTL 5 分 (300 秒)。Supabase JS の `createSignedUploadUrl` は内部的に
 *     1 回限り token を発行する。
 *   - SHA-256 hex を path に埋め込まない理由: ハッシュは衝突確率は無視できるが、
 *     同一画像の再アップロード時に key conflict で 409 を起こすため、UUID v4 を
 *     使う (caller 側で生成して渡す)。SHA-256 は contacts.business_card_image_hash
 *     列で重複検知する。
 *
 * @param contentType - 検証は呼び出し側で済んでいる前提 (zod)。ここでは渡された
 *   値をそのまま signed URL の `Content-Type` 制約として扱う。
 */
export interface SignedUploadUrl {
  uploadUrl: string;
  uploadToken: string;
  storageKey: string;
  expiresAt: string;
}

export async function createBusinessCardSignedUploadUrl(
  supabase: SupabaseClient,
  key: string,
  _contentType: string,
  _sha256: string,
): Promise<SignedUploadUrl> {
  const { data, error } = await supabase.storage.from('business-cards').createSignedUploadUrl(key);

  if (error || !data) {
    throw new Error(`createSignedUploadUrl failed: ${error?.message ?? 'unknown error'}`);
  }

  // Supabase JS の戻り値は { signedUrl, token, path } 形式。
  // TTL は Supabase Storage 側で固定 (デフォルト 2 時間) だが、API の契約上
  // クライアントには「5 分以内に PUT してください」と提示するため expiresAt を 5 分先に。
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    uploadUrl: data.signedUrl,
    uploadToken: data.token,
    storageKey: data.path ?? key,
    expiresAt,
  };
}
