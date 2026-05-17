import { randomUUID } from 'node:crypto';
import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { createBusinessCardSignedUploadUrl } from '@/lib/api/storage';
import {
  type BusinessCardUploadResponse,
  businessCardUploadRequestSchema,
  businessCardUploadResponseSchema,
} from '@ksp/shared';

/**
 * POST /api/contacts/upload-url
 *
 * 名刺画像を Supabase Storage (`business-cards` バケット) に直接アップロードするための
 * signed URL を発行する。クライアントは返却された `uploadUrl` に対して PUT で生バイナリを
 * 送る (Supabase JS の `uploadToSignedUrl` も同等)。
 *
 * 設計:
 *   - storage_key は `{userId}/{uuidv4}.{ext}` 形式。0035 の bucket RLS が
 *     "path 先頭セグメント = auth.uid()" を要求する想定。
 *   - 同一 contentSha256 を持つ contact が既存なら `duplicateOf` に返してクライアントに
 *     警告させる。ただしアップロード自体はブロックしない (撮影し直しを許可するため)。
 *   - rate limit: 30 req/min (= バースト 30, refill 0.5/sec)。spam upload 防止。
 *   - Idempotency-Key 必須 (defineRoute 既定)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const POST = defineRoute(
  {
    body: businessCardUploadRequestSchema,
    rateLimit: { capacity: 30, refillPerSecond: 0.5 },
  },
  async ({ user, supabase, body }) => {
    const ext = EXTENSION_BY_CONTENT_TYPE[body.contentType] ?? 'bin';
    const objectId = randomUUID();
    const storageKey = `${user.id}/${objectId}.${ext}`;

    // 既存 hash の重複チェック (RLS を通すため anon client 経由)。
    // Round 4 P1 CTO MID: dedup を user.orgId スコープに限定 (Phase2 マルチテナント整合)
    let duplicateOf: string | null = null;
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_card_image_hash', body.contentSha256)
        .eq('org_id', user.orgId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (data && typeof (data as { id?: string }).id === 'string') {
        duplicateOf = (data as { id: string }).id;
      }
    } catch {
      // hash 列がまだ無い (migration 未適用) 環境では duplicateOf=null で続行。
    }

    let signed: Awaited<ReturnType<typeof createBusinessCardSignedUploadUrl>>;
    try {
      signed = await createBusinessCardSignedUploadUrl(
        supabase,
        storageKey,
        body.contentType,
        body.contentSha256,
      );
    } catch (err) {
      return errorResponse(502, 'storage_signed_url_failed', (err as Error).message);
    }

    const response: BusinessCardUploadResponse = {
      storageKey: signed.storageKey,
      uploadUrl: signed.uploadUrl,
      uploadToken: signed.uploadToken,
      duplicateOf,
      expiresAt: signed.expiresAt,
    };

    // shape を type-check (Response schema 不一致を early-fail させる)。
    const parsed = businessCardUploadResponseSchema.safeParse(response);
    if (!parsed.success) {
      return errorResponse(
        500,
        'response_shape_mismatch',
        'internal_server_error',
        parsed.error.flatten(),
      );
    }

    return ok(parsed.data);
  },
);
