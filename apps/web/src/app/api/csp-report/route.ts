import { NextResponse } from 'next/server';
import { captureMessage } from '@/lib/sentry';

/**
 * CSP 違反レポート受信エンドポイント。
 * Report-Only モードで運用 → 蓄積した違反を Sentry breadcrumb 化 → enforce 切替を判断 (security/round1)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CspReport = {
  'csp-report'?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: CspReport | null = null;
  try {
    // 一部ブラウザは application/csp-report を送信
    const text = await request.text();
    if (text) {
      body = JSON.parse(text) as CspReport;
    }
  } catch {
    // JSON 不正でも 204 を返す (DoS 対策)
    return new NextResponse(null, { status: 204 });
  }

  if (body) {
    captureMessage('csp_violation', {
      report: body['csp-report'] ?? body,
      ua: request.headers.get('user-agent') ?? null,
    });
  }

  return new NextResponse(null, { status: 204 });
}
