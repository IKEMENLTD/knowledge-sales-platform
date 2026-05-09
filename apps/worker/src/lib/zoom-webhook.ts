import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';

/**
 * Zoom Webhook 署名検証
 * https://developers.zoom.us/docs/api/rest/webhook-reference/#verify-webhook-events
 */
export function verifyZoomSignature(args: {
  signatureHeader: string | null;
  timestampHeader: string | null;
  rawBody: string;
}): boolean {
  const { signatureHeader, timestampHeader, rawBody } = args;
  if (!signatureHeader || !timestampHeader) return false;

  // 5分以上古いリクエストは拒否
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const message = `v0:${timestampHeader}:${rawBody}`;
  const hash = createHmac('sha256', env.ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest('hex');
  const expected = `v0=${hash}`;

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
