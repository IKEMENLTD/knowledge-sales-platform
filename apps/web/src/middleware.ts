import { rateLimitWeb } from '@/lib/rate-limit';
import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Phase1 の認証ガード + /api/* レート制限。
 * - 公開ページ (PUBLIC_PATHS) と公開プレフィクス (PUBLIC_PREFIXES) を許可
 * - 未認証は /login?next=<path> へ
 * - `next` は redirect 受信側 (callback / login) で sanitizeNext してから利用するため、
 *   ここでは pathname (origin 含まず) のみセットする (open-redirect 防御メモ)
 * - /api/* は Security Round2 S-N-02 / Architect A-H-04 対応で per-IP token bucket
 *   (60 rpm) を適用。/api/health と /api/csp-report は対象外。
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
  '/favicon.svg',
  '/apple-touch-icon.svg',
  '/apple-touch-icon.png',
  '/og-image.svg',
]);

const PUBLIC_PREFIXES = [
  '/share/', // 公開共有リンク (Phase2)
  '/api/csp-report',
  '/api/health',
  '/_next/',
  '/icons/',
];

/** /api/* のうち rate limit を適用しない (監視 / CSP report) パス。 */
const RATE_LIMIT_BYPASS_PREFIXES = ['/api/health', '/api/csp-report'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldRateLimit(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  return !RATE_LIMIT_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * 標準ヘッダ + Render / Cloudflare 経由の forwarded ヘッダから best-effort で
 * クライアント IP を抽出。すべて欠落したら "unknown" バケットに集約。
 */
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const cfConnecting = request.headers.get('cf-connecting-ip');
  if (cfConnecting) return cfConnecting;
  return 'unknown';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/* レート制限を最優先で評価 (認証コスト前に弾く)
  if (shouldRateLimit(pathname)) {
    const ip = getClientIp(request);
    const result = rateLimitWeb(`api:${ip}`);
    if (!result.ok) {
      return new NextResponse(
        JSON.stringify({
          error: 'rate_limited',
          message: 'Too many requests',
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }
  }

  const { response, user } = await updateSession(request);

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
