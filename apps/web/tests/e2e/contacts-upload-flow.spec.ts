import { expect, test } from '@playwright/test';
import { ensureSignedIn, isAuthBypassEnabled } from './_fixtures/auth';

/**
 * 名刺アップロード E2E (Round 2 P1)。
 *
 * フロー:
 *  1. /contacts/import 訪問
 *  2. ドロップゾーンに小さな JPEG (1x1px) を `setInputFiles` で投入
 *  3. キューに 1 件追加され、`stage` が `preparing` → `done` (もしくは `failed`) に推移
 *  4. /contacts へ遷移して該当 contactId が表示されることを確認
 *
 * 前提:
 *  - E2E_BYPASS_AUTH=true で middleware が auth user を mock すること
 *  - dev server が `pnpm --filter @ksp/web dev` 経由で起動済 (CI workflow 側で起動)
 *  - 実 OCR を走らせるとコストが出るので、API は contact INSERT までで止まる想定
 *    (worker は別プロセスで止まっていて OK。`enqueuedForOcr=false` 系の応答でも spec は通る)
 */

test.describe('contacts upload flow', () => {
  test.skip(!isAuthBypassEnabled(), 'E2E_BYPASS_AUTH=true 未設定のため skip');

  test.beforeEach(async ({ context }) => {
    await ensureSignedIn(context);
  });

  test('drop a card image and see the contact appear in /contacts', async ({ page }) => {
    await page.goto('/contacts/import');

    // 1) 取り込み画面が見える
    await expect(
      page.getByRole('heading', { name: /名刺.*取り込み|名刺の画像/ }),
    ).toBeVisible({ timeout: 10_000 });

    // 2) input[type=file] を直接掴んで投入 (D&D は flaky なので setInputFiles 経由)
    //    1x1 px JPEG をインラインで生成 (最小フィクスチャ)
    const tinyJpegBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z';

    const buffer = Buffer.from(tinyJpegBase64, 'base64');
    const fileInput = page
      .locator('input[type="file"]')
      .first();
    await fileInput.setInputFiles({
      name: 'card.jpg',
      mimeType: 'image/jpeg',
      buffer,
    });

    // 3) キューに 1 件出る — file 名がどこかに見えるはず
    await expect(page.getByText(/card\.jpg|アップロード中|準備|読み取り/i)).toBeVisible({
      timeout: 10_000,
    });

    // 4) 進捗が done もしくは failed に到達するまで待つ
    //    (worker 未起動でも contact insert までは完了するので "完了" 文言は出る前提)
    await expect(
      page.locator('[data-stage="done"], [data-stage="failed"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    // 5) /contacts に navigate して新規 row が表で見えること
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: /名刺|連絡先/ })).toBeVisible();
    // 取り込み直後は OCR が pending なのでプレースホルダ "読み取り中…" が出る
    await expect(
      page.getByText(/読み取り中|pending_ocr|card\.jpg/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
