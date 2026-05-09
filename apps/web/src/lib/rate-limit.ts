/**
 * apps/web 用 in-memory token bucket rate limiter。
 *
 * Security/Round2 S-N-02 / Architect A-H-04:
 *   `/api/*` が無防備だと credential stuffing / scraping の足がかりになるため
 *   per-IP のスロットルを middleware で適用する。
 *
 * worker 側 (`apps/worker/src/lib/rate-limit.ts`) と同設計だが、別プロセスなので
 * バケットはここで独立保持する。Phase2 で Redis (Upstash) 化予定。
 *
 * NOTE: Edge runtime でも動くよう Node 固有 API は使わない。
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

export interface WebRateLimitConfig {
  /** バケット容量 (バースト許容量) */
  capacity: number;
  /** 1 秒あたりの補充トークン数 */
  refillPerSecond: number;
}

/** /api/* デフォルト: 60 req/min, バースト 60。 */
export const DEFAULT_API_RATE_LIMIT: WebRateLimitConfig = {
  capacity: 60,
  refillPerSecond: 1, // 60 / 60s
};

export interface WebRateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds (整数切り上げ)
  limit: number;
}

export function rateLimitWeb(
  key: string,
  config: WebRateLimitConfig = DEFAULT_API_RATE_LIMIT,
): WebRateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: config.capacity, lastRefillMs: now };
    buckets.set(key, b);
  }

  const elapsedSec = (now - b.lastRefillMs) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(config.capacity, b.tokens + elapsedSec * config.refillPerSecond);
    b.lastRefillMs = now;
  }

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(b.tokens),
      retryAfter: 0,
      limit: config.capacity,
    };
  }

  const need = 1 - b.tokens;
  const retryAfter = Math.max(1, Math.ceil(need / config.refillPerSecond));
  return { ok: false, remaining: 0, retryAfter, limit: config.capacity };
}

/** テスト・再起動用バケットクリア。 */
export function _resetWebRateLimitBuckets(): void {
  buckets.clear();
}
