/**
 * Playwright auth fixture — dev/test 用の認証セットアップ。
 *
 * 戦略 (両方サポート):
 *  A. E2E_BYPASS_AUTH=true (dev only):
 *     middleware の updateSession を bypass する `x-e2e-user` header を投入。
 *     ※ production では env.NODE_ENV !== 'production' のガードで強制 off。
 *
 *  B. Supabase test user の access_token を発行:
 *     - SUPABASE_SERVICE_ROLE_KEY を CI secret に入れて
 *       `supabase.auth.admin.generateLink({ type: 'magiclink' })` で
 *       cookie を発行する想定。本 PR 範囲では実装スケルトン (TODO).
 *
 * 現状の `contacts-upload-flow` / `meetings-stage-flow` は A を採用。
 * CI 経由でしか実 test 実行はしない (本 PR は config 整備のみ)。
 */

import type { BrowserContext, Page } from '@playwright/test';

/** dev bypass モードで使う固定 user id (apps/web/src/lib/auth/server.ts の fallback と整合). */
export const E2E_USER_ID =
  process.env.E2E_USER_ID ?? '00000000-0000-0000-0000-0000000000aa';
export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e@ksp.local';
export const E2E_USER_ROLE = (process.env.E2E_USER_ROLE ?? 'sales') as
  | 'sales'
  | 'cs'
  | 'manager'
  | 'admin'
  | 'legal';

/** Auth bypass が有効か (E2E_BYPASS_AUTH=true)。 */
export function isAuthBypassEnabled(): boolean {
  return process.env.E2E_BYPASS_AUTH === 'true';
}

/**
 * Playwright test の前に呼ぶ。
 *  - bypass モードでは header だけセットしてリターン
 *  - 実 Supabase モードでは access_token/refresh_token cookie を投入 (TODO)
 */
export async function ensureSignedIn(
  context: BrowserContext,
  options?: { userId?: string; role?: string },
): Promise<void> {
  if (isAuthBypassEnabled()) {
    await context.setExtraHTTPHeaders({
      'x-e2e-user': options?.userId ?? E2E_USER_ID,
      'x-e2e-role': options?.role ?? E2E_USER_ROLE,
      'x-e2e-email': E2E_USER_EMAIL,
    });
    return;
  }
  // TODO: real Supabase session 発行 (Service role + admin.generateLink → cookie 投入)
  //   現状は CI で E2E_BYPASS_AUTH=true 前提なので、bypass off の場合は test 側で
  //   `test.skip()` する想定。
  throw new Error(
    'E2E_BYPASS_AUTH=true が必要です (CI secret 設定後に real auth setup を実装します)。',
  );
}

/** dev bypass モードが無効な環境では test を skip するヘルパ。 */
export function skipIfNoAuthBypass(testInfo: { skip: (cond: boolean, reason: string) => void }) {
  testInfo.skip(!isAuthBypassEnabled(), 'E2E_BYPASS_AUTH=true 未設定のため skip');
}

/** demo contact id (fixtures.ts の DEMO_CONTACTS[0].id と一致させる)。 */
export const DEMO_CONTACT_ID = 'demo-c-001';

/** stage_history が記録される /api/meetings/[id]/stage を呼ぶための helper。 */
export async function expectStageHistory(
  page: Page,
  meetingId: string,
  fromStage: string,
  toStage: string,
): Promise<void> {
  const res = await page.request.get(`/api/meetings/${meetingId}`);
  if (!res.ok()) {
    throw new Error(`GET /api/meetings/${meetingId} returned ${res.status()}`);
  }
  const body = (await res.json()) as {
    meeting?: { stage_history?: Array<{ from_stage?: string; to_stage?: string }> };
  };
  const history = body.meeting?.stage_history ?? [];
  const hit = history.find((h) => h.from_stage === fromStage && h.to_stage === toStage);
  if (!hit) {
    throw new Error(
      `stage_history に ${fromStage} → ${toStage} が見つかりませんでした (count=${history.length})`,
    );
  }
}
