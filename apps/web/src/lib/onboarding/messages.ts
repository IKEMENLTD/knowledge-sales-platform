/**
 * Onboarding error code → 日本語メッセージ。
 * i18n 移行時はここを通訳キーに置換するだけで済むよう独立ファイル化 (R2-O-08)。
 */
export const STEP_ERROR_MESSAGES = {
  consent_required: '次へ進むには、両方の項目に同意が必要です。',
  oauth_failed: 'Google カレンダー連携に失敗しました。もう一度お試しください。',
  incomplete: '必須ステップが完了していません。',
  calendar_incomplete: 'Google カレンダーを連携するか「あとで連携する」を選んでください。',
  save_failed: '保存に失敗しました。時間をおいて再度お試しください。',
  permission_denied: '権限が不足しています。管理者にお問い合わせください。',
  already_done: '既に完了しています。',
  org_missing: 'アカウント情報が見つかりません。管理者にお問い合わせください。',
} as const;

export type OnboardingErrorCode = keyof typeof STEP_ERROR_MESSAGES;

export function describeOnboardingError(code: string | null | undefined): string | null {
  if (!code) return null;
  return STEP_ERROR_MESSAGES[code as OnboardingErrorCode] ?? null;
}

export const PRIVACY_SETTINGS_MESSAGES = {
  invalid_input: '不正な入力です。',
  permission_denied: '権限が不足しています。',
  save_failed: '保存に失敗しました。時間をおいて再度お試しください。',
} as const;
