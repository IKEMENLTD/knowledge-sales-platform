import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { verifyZoomSignature } from '@/lib/zoom-webhook';

export const webhooks = new Hono();

/**
 * POST /webhooks/zoom
 * Zoom recording.completed を受信し pgmq に process_recording を投入する。
 * - x-zm-signature 検証
 * - URL Validation (endpoint.url_validation) 応答対応
 * - 3秒以内に200を返す (本処理はキュー側でやる)
 */
webhooks.post('/webhooks/zoom', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('x-zm-signature') ?? null;
  const ts = c.req.header('x-zm-request-timestamp') ?? null;

  // URL Validation チャレンジ (Zoom App初回登録時)
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (payload.event === 'endpoint.url_validation') {
    const plain = (payload.payload as { plainToken?: string } | undefined)?.plainToken;
    if (!plain) return c.json({ error: 'missing_plainToken' }, 400);
    const encrypted = createHmac('sha256', env.ZOOM_WEBHOOK_SECRET_TOKEN)
      .update(plain)
      .digest('hex');
    return c.json({ plainToken: plain, encryptedToken: encrypted });
  }

  if (!verifyZoomSignature({ signatureHeader: sig, timestampHeader: ts, rawBody })) {
    logger.warn({ event: payload.event }, 'zoom webhook signature mismatch');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  // TODO(T-011): pgmq.send('process_recording', payload) + meetings/recordings upsert
  logger.info({ event: payload.event }, 'zoom webhook accepted');
  return c.json({ received: true });
});
