import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { env } from '@/lib/env';
import { hashPassword, hashShortCode, generateShortCode } from '@/lib/share-links/token';
import { type ShareLinkResponse, shareLinkCreateRequest, shareLinkResponse } from '@ksp/shared';

/**
 * POST /api/share-links — 録画クリップ共有リンク作成 (SC-46 / GAP-R-P0-01)。
 *
 * 認可:
 *   - role: 'sales' 以上 (cs / sales / manager / admin / legal どれでも可)。
 *   - 録画 owner (meeting.owner_user_id) または manager+ のみが共有可能。
 *     RLS は share_links_insert_creator (0022) が `created_by=auth.uid()` を強制するため、
 *     ハンドラ側では「対象 recording を SELECT できる = sensitivity RLS 通過」を「閲覧可能」
 *     と解釈し、加えて owner / manager+ かを meeting から照合する。
 *
 * URL 仕様:
 *   - URL に乗る token は 7 文字 (base64url charset)。DB には sha256(token) のみ保存。
 *   - パスワード保護はサーバ側 SHA-256 (web crypto) → base64 で保存。
 *     argon2id 移行は Phase2 で別 issue。
 *
 * Idempotency:
 *   - 同 Idempotency-Key が来たら同じ short_code を返す (defineRoute の dedup に乗る)。
 *   - 同 recording で同 start/end/expiresInDays が偶然衝突しても、token は乱数なので新規発行。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RecordingOwnerRow {
  id: string;
  meeting_id: string;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'restricted';
  video_duration_seconds: number | null;
}

interface MeetingOwnerRow {
  id: string;
  owner_user_id: string;
}

interface ShareLinkInsertRow {
  id: string;
}

export const POST = defineRoute(
  { body: shareLinkCreateRequest },
  async ({ user, supabase, body }) => {
    // 1) 対象録画を引いて、ユーザが共有可能か検証
    const { data: recRaw, error: recError } = await supabase
      .from('recordings')
      .select('id,meeting_id,sensitivity,video_duration_seconds')
      .eq('id', body.recordingId)
      .maybeSingle();
    if (recError) {
      return errorResponse(500, 'recording_lookup_failed', recError.message);
    }
    const rec = recRaw as RecordingOwnerRow | null;
    if (!rec) {
      // RLS で見えない場合も 404 扱い (権限漏洩を防ぐ)
      return errorResponse(404, 'recording_not_found');
    }

    // 2) duration を超える endSec は拒否 (duration 未取得時は警告だけ)
    if (
      rec.video_duration_seconds !== null &&
      rec.video_duration_seconds > 0 &&
      body.endSec > rec.video_duration_seconds
    ) {
      return errorResponse(400, 'end_sec_out_of_range', 'endSec exceeds video duration', {
        durationSec: rec.video_duration_seconds,
      });
    }

    // 3) owner / manager+ 制限
    const { data: meetingRaw, error: meetingError } = await supabase
      .from('meetings')
      .select('id,owner_user_id')
      .eq('id', rec.meeting_id)
      .maybeSingle();
    if (meetingError) {
      return errorResponse(500, 'meeting_lookup_failed', meetingError.message);
    }
    const meeting = meetingRaw as MeetingOwnerRow | null;
    if (!meeting) {
      return errorResponse(404, 'meeting_not_found');
    }
    const isPrivileged =
      user.role === 'manager' || user.role === 'admin' || user.role === 'legal';
    if (!isPrivileged && meeting.owner_user_id !== user.id) {
      return errorResponse(403, 'forbidden', 'only recording owner or manager+ can share');
    }

    // 4) restricted は admin / legal のみ共有可
    if (rec.sensitivity === 'restricted' && !(user.role === 'admin' || user.role === 'legal')) {
      return errorResponse(403, 'forbidden_restricted', 'restricted recordings need admin/legal');
    }

    // 5) token 生成 (collision retry up to 5 回)
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 3600 * 1000).toISOString();
    const passwordHash = body.password ? await hashPassword(body.password) : null;
    let inserted: ShareLinkInsertRow | null = null;
    let shortCode = '';
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      shortCode = generateShortCode();
      const tokenSha = await hashShortCode(shortCode);
      const insertPayload: Record<string, unknown> = {
        resource_type: 'recording_clip',
        resource_id: body.recordingId,
        token_sha256: tokenSha,
        expires_at: expiresAt,
        password_hash: passwordHash,
        created_by: user.id,
        start_sec: body.startSec,
        end_sec: body.endSec,
        view_count_cap: body.viewCountCap ?? null,
        audience: body.audience ?? null,
      };
      const res = await supabase
        .from('share_links')
        .insert(insertPayload)
        .select('id')
        .single();
      if (!res.error && res.data) {
        inserted = res.data as ShareLinkInsertRow;
        break;
      }
      const code = (res.error as { code?: string } | null)?.code;
      lastError = res.error?.message ?? null;
      // 23505 (unique violation) は token 衝突 → retry
      if (code !== '23505') {
        break;
      }
    }
    if (!inserted) {
      return errorResponse(500, 'share_link_insert_failed', lastError ?? 'unknown_error');
    }

    const fullUrl = `${env.APP_URL.replace(/\/$/, '')}/share/${shortCode}`;
    const response: ShareLinkResponse = {
      id: inserted.id,
      shortCode,
      fullUrl,
      expiresAt,
      viewCountCap: body.viewCountCap ?? null,
      startSec: body.startSec,
      endSec: body.endSec,
    };
    const parsed = shareLinkResponse.safeParse(response);
    if (!parsed.success) {
      return errorResponse(500, 'response_shape_mismatch');
    }
    return ok(parsed.data);
  },
);

interface ShareLinkListRow {
  id: string;
  resource_id: string;
  start_sec: number | null;
  end_sec: number | null;
  expires_at: string;
  click_count: number | null;
  view_count_cap: number | null;
  audience: string | null;
  password_hash: string | null;
  created_at: string;
  revoked_at: string | null;
}

import { z } from 'zod';
import { shareLinkListResponse } from '@ksp/shared';

const listQuery = z.object({
  recordingId: z.string().uuid(),
});

export const GET = defineRoute(
  { query: listQuery },
  async ({ supabase, query }) => {
    // RLS が created_by=auth.uid() / manager+ で絞るので追加チェック不要
    const { data, error } = await supabase
      .from('share_links')
      .select(
        'id,resource_id,start_sec,end_sec,expires_at,click_count,view_count_cap,audience,password_hash,created_at,revoked_at',
      )
      .eq('resource_type', 'recording_clip')
      .eq('resource_id', query.recordingId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      return errorResponse(500, 'share_link_list_failed', error.message);
    }
    const now = Date.now();
    const items = ((data as ShareLinkListRow[] | null) ?? []).map((r) => ({
      id: r.id,
      recordingId: r.resource_id,
      startSec: r.start_sec ?? 0,
      endSec: r.end_sec ?? Math.max((r.start_sec ?? 0) + 1, 1),
      expiresAt: r.expires_at,
      viewCount: r.click_count ?? 0,
      viewCountCap: r.view_count_cap ?? null,
      audience: r.audience,
      passwordProtected: !!r.password_hash,
      createdAt: r.created_at,
      expired:
        !!r.revoked_at ||
        new Date(r.expires_at).getTime() <= now ||
        (r.view_count_cap !== null && (r.click_count ?? 0) >= r.view_count_cap),
    }));
    const parsed = shareLinkListResponse.safeParse({ items });
    if (!parsed.success) {
      return errorResponse(500, 'response_shape_mismatch');
    }
    return ok(parsed.data);
  },
);
