import { expect, test } from '@playwright/test';

/**
 * Phase1 W4 で本格運用予定。現状は smoke 1 本のみ。
 */
test.describe('smoke', () => {
  test('home page renders and shows sign-in CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /営業ナレッジ/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'サインイン' })).toBeVisible();
  });

  test('skip link becomes visible on focus', async ({ page }) => {
    await page.goto('/');
    // Tab once to reach the skip link
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '本文へスキップ' })).toBeFocused();
  });
});
