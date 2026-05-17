import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { computeWinProbability, validateStageTransition } from '@/lib/meetings/derive';
import { meetingStageTransitionRequestSchema } from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/meetings/[id]/stage
 *
 * ステージ遷移 (audit を必ず残す) 専用エンドポイント。
 *
 * 動作:
 *   1) 既存 meeting から (owner_user_id, stage, deal_status) を取得。
 *   2) validateStageTransition で逆走/不可逆遷移を検査。
 *      - "warning" でもエラーにはせず、audit の reason に注釈付きで記録する。
 *      - 完全 noop (from===to で deal_status も無変化) は updated=false で早期返却。
 *   3) meeting_stage_transitions に INSERT (audit / changed_by_user_id=user.id)。
 *   4) meetings の stage / deal_status / win_probability を UPDATE。
 *
 * 設計判断:
 *   - 専用エンドポイントを分けたのは「stage 変更時の audit を強制」するため。
 *     PATCH /meetings/[id] でも stage を変えられるが、その場合 audit は残らない (誤運用)。
 *     UI 側はステージ変更 UI で必ずこちらを叩く方針。
 *   - 無効ステージ遷移 (won → in_progress 等) は警告のみ。要件はこの方針で確定したい
 *     (現状は audit に "warning:..." prefix を入れる)。
 *   - Idempotency-Key 必須 (POST mutating)。同 key で 2 度叩かれても audit / UPDATE は 1 回。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface MeetingForTransitionRow {
  id: string;
  org_id: string;
  owner_user_id: string;
  stage: string | null;
  deal_status: string | null;
  deleted_at: string | null;
}

export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'meeting id must be uuid');
  }
  const meetingId = idParse.data.id;

  const handler = defineRoute(
    { body: meetingStageTransitionRequestSchema },
    async ({ user, supabase, body }) => {
      const { data: existing, error: lookupError } = await supabase
        .from('meetings')
        .select('id,org_id,owner_user_id,stage,deal_status,deleted_at')
        .eq('id', meetingId)
        .maybeSingle();
      if (lookupError) {
        return errorResponse(500, 'meeting_lookup_failed', lookupError.message);
      }
      const row = existing as MeetingForTransitionRow | null;
      if (!row || row.deleted_at) {
        return errorResponse(404, 'meeting_not_found');
      }
      const isPrivileged = user.role === 'manager' || user.role === 'admin';
      if (!isPrivileged && row.owner_user_id !== user.id) {
        return errorResponse(403, 'forbidden', 'not meeting owner');
      }

      const fromStage = row.stage as Parameters<typeof validateStageTransition>[0];
      const toStage = body.toStage;
      const verdict = validateStageTransition(fromStage, toStage);

      // noop で deal_status も変化しないなら何もしない。
      if (verdict.kind === 'noop' && body.toDealStatus === undefined) {
        return ok({ meetingId, updated: false, verdict: verdict.kind });
      }

      // audit reason の組み立て: ユーザ入力 reason に警告 prefix を併記。
      const auditReason = (() => {
        const parts: string[] = [];
        if (verdict.kind === 'warning') {
          parts.push(`warning:${verdict.reason}`);
        }
        if (body.reason) parts.push(body.reason);
        return parts.length > 0 ? parts.join(' | ') : null;
      })();

      // 1) audit INSERT。
      // Round2 Security NEW-HIGH-S-20 fix:
      //   meeting_stage_transitions.org_id は NOT NULL (default 無し)。INSERT 時に
      //   meeting 由来の org_id を明示しないと 23502 で全 stage transition が失敗する。
      const auditPayload: Record<string, unknown> = {
        org_id: row.org_id,
        meeting_id: meetingId,
        changed_by_user_id: user.id,
        from_stage: row.stage,
        to_stage: toStage,
        from_deal_status: row.deal_status,
        to_deal_status: body.toDealStatus ?? null,
        reason: auditReason,
      };
      const { error: auditError } = await supabase
        .from('meeting_stage_transitions')
        .insert(auditPayload);
      if (auditError) {
        return errorResponse(500, 'stage_transition_audit_failed', auditError.message);
      }

      // 2) meetings UPDATE。
      const update: Record<string, unknown> = {
        stage: toStage,
        updated_at: new Date().toISOString(),
      };
      if (body.toDealStatus !== undefined) {
        update.deal_status = body.toDealStatus;
      }
      const nextDealStatus = (body.toDealStatus ?? row.deal_status) as
        | Parameters<typeof computeWinProbability>[1]
        | null;
      update.win_probability = computeWinProbability(toStage, nextDealStatus, null);

      const { error: updateError } = await supabase
        .from('meetings')
        .update(update)
        .eq('id', meetingId);
      if (updateError) {
        // audit は append-only で取り消せないため、verdict として記録だけ残し失敗を返す。
        return errorResponse(500, 'meeting_stage_update_failed', updateError.message);
      }

      return ok({
        meetingId,
        updated: true,
        fromStage: row.stage,
        toStage,
        verdict: verdict.kind,
        warning: verdict.kind === 'warning' ? verdict.reason : null,
      });
    },
  );

  return handler(req);
}
