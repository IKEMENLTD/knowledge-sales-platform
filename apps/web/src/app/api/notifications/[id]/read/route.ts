import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/notifications/[id]/read
 *
 * 単一通知を既読化する。Server Component 経路は /inbox/actions.ts の Server Action を
 * 使うため、本 API は将来の SW push handler / client side optimistic UI / mobile
 * native shell 等から叩く想定で残す。
 *
 * 認可:
 *   - defineRoute → requireApiUser → cookie 経由 anon supabase。
 *   - RLS (notifications_self) が user_id=auth.uid() で UPDATE をブロックするため、
 *     他人の通知を既読化することはできない。
 *
 * 副作用: notifications.read_at = now(), is_read = true
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'notification id must be uuid');
  }
  const notificationId = idParse.data.id;

  const handler = defineRoute(
    {
      // body 不要だが defineRoute は mutating で Idempotency-Key を要求するため
      // requireIdempotencyKey: false に明示。SW / 自動再送経路でも安全に呼べるよう
      // 「既に read_at が立っていれば no-op」とする実装で多重 OK にする。
      requireIdempotencyKey: false,
    },
    async ({ user, supabase }) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .is('read_at', null)
        .select('id')
        .maybeSingle();

      if (error) {
        return errorResponse(500, 'notification_update_failed', error.message);
      }
      // data === null は「該当 id が無い or 既に既読」。両方とも 200 で OK 扱い。
      return ok({ id: notificationId, updated: data !== null, readAt: now });
    },
  );

  return handler(req);
}
