/**
 * `next` パラメータの open redirect 防御。
 * - 同 origin の path のみ許可
 * - "//evil.com" のような protocol-relative も拒否
 * - "/login" や "/auth/callback" 自体への戻りも除外
 *
 * Server Action / Route Handler / Middleware の全てから利用するため `use server` を付けない。
 */
export function sanitizeNext(rawNext: string | null | undefined): string {
  const fallback = '/dashboard';
  if (!rawNext) return fallback;
  if (typeof rawNext !== 'string') return fallback;
  if (!rawNext.startsWith('/')) return fallback;
  if (rawNext.startsWith('//')) return fallback;
  if (rawNext.startsWith('/\\')) return fallback;
  if (rawNext.startsWith('/login') || rawNext.startsWith('/auth/')) return fallback;
  if (rawNext.length > 512) return fallback;
  return rawNext;
}
