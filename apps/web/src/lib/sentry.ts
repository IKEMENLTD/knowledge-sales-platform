import * as Sentry from '@sentry/nextjs';

/**
 * Sentry の薄いラッパ。DSN 未設定環境でもクラッシュさせない。
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Sentry 自体の失敗は黙殺
  }
}

export function captureMessage(message: string, context?: Record<string, unknown>) {
  try {
    Sentry.captureMessage(message, context ? { extra: context } : undefined);
  } catch {
    // noop
  }
}
