import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { getShareAdminClient } from '@/lib/share-links/admin';
import { hashShortCode, verifyPassword } from '@/lib/share-links/token';
import { STORAGE_BUCKETS, type SharePublicResolveResponse } from '@ksp/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * /api/share-links/[code] — 公開検証 GET (anon 可) + 失効 DELETE (認証必須)。
 *
 * `[code]` は文脈で 2 種類を受け付ける:
 *   - 7 文字 short_code  → GET 公開検証 (token sha256 比較 → signed URL 発行)
 *   - 36 文字 UUID      → DELETE 失効 (revoked_at=now())
 *
 * 公開アクセスは middleware の PUBLIC_PREFIXES `/api/share-links/` で auth ガード解除済。
 * POST /api/share-links (作成) は別ファイル (route.ts) で認証必須のまま。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const shortCodeSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{7}$/) });
const uuidSchema = z.object({ code: z.string().uuid() });

interface RouteCtx {
  params: Promise<{ code: string }>;
}

interface ShareLinkRow {
  id: string;
  org_id: string;
  resource_id: string;
  expires_at: string;
  password_hash: string | null;
  start_sec: number | null;
  end_sec: number | null;
  view_count_cap: number | null;
  click_count: number | null;
  revoked_at: string | null;
  created_by: string | null;
}

interface RecordingRow {
  id: string;
  video_storage_key: string | null;
  video_storage_url: string | null;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'restricted';
  video_duration_seconds: number | null;
}

const SIGNED_URL_TTL_SEC = 3600; // 1 時間

function gone(reason: string, hint?: string): NextResponse {
  return NextResponse.json(
    { error: 'gone', code: reason, message: hint ?? null },
    { status: 410 },
  );
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? req.headers.get('cf-connecting-ip');
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const params = await ctx.params;
  const parsed = shortCodeSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_code', code: 'invalid_code' },
      { status: 400 },
    );
  }
  const code = parsed.data.code;
  const password = req.nextUrl.searchParams.get('p');

  let admin: ReturnType<typeof getShareAdminClient>;
  try {
    admin = getShareAdminClient();
  } catch (err) {
    console.error('[share-links GET] admin init failed', err);
    return NextResponse.json(
      { error: 'service_unavailable', code: 'service_unavailable' },
      { status: 503 },
    );
  }

  const tokenSha = await hashShortCode(code);

  const { data: linkRaw, error: linkErr } = await admin
    .from('share_links')
    .select(
      'id,org_id,resource_id,expires_at,password_hash,start_sec,end_sec,view_count_cap,click_count,revoked_at,created_by',
    )
    .eq('token_sha256', tokenSha)
    .eq('resource_type', 'recording_clip')
    .maybeSingle();
  if (linkErr) {
    console.error('[share-links GET] lookup failed', linkErr);
    return NextResponse.json(
      { error: 'lookup_failed', code: 'lookup_failed' },
      { status: 500 },
    );
  }
  const link = linkRaw as ShareLinkRow | null;
  if (!link) {
    return NextResponse.json(
      { error: 'not_found', code: 'not_found' },
      { status: 404 },
    );
  }

  if (link.revoked_at) return gone('revoked', 'link revoked');
  if (new Date(link.expires_at).getTime() <= Date.now()) return gone('expired');
  if (
    link.view_count_cap !== null &&
    (link.click_count ?? 0) >= link.view_count_cap
  ) {
    return gone('view_count_exceeded');
  }

  if (link.password_hash) {
    if (!password) {
      return NextResponse.json(
        {
          error: 'password_required',
          code: 'password_required',
          message: 'password parameter (?p=) required',
        },
        { status: 401 },
      );
    }
    const okPw = await verifyPassword(password, link.password_hash);
    if (!okPw) {
      return NextResponse.json(
        { error: 'password_invalid', code: 'password_invalid' },
        { status: 401 },
      );
    }
  }

  const { data: recRaw, error: recErr } = await admin
    .from('recordings')
    .select('id,video_storage_key,video_storage_url,sensitivity,video_duration_seconds')
    .eq('id', link.resource_id)
    .maybeSingle();
  if (recErr) {
    console.error('[share-links GET] recording lookup failed', recErr);
    return NextResponse.json(
      { error: 'lookup_failed', code: 'lookup_failed' },
      { status: 500 },
    );
  }
  const rec = recRaw as RecordingRow | null;
  if (!rec) {
    return gone('recording_deleted');
  }
  if (rec.sensitivity === 'restricted') {
    return NextResponse.json(
      { error: 'forbidden', code: 'sensitivity_restricted' },
      { status: 403 },
    );
  }

  let videoUrl: string | null = null;
  const videoExpiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
  if (rec.video_storage_key) {
    try {
      const { data, error } = await admin.storage
        .from(STORAGE_BUCKETS.recordings)
        .createSignedUrl(rec.video_storage_key, SIGNED_URL_TTL_SEC);
      if (!error && data?.signedUrl) {
        videoUrl = data.signedUrl;
      }
    } catch (err) {
      console.error('[share-links GET] signed url failed', err);
    }
  }
  if (!videoUrl) {
    videoUrl = rec.video_storage_url;
  }
  if (!videoUrl) {
    return gone('video_unavailable');
  }

  try {
    await admin
      .from('share_links')
      .update({
        click_count: (link.click_count ?? 0) + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', link.id);
  } catch (err) {
    console.error('[share-links GET] click increment failed', err);
  }

  try {
    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent');
    const payload: Record<string, unknown> = {
      share_link_id: link.id,
      recording_id: link.resource_id,
      view_count: (link.click_count ?? 0) + 1,
      start_sec: link.start_sec,
      end_sec: link.end_sec,
    };
    await admin.from('audit_logs').insert({
      org_id: link.org_id,
      actor_user_id: link.created_by,
      action: 'share_view',
      resource_type: 'share_link',
      resource_id: link.id,
      payload,
      ip_address: ip,
      user_agent: ua,
      row_hash: 'pending',
    });
  } catch (err) {
    console.error('[share-links GET] audit insert failed', err);
  }

  const startSec = link.start_sec ?? 0;
  const endSec = link.end_sec ?? rec.video_duration_seconds ?? startSec + 60;

  const response: SharePublicResolveResponse = {
    videoUrl,
    startSec,
    endSec,
    expiresAt: link.expires_at,
    videoExpiresAt,
    audience: null,
  };
  return NextResponse.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// DELETE — 共有リンク失効 (uuid 受け取り、認証必須)
// ---------------------------------------------------------------------------

interface ShareLinkRevokeRow {
  id: string;
  revoked_at: string | null;
}

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const params = await ctx.params;
  const parsed = uuidSchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_id', 'share-link id must be uuid');
  }
  const id = parsed.data.code;

  const handler = defineRoute({}, async ({ supabase }) => {
    const { data: existingRaw, error: lookupErr } = await supabase
      .from('share_links')
      .select('id,revoked_at')
      .eq('id', id)
      .maybeSingle();
    if (lookupErr) {
      return errorResponse(500, 'share_link_lookup_failed', lookupErr.message);
    }
    const existing = existingRaw as ShareLinkRevokeRow | null;
    if (!existing) {
      return errorResponse(404, 'share_link_not_found');
    }
    if (existing.revoked_at) {
      return ok({ id, revoked: true, alreadyRevoked: true });
    }
    const { error: updateErr } = await supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (updateErr) {
      return errorResponse(500, 'share_link_revoke_failed', updateErr.message);
    }
    return ok({ id, revoked: true, alreadyRevoked: false });
  });

  return handler(req);
}
