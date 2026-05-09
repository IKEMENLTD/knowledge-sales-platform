import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Phase1 の認証ガード。
 * - 公開ページ (PUBLIC_PATHS) と公開プレフィクス (PUBLIC_PREFIXES) を許可
 * - 未認証は /login?next=<path> へ
 * - `next` は redirect 受信側 (callback / login) で sanitizeNext してから利用するため、
 *   ここでは pathname (origin 含まず) のみセットする (open-redirect 防御メモ)
 */
const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/auth/callback',
  '/offline',
  '/403',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
]);

const PUBLIC_PREFIXES = [
  '/share/', // 公開共有リンク (Phase2)
  '/api/csp-report',
  '/api/health',
  '/_next/',
  '/icons/',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // pathname のみ (origin 含めない) → callback 側で sanitizeNext
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
};
