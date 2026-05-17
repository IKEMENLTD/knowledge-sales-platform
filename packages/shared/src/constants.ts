// 設計仕様書 12_cost_estimate / 23_observability_alerts より

/**
 * LLM 1 リクエスト/会議あたりの USD 上限。
 * 22_feature_flags_ab / 12_cost_estimate v2.2 の kill switch 閾値。
 *
 * Round2 CTO 指摘 (Round3 fix):
 *   perMeetingUsd=0.5 だと 90分商談 + 25MB Whisper + Claude 要約で実推定 $0.48-$0.62
 *   になり、超過頻発で kill switch が誤発火する。Whisper $0.006/min × 90 = $0.54 単独で
 *   既に 0.5 を上回るため、現実的な上限として $1.20 に引き上げ (90分上限想定)。
 *   per-org 月次キャップ (12_cost_estimate) は別 layer で enforce。
 */
export const COST_CAPS = {
  perConversationUsd: 0.1,
  perMeetingUsd: 1.2,
} as const;

/**
 * Round2 CTO 指摘 (Round3 fix): DEFAULT_ORG_ID の hardcode が 5+ 箇所に散在
 * (apps/worker/src/jobs/embed.ts / ocr.ts / apps/web/src/app/api/search/click/route.ts 等)。
 * マルチテナント cutover (Phase2) の際に grep 漏れがあると本番で全 org が衝突する。
 * single source of truth として shared/constants.ts に置く。
 *
 * Phase1 シングルテナント環境のみ参照される。Phase2 で `app.org_id` GUC SET LOCAL を
 * middleware 強制した段階でこの定数の参照箇所は全削除予定。
 */
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001' as const;

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
 * embedding source type — `knowledge_embeddings.source_type` SQL CHECK と
 * Drizzle schema (knowledge.ts) の enum、shared/types.ts (zod) の 3 箇所で
 * 同期する必要があるため、ここを single source of truth とする (A2-Mi-03)。
 *
 * SQL: 0001_init_schema.sql:181
 * zod: shared/types.ts generateEmbeddingsPayload.sourceType
 */
export const embeddingSourceType = [
  'knowledge_item',
  'recording_segment',
  'meeting_notes',
  'email',
  'handoff',
] as const;
export type EmbeddingSourceType = (typeof embeddingSourceType)[number];

/**
 * notification type — `notifications.type` の DB CHECK (0018) と Drizzle schema
 * (notifications.ts) と worker / web からの直接 INSERT の 3 経路で同期させる
 * source of truth (A2-Mi-03)。
 *
 * SQL: 0018_notifications_type_check.sql
 */
export const notificationType = [
  'recording_ready',
  'reply_received',
  'handoff_pending',
  'sync_failed',
  'mention',
  'admin_action',
] as const;
export type NotificationType = (typeof notificationType)[number];

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
