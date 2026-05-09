/**
 * Vitest setupFiles: テスト実行前に env.ts の zod schema を満たす最小ダミー env を注入する。
 *
 * すべてのテストで env.parse 失敗を避けるため、prod-like な値を入れておく。
 * テスト個別で上書きしたい場合は `vi.stubEnv(...)` を使うこと。
 */

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  OPENAI_API_KEY: 'sk-openai-test',
  ZOOM_ACCOUNT_ID: 'zoom-acct-test',
  ZOOM_CLIENT_ID: 'zoom-client-test',
  ZOOM_CLIENT_SECRET: 'zoom-secret-test',
  ZOOM_WEBHOOK_SECRET_TOKEN: 'zoom-webhook-current',
  R2_ACCOUNT_ID: 'r2-acct',
  R2_ACCESS_KEY_ID: 'r2-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_BUCKET_RECORDINGS: 'ksp-recordings-test',
  GOOGLE_OAUTH_CLIENT_ID: 'google-oauth-client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-client-secret',
};

for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) {
    process.env[k] = v;
  }
}
