// 設計仕様書 12_cost_estimate / 23_observability_alerts より

/**
 * LLM 1 リクエスト/会議あたりの USD 上限。
 * 22_feature_flags_ab / 12_cost_estimate v2.2 の kill switch 閾値。
 */
export const COST_CAPS = {
  perConversationUsd: 0.1,
  perMeetingUsd: 0.5,
} as const;

/**
 * オフライン (PWA) 動作時のローカルキュー上限。
 * UX 設計の安全弁: 100 件 / 60秒 を超えると old から drop。
 */
export const OFFLINE_LIMITS = {
  maxQueueItems: 100,
  maxVoiceMemoSeconds: 60,
} as const;

/**
 * Storage バケット名 (Supabase Storage / R2)
 */
export const STORAGE_BUCKETS = {
  businessCards: 'business-cards',
  recordings: 'recordings',
  knowledge: 'knowledge',
} as const;

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;
export const EMBEDDING_DIM = 1536 as const;
export const CHUNK_TOKENS = 800 as const;
export const CHUNK_OVERLAP = 100 as const;

/**
 * Rate limit 設定。env から読みつつ default は constants で持つ。
 *
 * NOTE: SRE Round1 M6-2 指摘 — 「constants と env の二重情報源」を解消するため
 * 関数化。`RATE_LIMITS` (旧 const) は backward-compat のため `defaultRateLimits()`
 * を呼んだ snapshot として export。
 *
 * 使用例:
 *   import { rateLimits } from '@ksp/shared';
 *   const limits = rateLimits(process.env);
 *   // limits.userRpm = Number(env.RATE_LIMIT_USER_RPM ?? 60)
 */
export type RateLimitEnv = {
  RATE_LIMIT_USER_RPM?: string | undefined;
  RATE_LIMIT_ADMIN_RPM?: string | undefined;
  RATE_LIMIT_SEARCH_RPM?: string | undefined;
  RATE_LIMIT_OCR_PER_MIN?: string | undefined;
};

export type RateLimitConfig = {
  userRpm: number;
  adminRpm: number;
  searchRpm: number;
  ocrPerMin: number;
};

const RATE_LIMIT_DEFAULTS: RateLimitConfig = {
  userRpm: 60,
  adminRpm: 10,
  searchRpm: 30,
  ocrPerMin: 10,
};

function toPositiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function rateLimits(env: RateLimitEnv = {}): RateLimitConfig {
  return {
    userRpm: toPositiveInt(env.RATE_LIMIT_USER_RPM, RATE_LIMIT_DEFAULTS.userRpm),
    adminRpm: toPositiveInt(env.RATE_LIMIT_ADMIN_RPM, RATE_LIMIT_DEFAULTS.adminRpm),
    searchRpm: toPositiveInt(env.RATE_LIMIT_SEARCH_RPM, RATE_LIMIT_DEFAULTS.searchRpm),
    ocrPerMin: toPositiveInt(env.RATE_LIMIT_OCR_PER_MIN, RATE_LIMIT_DEFAULTS.ocrPerMin),
  };
}

/**
 * @deprecated Use `rateLimits(env)` instead. Kept for backward compatibility.
 */
export const RATE_LIMITS: RateLimitConfig = { ...RATE_LIMIT_DEFAULTS };
