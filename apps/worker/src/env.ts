import { z } from 'zod';

// dev では P1 必須 API key を空文字フォールバックで許容 (Render では NODE_ENV=production)
// production では `.min(1)` で fail-fast。
const isProd = process.env.NODE_ENV === 'production';
const requiredInProd = (label: string) =>
  isProd ? z.string().min(1, `${label} required in production`) : z.string().default('');

const schema = z.object({
  // Render では render.yaml で `NODE_ENV=production` を明示注入するので、
  // ここでの default は dev 用 (tsx watch 起動時)。本番フォールバック禁止 (SRE H1-2) は
  // render.yaml 側で明示注入することで担保する。
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),

  DATABASE_URL: requiredInProd('DATABASE_URL'),
  SUPABASE_URL: requiredInProd('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requiredInProd('SUPABASE_SERVICE_ROLE_KEY'),

  // External APIs (P1必須、dev では未設定でも起動可)
  ANTHROPIC_API_KEY: requiredInProd('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: requiredInProd('OPENAI_API_KEY'),

  // Zoom (P1、dev では未設定でも起動可)
  ZOOM_ACCOUNT_ID: requiredInProd('ZOOM_ACCOUNT_ID'),
  ZOOM_CLIENT_ID: requiredInProd('ZOOM_CLIENT_ID'),
  ZOOM_CLIENT_SECRET: requiredInProd('ZOOM_CLIENT_SECRET'),
  ZOOM_WEBHOOK_SECRET_TOKEN: requiredInProd('ZOOM_WEBHOOK_SECRET_TOKEN'),
  // 90日 secret rotation 中の旧 token (任意)。指定があれば検証で OR 評価。
  ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS: z.string().min(1).optional(),

  // R2 (P1、dev では未設定でも起動可)
  R2_ACCOUNT_ID: requiredInProd('R2_ACCOUNT_ID'),
  R2_ACCESS_KEY_ID: requiredInProd('R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: requiredInProd('R2_SECRET_ACCESS_KEY'),
  R2_BUCKET_RECORDINGS: requiredInProd('R2_BUCKET_RECORDINGS'),

  // Notifications
  RESEND_API_KEY: z.string().optional(),
  // 空文字は undefined 扱い (`.env.local` で `SLACK_ALERT_WEBHOOK_URL=` でも parse OK)
  SLACK_ALERT_WEBHOOK_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  ),

  // Observability
  SENTRY_DSN: z.string().optional(),

  // Google APIs
  // worker 側でも Calendar freebusy / Gmail history API の refresh token 交換に使うため P1 で必須。
  GOOGLE_OAUTH_CLIENT_ID: requiredInProd('GOOGLE_OAUTH_CLIENT_ID'),
  GOOGLE_OAUTH_CLIENT_SECRET: requiredInProd('GOOGLE_OAUTH_CLIENT_SECRET'),
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

  // Provider override (Round 3 Whisper 切替). 'auto' は OPENAI_API_KEY 有無で判定する。
  TRANSCRIBE_PROVIDER: z
    .enum(['auto', 'mock', 'whisper', 'openai'])
    .default('auto'),

  // Summarize provider override (Round 4 ClaudeProvider 切替).
  //   - 'auto' は ANTHROPIC_API_KEY 有無で判定 (無ければ Mock)
  //   - 'mock' は固定 fixture を返す Mock
  //   - 'claude' / 'anthropic' は Anthropic Messages API (claude-sonnet-4-5) を呼ぶ
  SUMMARIZE_PROVIDER: z
    .enum(['auto', 'mock', 'claude', 'anthropic'])
    .default('auto'),

  // OCR provider override (Round 4 GoogleVisionProvider 切替).
  //   - 'auto' は GOOGLE_VISION_API_KEY 有無で判定 (無ければ Mock)
  //   - 'mock' は固定 fixture を返す Mock
  //   - 'gcv' は Google Cloud Vision REST (DOCUMENT_TEXT_DETECTION) を呼ぶ
  //   - 'gcv+claude' は Phase2 P1-CT-07: GCV の後ろに Claude PROMPT-02 で 2nd-pass 補強
  OCR_PROVIDER: z.enum(['auto', 'mock', 'gcv', 'gcv+claude']).default('auto'),
  // Phase1 では Google Vision のみ。Anthropic OCR は ANTHROPIC_API_KEY を流用するため独自 key は持たない。
  GOOGLE_VISION_API_KEY: z.string().optional(),
  // Phase2 P1-CT-07: GoogleVisionProvider の後段で Claude PROMPT-02 補強を有効にするか。
  //   - 'auto' は ANTHROPIC_API_KEY 有無で判定 (sk-ant-test placeholder は無効扱い)
  //   - 'true' / '1' / 'on' は強制有効化
  //   - default は false (Vision のみ)
  OCR_CLAUDE_ENRICH: z
    .enum(['false', 'true', '1', '0', 'on', 'off', 'auto'])
    .default('false'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
