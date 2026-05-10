import { z } from 'zod';

/**
 * apps/web の環境変数 schema。
 * - SUPABASE_SERVICE_ROLE_KEY は worker 専用なので web からは参照しない (security/round1)
 * - NEXTAUTH_* は廃止 (Supabase Auth に統一)
 * - GOOGLE_OAUTH_* は callback 等で必要に応じて参照する任意項目
 * - SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN は監視 (sre/round1)
 */
// `.env.local` の空文字キー (`SENTRY_DSN=` 等) を undefined として扱う preprocess。
const optionalUrl = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  );
const optionalString = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(1).optional(),
  );

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  GOOGLE_OAUTH_CLIENT_ID: optionalString(),
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString(),
  SENTRY_DSN: optionalUrl(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl(),
  SENTRY_ENVIRONMENT: optionalString(),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  APP_URL: process.env.APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
});

export type Env = typeof env;
