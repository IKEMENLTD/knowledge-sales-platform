import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
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
import { closePgmq } from './lib/pgmq.js';
import { health } from './routes/health.js';
import { webhooks } from './routes/webhooks.js';
import { startJobTickers, stopJobTickers } from './jobs/index.js';

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

// pgmq consumer tickers (Phase2B T-009): NODE_ENV=test では no-op。
startJobTickers();

const httpServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'worker listening');
}) as Server;

/**
 * Graceful shutdown (Round 2 SRE P1-SRE-01)。
 *
 * SIGTERM (PaaS / Kubernetes) or SIGINT (Ctrl-C) を受けたら:
 *   1. setInterval を止め、現在進行中の tick の完了を最大 15 秒待つ
 *   2. HTTP listener を close (新規 conn 拒否 + in-flight 完了待ち)
 *   3. pgmq の singleton postgres-js 接続を end
 *   4. process.exit(0)
 *
 * 何度も呼ばれても 2 回目以降は no-op (`stopping` フラグ)。
 * 全体タイムアウトは 25 秒で、それを超えたら exit(1)。
 */
let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const log = logger.child({ op: 'shutdown', signal });
  log.info('graceful shutdown initiated');

  const overallTimeout = setTimeout(() => {
    log.error('graceful shutdown timed out (25s); forcing exit(1)');
    process.exit(1);
  }, 25_000);
  overallTimeout.unref();

  try {
    // 1) tick interval を止めて in-flight tick を待つ
    await stopJobTickers(15_000);
    log.info('job tickers stopped');

    // 2) HTTP server を閉じる (新規 conn を拒否 + 既存を排出)
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          log.warn({ err: err.message }, 'http server close errored');
        }
        resolve();
      });
      // 5 秒猶予で強制 close
      setTimeout(() => resolve(), 5_000).unref();
    });
    log.info('http server closed');

    // 3) pgmq 接続を閉じる
    await closePgmq();
    log.info('pgmq connection closed');
  } catch (err) {
    log.error({ err: (err as Error).message }, 'shutdown error (continuing exit)');
  } finally {
    clearTimeout(overallTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});
process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});
