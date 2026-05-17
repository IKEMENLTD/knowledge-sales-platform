'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Inbox 既読化 / 再試行 用 Server Actions。
 *
 * 認可:
 *   - createServerClient() の anon + cookie 経路で auth.uid() を持つので、
 *     RLS notifications_self (user_id = auth.uid()) が UPDATE をブロックする。
 *     したがって他人の通知を不正に既読化することはできない (DB レベルで担保)。
 *   - sign-in していない場合 supabase.auth.getUser() が null → /login redirect。
 *
 * Round1 cross-cutting G-P0-6 反映:
 *   - 一切 service_role を使わず anon client で auth.uid() を有効化したまま実行。
 */
async function requireAuth() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, userId: user.id };
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const notificationId = String(formData.get('notificationId') ?? '').trim();
  if (!notificationId) return;
  const { supabase } = await requireAuth();
  const now = new Date().toISOString();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: now })
    .eq('id', notificationId)
    .is('read_at', null); // 二度押し対策で既に既読なら no-op
  revalidatePath('/inbox');
  revalidatePath('/dashboard'); // header badge を refresh するため
}

export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, userId } = await requireAuth();
  const now = new Date().toISOString();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: now })
    .eq('user_id', userId)
    .is('read_at', null);
  revalidatePath('/inbox');
  revalidatePath('/dashboard');
}

/**
 * sync_failed 通知の「再試行」ボタン。
 *
 * Phase1 段階では「該当通知を既読化 → /mobile/queue へリダイレクト」のみ。
 * 実 retry は queue worker 側 (Phase1 W3 T-007/T-008) で実装するため、
 * ここでは UX を成立させるだけの最小実装に留める。
 */
export async function retrySync(formData: FormData): Promise<void> {
  const notificationId = String(formData.get('notificationId') ?? '').trim();
  if (!notificationId) return;
  const { supabase } = await requireAuth();
  const now = new Date().toISOString();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: now })
    .eq('id', notificationId)
    .is('read_at', null);
  revalidatePath('/inbox');
  redirect('/mobile/queue');
}
