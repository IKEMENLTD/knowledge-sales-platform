'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

/**
 * オンボーディングを完了扱いにする。
 *  - public.users.onboarded_at = now() を立て、/dashboard に飛ばす
 *  - RLS: ユーザは自分の row のみ UPDATE 可 (0003_rls_p1.sql の users_update_self_or_admin)
 *  - role 列の変更は 0015_users_role_guard.sql trigger で admin 限定なのでここでは弾かれる
 */
export async function completeOnboarding() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id);

  redirect('/dashboard');
}
