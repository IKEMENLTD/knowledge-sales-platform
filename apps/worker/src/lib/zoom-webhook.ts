import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/**
 * Zoom Webhook 署名検証
 * https://developers.zoom.us/docs/api/rest/webhook-reference/#verify-webhook-events
 *
 * 90日 secret rotation 中は current/previous の両 secret で検証する (S-N-03 / SRE H8-1)。
 * - `ZOOM_WEBHOOK_SECRET_TOKEN`: 現行の secret
 * - `ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS`: rotation 中のみ有効な旧 secret
 *
 * timestamp ±5min と timing-safe な比較は維持。
 */

const FIVE_MIN = 300; // seconds

interface VerifyArgs {
  signatureHeader: string | null;
  timestampHeader: string | null;
  rawBody: string;
  secrets?: ReadonlyArray<string | undefined>; // for testing
  nowSeconds?: number; // for testing
}

export function verifyZoomSignature(args: VerifyArgs): boolean {
  const { signatureHeader, timestampHeader, rawBody } = args;
  if (!signatureHeader || !timestampHeader) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;

  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  // 過去/未来双方の skew を 5 分で拒否
  if (Math.abs(now - ts) > FIVE_MIN) return false;

  const secrets = (args.secrets ?? [
    env.ZOOM_WEBHOOK_SECRET_TOKEN,
    env.ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS,
  ]).filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (secrets.length === 0) return false;

  const message = `v0:${timestampHeader}:${rawBody}`;
  const sigBuf = Buffer.from(signatureHeader);

  return secrets.some((secret) => {
    const hash = createHmac('sha256', secret).update(message).digest('hex');
    const expected = Buffer.from(`v0=${hash}`);
    if (sigBuf.length !== expected.length) return false;
    try {
      return timingSafeEqual(sigBuf, expected);
    } catch {
      return false;
    }
  });
}

/**
 * URL Validation チャレンジの encryptedToken を計算する。
 * 注意: URL Validation 自体は Zoom 仕様上 unsigned で来るが、
 * encryptedToken は **現行 secret のみ** で計算する (旧 secret は使わない)。
 */
export function computeUrlValidationToken(plainToken: string, secret = env.ZOOM_WEBHOOK_SECRET_TOKEN): string {
  return createHmac('sha256', secret).update(plainToken).digest('hex');
}
