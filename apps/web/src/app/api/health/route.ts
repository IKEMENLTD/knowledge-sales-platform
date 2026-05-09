import { NextResponse } from 'next/server';

/**
 * Render の healthCheckPath / 監視外形チェック用。
 * 認証不要 (middleware の PUBLIC_PREFIXES に含む)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok', ts: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
