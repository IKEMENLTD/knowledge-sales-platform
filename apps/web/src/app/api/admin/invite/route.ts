import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/admin/invite (Round2 P1 G-P1-1 part 1)
 *
 * 新規メンバー招待。Supabase Auth admin API でメールを送り、public.users 行を
 * service_role で作成する。
 *
 * 認可:
 *   - defineRoute({ role: 'admin' }) で admin gate (anon cookie 経路で auth.uid()
 *     が有効なまま role check)。
 *   - 招待実行は SUPABASE_SERVICE_ROLE_KEY を要求する admin client で行う。
 *
 * Idempotency:
 *   - Supabase 側で同 email 招待は 422 を返すため、本 API も 409 に丸めて返す。
 *
 * Round1 cross-cutting G-P0-6 反映:
 *   - role gate は anon client (defineRoute) で済ませてから admin client を使う。
 *     role 列 UPDATE は 0015 trigger で auth.uid() NULL → bypass されるので、
 *     service_role で newly INSERT は安全に admin role でも作成可。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inviteBodySchema = z.object({
  email: z.string().email().max(254),
  /**
   * 0001 init schema の users.role check は 'sales','cs','manager','admin' のみ。
   * 'legal' は drizzle enum にはあるが DB CHECK 未追加のため当 API では非対応とする。
   * Phase2 で 'legal' を CHECK に追加する migration が当たり次第 enum 拡張。
   */
  role: z.enum(['sales', 'cs', 'manager', 'admin']),
  /** 任意の表示名。未指定なら email の local-part を使う。 */
  name: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const handler = defineRoute(
    {
      role: 'admin',
      body: inviteBodySchema,
    },
    async ({ user, body }) => {
      let admin: ReturnType<typeof getSupabaseAdminClient>;
      try {
        admin = getSupabaseAdminClient();
      } catch (err) {
        return errorResponse(
          503,
          'admin_unavailable',
          (err as Error).message,
        );
      }

      // 1) Supabase auth に招待メール送信。redirectTo は onboarding 開始ページに固定。
      const redirectTo = `${env.APP_URL.replace(/\/$/, '')}/onboarding`;
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        body.email,
        {
          redirectTo,
          data: {
            invited_by: user.id,
            invited_role: body.role,
            full_name: body.name ?? null,
          },
        },
      );

      if (inviteError) {
        const code = (inviteError as { code?: string }).code ?? '';
        // 既存ユーザに対する重複招待は 409 で返す。
        if (/already.*registered|exists/i.test(inviteError.message)) {
          return errorResponse(409, 'user_already_exists', inviteError.message);
        }
        return errorResponse(
          500,
          'invite_failed',
          `${code || ''} ${inviteError.message}`.trim(),
        );
      }

      const newAuthUserId = inviteData.user?.id;
      if (!newAuthUserId) {
        // 想定外 (Supabase は user を返すはず)
        return errorResponse(500, 'invite_no_user_id');
      }

      // 2) public.users に対応行を作成 (or 既存 row なら role を upsert)。
      //    0005/0025 の handle_new_auth_user trigger で auth.users → public.users が
      //    自動同期されるが、それが走るタイミングと competing するので明示 upsert。
      //    org_id は invoking admin の org をミラーする。
      const fallbackName =
        body.name ?? (body.email.split('@')[0] || 'New Member');
      const { error: upsertError } = await admin
        .from('users')
        .upsert(
          {
            id: newAuthUserId,
            email: body.email,
            name: fallbackName,
            role: body.role,
            is_active: false, // 招待受諾 (オンボード完了) で true に切替える
            org_id: user.orgId,
          },
          { onConflict: 'id' },
        );
      if (upsertError) {
        return errorResponse(500, 'users_upsert_failed', upsertError.message);
      }

      return ok({
        userId: newAuthUserId,
        email: body.email,
        role: body.role,
        invitedBy: user.id,
      });
    },
  );

  return handler(req);
}
