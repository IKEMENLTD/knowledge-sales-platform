import { defineConfig, devices } from '@playwright/test';

/**
 * Phase1 W4 で本格運用予定の E2E。
 *
 * baseURL は dev (3000)。CI では `pnpm --filter @ksp/web dev` を webServer で起動する想定。
 *
 * Round 2 P1 追加 (e2e Playwright 2 本):
 *  - contacts-upload-flow.spec.ts: /contacts/import D&D → 進捗 → /contacts 表示
 *  - meetings-stage-flow.spec.ts: /meetings/new → 一覧 → kbd DnD → stage_history 確認
 *
 * 認証戦略:
 *  - dev 環境で `E2E_BYPASS_AUTH=true` を export すると middleware が
 *    `x-e2e-user` cookie の sub をそのまま auth user とみなす (要 dev 専用)
 *  - もしくは Supabase test user の access_token を beforeAll で発行 → cookie 投入
 *    (本 PR では cookie 経由の Supabase session を tests/e2e/_fixtures/auth.ts に集約)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      // E2E_BYPASS_AUTH=true 環境では middleware がこの header の sub を読む。
      // production では bypass 機構ごと無効化されるため安全 (env.NODE_ENV !== 'production')。
      ...(process.env.E2E_BYPASS_AUTH === 'true'
        ? { 'x-e2e-user': process.env.E2E_USER_ID ?? '00000000-0000-0000-0000-0000000000aa' }
        : {}),
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
