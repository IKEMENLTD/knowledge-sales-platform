import { z } from 'zod';

const schema = z.object({
  // NOTE(SRE H1-2): production フォールバック禁止のため `.default()` を撤去。
  // Render では render.yaml で `NODE_ENV=production` を必ず注入する。
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(8080),

  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // External APIs (P1必須)
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),

  // Zoom (P1)
  ZOOM_ACCOUNT_ID: z.string().min(1),
  ZOOM_CLIENT_ID: z.string().min(1),
  ZOOM_CLIENT_SECRET: z.string().min(1),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
  // 90日 secret rotation 中の旧 token (任意)。指定があれば検証で OR 評価。
  ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS: z.string().min(1).optional(),

  // R2 (P1)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_RECORDINGS: z.string().min(1),

  // Notifications
  RESEND_API_KEY: z.string().optional(),
  SLACK_ALERT_WEBHOOK_URL: z.string().url().optional(),

  // Observability
  SENTRY_DSN: z.string().optional(),

  // Google APIs
  // worker 側でも Calendar freebusy / Gmail history API の refresh token 交換に使うため P1 で必須。
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Gmail Pub/Sub Webhook secret は P2 機能なので任意。
  WEBHOOK_SECRET_GMAIL: z.string().min(1).optional(),

  // pgmq
  PGMQ_VISIBILITY_TIMEOUT_DEFAULT: z.coerce.number().int().positive().default(300),

  // Onboarding / sample data
  SAMPLE_DATA_SEED: z.string().optional(),

  // Backup / DR
  PITR_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  SOFT_DELETE_GRACE_DAYS: z.coerce.number().int().positive().default(30),
  DR_BACKUP_REGION: z.string().min(1).default('ap-northeast-3'),

  // Rate limit
  RATE_LIMIT_USER_RPM: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ADMIN_RPM: z.coerce.number().int().positive().default(10),

  // Feature flags / A/B (P2 optional)
  AB_HASH_SECRET: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
