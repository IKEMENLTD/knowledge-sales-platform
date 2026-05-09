/**
 * Phase1 簡易レート制限。in-memory token bucket。
 *
 * Architect A-H-04 / Security S-N-02:
 *   `endpoint.url_validation` のような unsigned 経路を含む webhook で
 *   per-IP スロットルが無いと OAuth エンドポイント探索の足がかりになる。
 *
 * NOTE: マルチインスタンス時は Redis (Upstash) 化が必須。Phase2 で差し替える前提。
 *       Render Standard 1 dyno 構成なら Phase1 は in-memory で十分。
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  capacity: number; // bucket size
  refillPerSecond: number; // token refill rate
}

const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 30,
  refillPerSecond: 0.5, // 30 req/min
};

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

export function rateLimitPerIp(key: string, config: RateLimitConfig = DEFAULT_CONFIG): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: config.capacity, lastRefillMs: now };
    buckets.set(key, b);
  }

  // Refill
  const elapsedSec = (now - b.lastRefillMs) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(config.capacity, b.tokens + elapsedSec * config.refillPerSecond);
    b.lastRefillMs = now;
  }

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), retryAfter: 0 };
  }

  const need = 1 - b.tokens;
  const retryAfter = Math.ceil(need / config.refillPerSecond);
  return { ok: false, remaining: 0, retryAfter };
}

/**
 * テスト/再起動用に bucket をクリアする。
 */
export function _resetRateLimitBuckets(): void {
  buckets.clear();
}
