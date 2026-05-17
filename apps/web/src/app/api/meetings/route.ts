import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { computeWinProbability } from '@/lib/meetings/derive';
import { dealStatusSchema, meetingCreateRequestSchema, meetingStageSchema } from '@ksp/shared';
import { z } from 'zod';

/**
 * /api/meetings — 一覧 (GET) と新規作成 (POST)。
 *
 * 認可:
 *   - 全 role が対象。owner_user_id ベースの可視性は RLS (0036 を含む meetings_select_*)
 *     に委譲する。本ハンドラは「自分が作る row は owner_user_id=auth.uid()」のみ強制。
 *   - manager / admin は RLS 側で全件が見える前提。
 *
 * 設計判断:
 *   - POST の冪等性は Idempotency-Key で担保 (defineRoute が必須化)。同じ key で
 *     二度目の呼び出しが来ても meetings row は 1 件に収まる想定。実際の dedupe は
 *     idempotency_keys テーブル (migration 0009) で行う。
 *   - GET は柔軟な絞り込み (stage / dealStatus / ownerUserId / from / to / q) を許可。
 *     RLS で行レベルアクセスを縛っているので、ここでは org_id を明示的に WHERE しない。
 *   - deleted_at IS NULL は RLS 0036 でも担保されるが、SELECT 側でも明示する (admin が
 *     自分の管理画面から全件取りたい場合は別エンドポイントを後で用意する)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MeetingIdRow {
  id: string;
}

/**
 * GET の searchParams は全て string で来るため、ここでは `z.coerce` 互換の構成で
 * 直接シリアル形のスキーマを定義する (defineRoute の TQuery 推論を効かせるため、
 * meetingListQuerySchema の z.preprocess ラップは使わない)。
 */
const meetingListQueryStringSchema = z.object({
  stage: meetingStageSchema.optional(),
  dealStatus: dealStatusSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).max(5000).optional().default(0),
});

export const POST = defineRoute(
  { body: meetingCreateRequestSchema },
  async ({ user, supabase, body }) => {
    const insertPayload: Record<string, unknown> = {
      contact_id: body.contactId,
      owner_user_id: user.id,
      title: body.title,
      duration_minutes: body.durationMinutes,
      status: body.status,
    };
    if (body.scheduledAt) insertPayload.scheduled_at = body.scheduledAt;
    if (body.stage) {
      insertPayload.stage = body.stage;
      // 初期作成時は dealStatus が未指定なので、stage 単独から既定勝率を埋める。
      insertPayload.win_probability = computeWinProbability(body.stage, null, null);
    }
    if (body.zoomMeetingId) insertPayload.zoom_meeting_id = body.zoomMeetingId;
    if (body.zoomJoinUrl) insertPayload.zoom_join_url = body.zoomJoinUrl;
    if (body.manualNotes) insertPayload.manual_notes = body.manualNotes;

    const { data: inserted, error } = await supabase
      .from('meetings')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error || !inserted) {
      return errorResponse(500, 'meeting_insert_failed', error?.message ?? 'unknown_error');
    }

    return ok({ meetingId: (inserted as MeetingIdRow).id });
  },
);

export const GET = defineRoute(
  { query: meetingListQueryStringSchema },
  async ({ supabase, query }) => {
    let q = supabase
      .from('meetings')
      .select(
        'id,contact_id,owner_user_id,title,scheduled_at,duration_minutes,status,stage,deal_status,deal_amount,deal_close_date,next_action,win_probability,created_at,updated_at',
      )
      .is('deleted_at', null);

    if (query.stage) q = q.eq('stage', query.stage);
    if (query.dealStatus) q = q.eq('deal_status', query.dealStatus);
    if (query.ownerUserId) q = q.eq('owner_user_id', query.ownerUserId);
    if (query.from) q = q.gte('scheduled_at', query.from);
    if (query.to) q = q.lte('scheduled_at', query.to);
    if (query.q) {
      // title の部分一致 + manual_notes の部分一致。複数 OR は or() で 1 文に纏める。
      const term = query.q.replace(/[%_]/g, '\\$&');
      q = q.or(`title.ilike.%${term}%,manual_notes.ilike.%${term}%`);
    }

    // zod default() 込みでも推論が optional として伝播するため明示 fallback。
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    q = q
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) {
      return errorResponse(500, 'meeting_list_failed', error.message);
    }

    return ok({
      items: data ?? [],
      limit,
      offset,
    });
  },
);
