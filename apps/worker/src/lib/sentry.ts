import * as Sentry from '@sentry/node';
import { env } from '../env.js';

let initialized = false;

/**
 * Sentry SDK の初期化。`SENTRY_DSN` 未設定の環境では no-op。
 *
 * 23_observability_alerts P1: 「エラー率>1%/5min → Slack」の発火源として
 * worker のエラーは Sentry 経由で集約する。
 */
export function initSentry(): boolean {
  if (initialized) return true;
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Render が自動注入する commit SHA。release tracking 用。
    release: process.env.RENDER_GIT_COMMIT,
  });
  initialized = true;
  return true;
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * async 安全な captureException ラッパ。Sentry 未 init 環境でも throw しない。
 */
export function captureException(err: unknown, hint?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.captureException(err, hint ? { extra: hint } : undefined);
  } catch {
    // Sentry 経路の障害で本処理を巻き込まない。
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'warning'): void {
  if (!initialized) return;
  try {
    Sentry.captureMessage(message, level);
  } catch {
    // ignore
  }
}

export { Sentry };
