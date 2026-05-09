import pino, { type Logger } from 'pino';
import { env } from '../env.js';

/**
 * ベース logger。`logger.child({ reqId })` で per-request の文脈を付与する。
 *
 * SRE H4-2: structured logging に request_id propagation する。
 * 自前 middleware (apps/worker/src/index.ts) で各リクエストに reqId を発行し、
 * `logger.child({ reqId })` を `c.set('log', ...)` で context に載せる。
 */
export const logger: Logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: {
    service: 'ksp-worker',
    env: env.NODE_ENV,
  },
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
});

/**
 * リクエスト用の child logger を生成するヘルパ。
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
