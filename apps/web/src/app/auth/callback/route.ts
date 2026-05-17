import { sanitizeNext } from '@/lib/auth/redirect';
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Supabase OAuth callback。
 * - PKCE code 交換を実施
 * - `next` パラメータは sanitizeNext で同 origin の path-only に制限 (open-redirect 防御)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = sanitizeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
