import { expect, test } from '@playwright/test';

/**
 * AT-S1-5 placeholder: Google OAuth → /dashboard 到達フロー。
 *
 * 現状は test 基盤が回ることだけ確認したいので describe.skip。
 * Phase1 W3 (T-006 Auth) 完了後にこの skip を外して実装する。
 *
 * 実装時の流れ (memo):
 *   1. /login にアクセス → "Google でログイン" ボタンが見える
 *   2. supabase の test user で signIn (test 用 service_role + magic link)
 *   3. /dashboard へ redirect
 *   4. 「ようこそ {user.name}」が見える
 *   5. cookie を消して再アクセス → /login に戻る
 */
test.describe.skip('auth flow (placeholder)', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/ログイン|Login|Knowledge/i);
  });

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    const res = await page.goto('/dashboard');
    expect(res?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login/);
  });
});
