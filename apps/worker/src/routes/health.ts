import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { isSentryInitialized } from '../lib/sentry.js';

type RouteVariables = {
  reqId: string;
  log: Logger;
};

export const health = new Hono<{ Variables: RouteVariables }>();

/**
 * Liveness: process が生きているかだけを確認する。
 * Render の health check は **200 系のみ ok 扱い** なので 200 固定。
 */
health.get('/healthz', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

type CheckStatus = 'ok' | 'fail' | 'skipped';
interface ReadinessChecks {
  db: CheckStatus;
  pgmq: CheckStatus;
  r2: CheckStatus;
  sentry: CheckStatus;
}

const CHECK_TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch((e: unknown) => {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

async function checkDb(): Promise<CheckStatus> {
  try {
    const { error } = await withTimeout(
      Promise.resolve(supabaseAdmin.from('users').select('id').limit(1)),
      CHECK_TIMEOUT_MS,
    );
    return error ? 'fail' : 'ok';
  } catch {
    return 'fail';
  }
}

async function checkPgmq(): Promise<CheckStatus> {
  try {
    const { error } = await withTimeout(
      Promise.resolve(
        supabaseAdmin.rpc('pgmq_metrics', { queue_name: 'process_recording' }),
      ),
      CHECK_TIMEOUT_MS,
    );
    // 関数未定義は scaffold 段階では skipped 扱い (PGRST202)。
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code === 'PGRST202' || /Could not find the function/i.test(error.message ?? '')) {
        return 'skipped';
      }
      return 'fail';
    }
    return 'ok';
  } catch {
    return 'fail';
  }
}

async function checkR2(): Promise<CheckStatus> {
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    await withTimeout(
      client.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET_RECORDINGS })),
      CHECK_TIMEOUT_MS,
    );
    return 'ok';
  } catch {
    return 'fail';
  }
}

function checkSentry(): CheckStatus {
  if (!env.SENTRY_DSN) return 'skipped';
  return isSentryInitialized() ? 'ok' : 'fail';
}

/**
 * Readiness: 依存性 ping を並列実行し、`{db, pgmq, r2, sentry}` を返す。
 *
 * 23_observability_alerts P1: 「録画処理SLA」「pgbouncer 枯渇」「pgvector memory」
 * を即時検知するため Render dashboard が green でも依存性が落ちていれば 503 を返す。
 */
health.get('/readyz', async (c) => {
  const [db, pgmq, r2] = await Promise.all([checkDb(), checkPgmq(), checkR2()]);
  const sentry = checkSentry();
  const checks: ReadinessChecks = { db, pgmq, r2, sentry };

  const failed = Object.entries(checks)
    .filter(([, v]) => v === 'fail')
    .map(([k]) => k);

  const status = failed.length === 0 ? 'ready' : 'degraded';
  const httpStatus = failed.length === 0 ? 200 : 503;
  return c.json({ status, checks, failed }, httpStatus);
});
