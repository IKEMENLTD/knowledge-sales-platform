import { createServerClient } from '@/lib/supabase/server';

/** 規約・プライバシーポリシー本文の現在版数とハッシュ。 */
export const TERMS_VERSION = '2026.05.0';
export const PRIVACY_VERSION = '2026.05.0';

/**
 * オンボード状態を一括取得。各 step は users 列で完了判定する。
 * SC-61 の 3 step を server で再構築して client component に渡す。
 */
export type OnboardingState = {
  termsConsentedAt: Date | null;
  privacyAcknowledgedAt: Date | null;
  calendarConnectedAt: Date | null;
  sampleDataLoadedAt: Date | null;
  onboardedAt: Date | null;
  /** Google OAuth で calendar.events スコープを取得済みか (provider 経由) */
  hasCalendarScope: boolean;
};

const parseDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('users')
    .select(
      'terms_consented_at, privacy_acknowledged_at, calendar_connected_at, sample_data_loaded_at, onboarded_at',
    )
    .eq('id', userId)
    .maybeSingle();

  // Calendar scope 判定: provider_token があれば OAuth が通っている前提で true 扱い。
  // 本来は user_oauth_tokens から確認するが、Phase1 では Supabase Auth 経由のみ。
  const { data: session } = await supabase.auth.getSession();
  const providerToken = session.session?.provider_token ?? null;

  return {
    termsConsentedAt: parseDate(data?.terms_consented_at),
    privacyAcknowledgedAt: parseDate(data?.privacy_acknowledged_at),
    calendarConnectedAt: parseDate(data?.calendar_connected_at),
    sampleDataLoadedAt: parseDate(data?.sample_data_loaded_at),
    onboardedAt: parseDate(data?.onboarded_at),
    hasCalendarScope: Boolean(providerToken),
  };
}

/** すべての必須ステップが完了しているか。Step 3 (sample) は任意。 */
export function isFullyOnboarded(state: OnboardingState): boolean {
  return Boolean(
    state.termsConsentedAt &&
      state.privacyAcknowledgedAt &&
      state.calendarConnectedAt,
  );
}
