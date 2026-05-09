import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (root) — apps/web 対象
 *
 * 設計書 24_acceptance_test_matrix v2.1 の AT-S1-5 / AT-S5-1 / AT-S13-1 等
 * E2E placeholder を tests/e2e/ 配下に配置。CI では .github/workflows/ci.yml の
 * `e2e` job が呼ぶ (現状は describe.skip のため fast-pass)。
 *
 * baseURL は CI では `pnpm --filter @ksp/web dev` を別途立ち上げる前提。
 * ローカル開発では PLAYWRIGHT_BASE_URL を上書き可能。
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 必要になったら下記 webServer を有効化。今は手動 / CI で別途起動。
  // webServer: {
  //   command: 'pnpm --filter @ksp/web start',
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
