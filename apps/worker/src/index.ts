import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import type { Logger } from 'pino';
import { env } from './env.js';
import { logger, childLogger } from './lib/logger.js';
import { initSentry, captureException } from './lib/sentry.js';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  renderMetrics,
} from './lib/metrics.js';
import { health } from './routes/health.js';
import { webhooks } from './routes/webhooks.js';

// 1) Sentry init は他の処理より先に。env.SENTRY_DSN が無ければ no-op。
initSentry();

type Variables = {
  reqId: string;
  log: Logger;
};

const app = new Hono<{ Variables: Variables }>();

/**
 * Request id propagation + structured per-request logger + metrics
 *
 * 仕様:
 *   - 受信した `x-request-id` ヘッダがあればそのまま継承、無ければ randomUUID() を発行
 *   - `c.set('reqId', ...)`, `c.set('log', ...)` で context に格納
 *   - レスポンスにも `x-request-id` を必ず書き戻す (notFound / onError 経路含む)
 *
 * SRE H4-2 / M4-2: honoLogger による文字列ロギング (二重ログ) は撤去。
 */
app.use('*', async (c, next) => {
  const reqId = c.req.header('x-request-id') ?? randomUUID();
  c.set('reqId', reqId);
  const log = childLogger({ reqId, path: c.req.path, method: c.req.method });
  c.set('log', log);
  c.header('x-request-id', reqId);
  const startNs = process.hrtime.bigint();
  try {
    await next();
  } finally {
    const status = c.res.status;
    const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;
    const route = c.req.routePath ?? c.req.path;
    httpRequestsTotal.inc({ method: c.req.method, route, status: String(status) });
    httpRequestDurationSeconds.observe(
      { method: c.req.method, route, status: String(status) },
      durationSec,
    );
    log.info({ status, durationMs: Math.round(durationSec * 1000) }, 'req');
  }
});

// 2) Health (liveness / readiness)
app.route('/', health);

// 3) Webhooks
app.route('/', webhooks);

// 4) Prometheus metrics scrape endpoint
app.get('/metrics', async (c) => {
  const { contentType, body } = await renderMetrics();
  c.header('Content-Type', contentType);
  return c.body(body);
});

app.notFound((c) => {
  // x-request-id は middleware で既にセット済み (notFound でも保持される)
  return c.json({ error: 'not_found', path: c.req.path }, 404);
});

app.onError((err, c: Context<{ Variables: Variables }>) => {
  const log = c.get('log') ?? logger;
  log.error({ err, path: c.req.path }, 'unhandled worker error');
  // Sentry 送信は async 安全 (内部 try/catch あり)
  captureException(err, { reqId: c.get('reqId'), path: c.req.path });
  return c.json({ error: 'internal_error' }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'worker listening');
});
