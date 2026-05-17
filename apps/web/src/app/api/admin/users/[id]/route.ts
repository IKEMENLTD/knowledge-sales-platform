import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * PATCH /api/admin/users/[id] — role 変更
 * DELETE /api/admin/users/[id] — 退職処理 (is_active=false)
 *
 * 認可:
 *   - defineRoute({ role: 'admin' }) で admin gate。
 *   - 自分自身の role 変更 / 自分自身の退職処理は禁止 (chicken-and-egg / lockout 防止)。
 *
 * Round1 cross-cutting G-P0-6:
 *   - admin role gate は anon cookie 経路で済ませた上で UPDATE を service_role で実行。
 *   - service_role 経由でも 0015 trigger は auth.uid() IS NULL で bypass されるので
 *     role 列の UPDATE は通る。
 *
 * Phase2:
 *   - DELETE は offboarding worker キュー (q_offboarding_checklist) に enqueue する
 *     placeholder のみ。実 cleanup (OAuth revoke / owner transfer 等) は SC-79 で実装。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

const patchBodySchema = z.object({
  role: z.enum(['sales', 'cs', 'manager', 'admin']),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ----------------------------------------------------------------------------
// PATCH
// ----------------------------------------------------------------------------
export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'user id must be uuid');
  }
  const targetUserId = idParse.data.id;

  const handler = defineRoute(
    { role: 'admin', body: patchBodySchema },
    async ({ user, body }) => {
      if (targetUserId === user.id) {
        return errorResponse(409, 'self_role_change_forbidden', '自分自身の役割は変更できません');
      }

      let admin: ReturnType<typeof getSupabaseAdminClient>;
      try {
        admin = getSupabaseAdminClient();
      } catch (err) {
        return errorResponse(503, 'admin_unavailable', (err as Error).message);
      }

      const { error: updateError } = await admin
        .from('users')
        .update({ role: body.role, updated_at: new Date().toISOString() })
        .eq('id', targetUserId);
      if (updateError) {
        return errorResponse(500, 'role_update_failed', updateError.message);
      }

      // 監査通知 (admin_action) を本人に投げる。RLS は service_role bypass で通る。
      // 失敗しても本処理は成功扱い (notification は best-effort)。
      await admin.from('notifications').insert({
        org_id: user.orgId,
        user_id: targetUserId,
        type: 'admin_action',
        title: `あなたの役割が "${body.role}" に変更されました`,
        body: null,
        link_url: '/settings',
        is_read: false,
        metadata: {
          changedBy: user.id,
          newRole: body.role,
        },
      });

      return ok({
        userId: targetUserId,
        role: body.role,
        changedBy: user.id,
      });
    },
  );

  return handler(req);
}

// ----------------------------------------------------------------------------
// DELETE = 退職処理 (is_active=false + offboarding worker placeholder)
// ----------------------------------------------------------------------------
export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'user id must be uuid');
  }
  const targetUserId = idParse.data.id;

  const handler = defineRoute(
    { role: 'admin' },
    async ({ user }) => {
      if (targetUserId === user.id) {
        return errorResponse(
          409,
          'self_offboarding_forbidden',
          '自分自身の退職処理はできません。他の管理者に依頼してください。',
        );
      }

      let admin: ReturnType<typeof getSupabaseAdminClient>;
      try {
        admin = getSupabaseAdminClient();
      } catch (err) {
        return errorResponse(503, 'admin_unavailable', (err as Error).message);
      }

      // 1) is_active=false へ。0015 trigger は role 変更だけ守るので、is_active 単独
      //    UPDATE は admin 経由でも通る。
      const { error: updateError } = await admin
        .from('users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', targetUserId);
      if (updateError) {
        return errorResponse(500, 'user_suspend_failed', updateError.message);
      }

      // 2) offboarding worker queue 用 placeholder。
      //    Phase2 で q_offboarding_checklist を実装するまでは notifications.admin_action として
      //    管理者全員に通知し、SOP O-01〜O-17 の手動チェックリストへ誘導する。
      await admin.from('notifications').insert({
        org_id: user.orgId,
        user_id: user.id,
        type: 'admin_action',
        title: '退職処理が開始されました',
        body: `${targetUserId} を停止しました。引き継ぎチェックリスト (SC-79) を確認してください。`,
        link_url: '/admin/users',
        is_read: false,
        metadata: {
          offboardedUserId: targetUserId,
          offboardedBy: user.id,
        },
      });

      return ok({
        userId: targetUserId,
        suspended: true,
        offboardedBy: user.id,
      });
    },
  );

  return handler(req);
}
