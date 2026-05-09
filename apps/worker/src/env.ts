import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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

  // Google APIs (P2以降)
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
