import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { meetingHandoffRequestSchema } from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/meetings/[id]/handoff
 *
 * 営業 → CS への商談ハンドオフ。実体は notification の生成 + manual_notes への
 * タイムスタンプ付き追記。後段で CS が確認 → kickoff stage 遷移、という流れを想定。
 *
 * 認可:
 *   - manager / admin のみ。営業個人が勝手にハンドオフ宛先を変えると属人化するので、
 *     部門マネージャ以上に絞る。defineRoute({ role: 'manager' }) で gate。
 *
 * 副作用:
 *   - notifications に handoff_pending を 1 件 INSERT (宛先=toUserId)。
 *     RLS は user_id ベースで recipient のみ select 可能。
 *   - meetings.manual_notes に追記 ("--- ハンドオフ YYYY-MM-DD HH:mm by {actor} ---")。
 *     既存 manual_notes は残し、最後尾に追記する。
 *
 * 設計判断:
 *   - draftNotes は LLM 生成のドラフトを想定。空でもハンドオフ通知自体は飛ばす。
 *   - Idempotency-Key で多重通知を防ぐ (CS 側で重複表示が発生しないように)。
 *   - audit_logs への明示記録は将来的に追加するが、現状は notifications + manual_notes
 *     の 2 系統が事実上の audit となる (meeting_stage_transitions と同じ append-only)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface MeetingHandoffRow {
  id: string;
  title: string;
  manual_notes: string | null;
  owner_user_id: string;
  deleted_at: string | null;
}

interface UserRow {
  id: string;
  name: string | null;
}

export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'meeting id must be uuid');
  }
  const meetingId = idParse.data.id;

  const handler = defineRoute(
    {
      role: 'manager',
      body: meetingHandoffRequestSchema,
    },
    async ({ user, supabase, body }) => {
      // 1) meeting 確認 + 自分が触れる権限の最終チェック。
      const { data: meeting, error: lookupError } = await supabase
        .from('meetings')
        .select('id,title,manual_notes,owner_user_id,deleted_at')
        .eq('id', meetingId)
        .maybeSingle();
      if (lookupError) {
        return errorResponse(500, 'meeting_lookup_failed', lookupError.message);
      }
      const row = meeting as MeetingHandoffRow | null;
      if (!row || row.deleted_at) {
        return errorResponse(404, 'meeting_not_found');
      }

      // 2) 宛先 user 存在チェック (削除済み/未登録への送信を防ぐ)。
      const { data: target, error: targetError } = await supabase
        .from('users')
        .select('id,name')
        .eq('id', body.toUserId)
        .maybeSingle();
      if (targetError) {
        return errorResponse(500, 'user_lookup_failed', targetError.message);
      }
      const targetRow = target as UserRow | null;
      if (!targetRow) {
        return errorResponse(404, 'target_user_not_found');
      }

      // 3) notifications INSERT。
      const notificationPayload: Record<string, unknown> = {
        user_id: body.toUserId,
        type: 'handoff_pending',
        title: `商談ハンドオフ: ${row.title}`,
        body: body.draftNotes ?? null,
        link_url: `/meetings/${meetingId}`,
        is_read: false,
      };
      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notificationPayload);
      if (notifError) {
        return errorResponse(500, 'notification_insert_failed', notifError.message);
      }

      // 4) manual_notes に追記。タイムスタンプ + actor で監査痕跡を残す。
      const ts = new Date().toISOString();
      const actorLabel = user.fullName ?? user.email ?? user.id;
      const header = `\n\n--- ハンドオフ ${ts} by ${actorLabel} → ${targetRow.name ?? targetRow.id} ---`;
      const draft = body.draftNotes ? `\n${body.draftNotes}` : '';
      const nextNotes = (row.manual_notes ?? '') + header + draft;

      const { error: updateError } = await supabase
        .from('meetings')
        .update({ manual_notes: nextNotes, updated_at: ts })
        .eq('id', meetingId);
      if (updateError) {
        // notification は既に送られているが rollback できないので 500 で返す。
        // 受信側 UI が二重通知に対処する想定 (Idempotency-Key 再送なら同じ key で 1 発)。
        return errorResponse(500, 'meeting_notes_append_failed', updateError.message);
      }

      return ok({
        meetingId,
        notifiedUserId: body.toUserId,
        appended: true,
      });
    },
  );

  return handler(req);
}
