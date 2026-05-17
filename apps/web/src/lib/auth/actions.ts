'use server';

import { env } from '@/lib/env';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { sanitizeNext } from './redirect';

/**
 * Phase1 の最小スコープ。Calendar.events だけ初期付与。
 * Gmail / Drive 等は incremental authorization で「使う直前に追加同意」する (security/round1)。
 */
const GOOGLE_SCOPES_MIN = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export async function signInWithGoogle(formData?: FormData) {
  const rawNext = formData?.get('next');
  const next = sanitizeNext(typeof rawNext === 'string' ? rawNext : null);

  const supabase = await createServerClient();
  const callbackUrl = new URL('/auth/callback', env.APP_URL);
  callbackUrl.searchParams.set('next', next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      scopes: GOOGLE_SCOPES_MIN,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? 'oauth_failed')}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
