import { expect, test } from '@playwright/test';
import { DEMO_CONTACT_ID, ensureSignedIn, isAuthBypassEnabled } from './_fixtures/auth';

/**
 * 商談ステージ E2E (Round 2 P1)。
 *
 * フロー:
 *  1. /meetings/new?contact_id=demo-c-001 で新規商談作成
 *     - select の最初の contact を選び、件名を埋めて submit
 *     - /meetings/{id} に redirect される
 *  2. /meetings 一覧に該当カードが表示される
 *  3. ドラッグハンドル (GripVertical button) に Tab フォーカス → Space で掴む
 *  4. ArrowRight で隣接ステージ (scheduled → in_progress) に移動 → Space で離す
 *  5. /meetings/{id} を GET し、stage_history が 1 件記録されていることを確認
 *
 * 注意:
 *  - DnD は HTML5 native のため Playwright dragTo は flaky。本 spec はキーボード DnD を採用。
 *  - DB 実接続前提なので fixture mode (isDemo=true) の場合は toast.message のみで永続化されない。
 *    そのため fixture 検出時は stage_history 検証を skip する。
 */

test.describe('meetings stage flow', () => {
  test.skip(!isAuthBypassEnabled(), 'E2E_BYPASS_AUTH=true 未設定のため skip');

  test.beforeEach(async ({ context }) => {
    await ensureSignedIn(context);
  });

  test('create a meeting, then move it across stages via keyboard DnD', async ({ page }) => {
    // 1) /meetings/new に prefill 付きで遷移
    await page.goto(`/meetings/new?contact_id=${DEMO_CONTACT_ID}`);

    await expect(page.getByRole('heading', { name: /新しい商談|新規商談/ })).toBeVisible();

    // 2) フォームを埋める
    //    contact picker が空なら先に名刺取り込みを促す UI が出る → test 失敗ではなく skip
    const contactSelect = page.locator('select#contact_id');
    const contactOptionCount = await contactSelect
      .locator('option:not([value=""])')
      .count()
      .catch(() => 0);
    test.skip(
      contactOptionCount === 0,
      '名刺が 1 件もない環境 (DB 空)。先に contacts seed を走らせる必要があります。',
    );

    // prefill された contact がそのまま選ばれているはず。selected 値を確認。
    const selectedContactId = await contactSelect.inputValue();
    expect(selectedContactId.length).toBeGreaterThan(0);

    const titleInput = page.locator('input#title');
    const meetingTitle = `E2E test meeting ${Date.now()}`;
    await titleInput.fill(meetingTitle);

    // 3) submit → /meetings/{id} に redirect
    const submitButton = page.getByRole('button', { name: /商談を作成|作成/ });
    await Promise.all([
      page.waitForURL(/\/meetings\/[0-9a-f-]+/i, { timeout: 15_000 }),
      submitButton.click(),
    ]);

    const meetingDetailUrl = page.url();
    const meetingId = meetingDetailUrl.match(/\/meetings\/([0-9a-f-]+)/i)?.[1];
    expect(meetingId).toBeTruthy();

    // 4) /meetings 一覧で該当タイトルが見える
    await page.goto('/meetings');
    await expect(page.getByText(meetingTitle).first()).toBeVisible({ timeout: 10_000 });

    // 5) fixture mode かを検知 (サンプル badge があれば DB 未接続 → 後段を skip)
    const isFixtureMode =
      (await page.locator('text=サンプル').count()) > 0 &&
      (await page.locator('[aria-label="サンプルデータ"]').count()) > 0;

    // 6) キーボード DnD で scheduled → in_progress に移動
    //    target カードのドラッグハンドル button (aria-label が "{title} を移動 ...")
    const handle = page.getByRole('button', { name: new RegExp(`${meetingTitle}.*移動`) });
    await handle.scrollIntoViewIfNeeded();
    await handle.focus();
    await page.keyboard.press('Space'); // 掴む
    await page.keyboard.press('ArrowRight'); // 1 つ右のステージへ
    await page.keyboard.press('Space'); // 離す → POST /api/meetings/{id}/stage

    // toast.success が見えれば DnD は成功 (fixture mode は toast.message なので別文言)
    await expect(
      page.getByText(/進行中.*移動|サンプル.*移動/).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 7) DB 実接続時のみ stage_history を検証
    if (!isFixtureMode && meetingId) {
      const detail = await page.request.get(`/api/meetings/${meetingId}`);
      expect(detail.ok()).toBeTruthy();
      const body = (await detail.json()) as {
        meeting?: { stage_history?: Array<{ from_stage?: string; to_stage?: string }> };
        stageHistory?: Array<{ fromStage?: string; toStage?: string }>;
      };
      const history = body.meeting?.stage_history ?? body.stageHistory ?? [];
      expect(history.length).toBeGreaterThanOrEqual(1);
    }
  });
});
