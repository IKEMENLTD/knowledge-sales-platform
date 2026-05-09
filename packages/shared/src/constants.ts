// 設計仕様書 12_cost_estimate / 23_observability_alerts より
export const COST_CAPS = {
  perConversationUsd: 0.1,
  perMeetingUsd: 0.5,
} as const;

export const RATE_LIMITS = {
  userRpm: 60,
  adminRpm: 10,
  searchRpm: 30,
  ocrPerMin: 10,
} as const;

export const STORAGE_BUCKETS = {
  businessCards: 'business-cards',
  recordings: 'recordings',
  knowledge: 'knowledge',
} as const;

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;
export const EMBEDDING_DIM = 1536 as const;
export const CHUNK_TOKENS = 800 as const;
export const CHUNK_OVERLAP = 100 as const;
