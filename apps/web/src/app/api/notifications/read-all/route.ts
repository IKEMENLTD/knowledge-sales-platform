import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import type { NextRequest } from 'next/server';

/**
 * POST /api/notifications/read-all
 *
 * 全未読通知を一括既読化する。inbox 画面 + header bell のメニュー両方から呼べる。
 *
 * 認可:
 *   - requireApiUser で sign-in 必須。
 *   - RLS notifications_self が user_id=auth.uid() で UPDATE をブロックするため、
 *     他人の通知に波及することはない。
 *
 * 副作用: 未読の自分宛通知すべてに read_at = now() / is_read = true を入れる。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const handler = defineRoute(
    {
      requireIdempotencyKey: false,
    },
    async ({ user, supabase }) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null)
        .select('id');

      if (error) {
        return errorResponse(500, 'notification_update_failed', error.message);
      }
      return ok({ updatedCount: Array.isArray(data) ? data.length : 0, readAt: now });
    },
  );

  return handler(req);
}
