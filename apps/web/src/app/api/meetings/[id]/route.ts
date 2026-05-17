import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { computeWinProbability } from '@/lib/meetings/derive';
import { meetingUpdateRequestSchema } from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * /api/meetings/[id] — 詳細取得 / 更新 / 論理削除。
 *
 * 認可:
 *   - SELECT: RLS で owner / manager / admin に限定 (0036 政策)。404 vs 403 の差別化は
 *     しない (RLS 経由で見えない = 404 として扱う) 方針。
 *   - PATCH: 所有者 or manager/admin。deleted_at 列の直更新は禁止 (専用 DELETE 経由)。
 *   - DELETE: owner / manager / admin。soft delete (deleted_at=now())。
 *
 * 設計判断:
 *   - GET は (meeting, attendees, recordings) を一度に返す。recordings 側 RLS が
 *     sensitivity で fail-close するので、結果が空になるケースは「権限不足」とみなす
 *     必要があるが、現状は一覧 1 件想定で UX は壊れないので空配列を返す。
 *   - PATCH で stage が変わったときに win_probability を再導出するが、ユーザが明示的
 *     に winProbability を指定した場合は尊重する (ホワイトボックス更新を許す)。
 *   - dealStatus が確定 (won/lost) になったら win_probability も追従させる。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface MeetingOwnerRow {
  id: string;
  owner_user_id: string;
  stage: string | null;
  deal_status: string | null;
  win_probability: number | null;
  deleted_at: string | null;
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'meeting id must be uuid');
  }
  const meetingId = idParse.data.id;

  const handler = defineRoute({}, async ({ supabase }) => {
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .is('deleted_at', null)
      .maybeSingle();
    if (meetingError) {
      return errorResponse(500, 'meeting_lookup_failed', meetingError.message);
    }
    if (!meeting) {
      return errorResponse(404, 'meeting_not_found');
    }

    const [{ data: attendees }, { data: recordings }] = await Promise.all([
      supabase
        .from('meeting_attendees')
        .select('id,attendee_type,user_id,contact_id,role,speaker_label')
        .eq('meeting_id', meetingId),
      supabase
        .from('recordings')
        .select(
          'id,processing_status,sensitivity,video_duration_seconds,summary,processed_at,created_at',
        )
        .eq('meeting_id', meetingId),
    ]);

    return ok({
      meeting,
      attendees: attendees ?? [],
      recordings: recordings ?? [],
    });
  });

  return handler(req);
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'meeting id must be uuid');
  }
  const meetingId = idParse.data.id;

  const handler = defineRoute(
    { body: meetingUpdateRequestSchema },
    async ({ user, supabase, body }) => {
      // 既存 row の owner / 現在 stage を引いて、PATCH 後の win_probability 計算に使う。
      const { data: existing, error: lookupError } = await supabase
        .from('meetings')
        .select('id,owner_user_id,stage,deal_status,win_probability,deleted_at')
        .eq('id', meetingId)
        .maybeSingle();
      if (lookupError) {
        return errorResponse(500, 'meeting_lookup_failed', lookupError.message);
      }
      const row = existing as MeetingOwnerRow | null;
      if (!row || row.deleted_at) {
        return errorResponse(404, 'meeting_not_found');
      }
      const isPrivileged = user.role === 'manager' || user.role === 'admin';
      if (!isPrivileged && row.owner_user_id !== user.id) {
        return errorResponse(403, 'forbidden', 'not meeting owner');
      }

      const update: Record<string, unknown> = {};
      if (body.contactId !== undefined) update.contact_id = body.contactId;
      if (body.title !== undefined) update.title = body.title;
      if (body.scheduledAt !== undefined) update.scheduled_at = body.scheduledAt;
      if (body.durationMinutes !== undefined) update.duration_minutes = body.durationMinutes;
      if (body.status !== undefined) update.status = body.status;
      // stage はここでは触る (専用 /stage エンドポイントもあるが、bulk 編集の利便性のため許す)
      if (body.stage !== undefined) update.stage = body.stage;
      if (body.zoomMeetingId !== undefined) update.zoom_meeting_id = body.zoomMeetingId;
      if (body.zoomJoinUrl !== undefined) update.zoom_join_url = body.zoomJoinUrl;
      if (body.manualNotes !== undefined) update.manual_notes = body.manualNotes;
      if (body.dealStatus !== undefined) update.deal_status = body.dealStatus;
      if (body.dealAmount !== undefined) update.deal_amount = body.dealAmount;
      if (body.dealCloseDate !== undefined) update.deal_close_date = body.dealCloseDate;
      if (body.lostReason !== undefined) update.lost_reason = body.lostReason;
      if (body.nextAction !== undefined) update.next_action = body.nextAction;

      // winProbability 自動導出: 明示指定があればそれ、なければ stage/dealStatus 変化から導出。
      if (body.winProbability !== undefined) {
        update.win_probability = body.winProbability;
      } else if (body.stage !== undefined || body.dealStatus !== undefined) {
        const nextStage = (body.stage ?? row.stage) as
          | Parameters<typeof computeWinProbability>[0]
          | null;
        const nextDealStatus = (body.dealStatus ?? row.deal_status) as
          | Parameters<typeof computeWinProbability>[1]
          | null;
        const nextLostReason = body.lostReason ?? null;
        update.win_probability = computeWinProbability(nextStage, nextDealStatus, nextLostReason);
      }

      update.updated_at = new Date().toISOString();

      if (Object.keys(update).length === 1) {
        return ok({ meetingId, updated: false });
      }

      const { error: updateError } = await supabase
        .from('meetings')
        .update(update)
        .eq('id', meetingId);
      if (updateError) {
        return errorResponse(500, 'meeting_update_failed', updateError.message);
      }

      return ok({ meetingId, updated: true });
    },
  );

  return handler(req);
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'meeting id must be uuid');
  }
  const meetingId = idParse.data.id;

  const handler = defineRoute({}, async ({ user, supabase }) => {
    const { data: existing, error: lookupError } = await supabase
      .from('meetings')
      .select('id,owner_user_id,deleted_at')
      .eq('id', meetingId)
      .maybeSingle();
    if (lookupError) {
      return errorResponse(500, 'meeting_lookup_failed', lookupError.message);
    }
    const row = existing as { id: string; owner_user_id: string; deleted_at: string | null } | null;
    if (!row || row.deleted_at) {
      return errorResponse(404, 'meeting_not_found');
    }
    const isPrivileged = user.role === 'manager' || user.role === 'admin';
    if (!isPrivileged && row.owner_user_id !== user.id) {
      return errorResponse(403, 'forbidden', 'not meeting owner');
    }

    const { error: updateError } = await supabase
      .from('meetings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', meetingId);
    if (updateError) {
      return errorResponse(500, 'meeting_delete_failed', updateError.message);
    }

    return ok({ meetingId, deleted: true });
  });

  return handler(req);
}
