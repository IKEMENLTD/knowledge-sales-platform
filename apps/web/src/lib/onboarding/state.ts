import { createServerClient } from '@/lib/supabase/server';

export { PRIVACY_VERSION, TERMS_VERSION } from './policy-document';

export type OnboardingState = {
  termsConsentedAt: Date | null;
  privacyAcknowledgedAt: Date | null;
  calendarConnectedAt: Date | null;
  calendarSkippedAt: Date | null;
  sampleDataLoadedAt: Date | null;
  sampleSkippedAt: Date | null;
  onboardedAt: Date | null;
  grantedScopes: string;
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

const REQUIRED_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('users')
    .select(
      'terms_consented_at, privacy_acknowledged_at, calendar_connected_at, calendar_skipped_at, sample_data_loaded_at, sample_skipped_at, onboarded_at',
    )
    .eq('id', userId)
    .maybeSingle();

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const userMeta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const grantedScopes =
    typeof userMeta['scopes'] === 'string'
      ? (userMeta['scopes'] as string)
      : typeof userMeta['scope'] === 'string'
        ? (userMeta['scope'] as string)
        : '';
  const hasCalendarScope =
    Boolean(session?.provider_token) && grantedScopes.includes(REQUIRED_CALENDAR_SCOPE);

  return {
    termsConsentedAt: parseDate(data?.terms_consented_at),
    privacyAcknowledgedAt: parseDate(data?.privacy_acknowledged_at),
    calendarConnectedAt: parseDate(data?.calendar_connected_at),
    calendarSkippedAt: parseDate(data?.calendar_skipped_at),
    sampleDataLoadedAt: parseDate(data?.sample_data_loaded_at),
    sampleSkippedAt: parseDate(data?.sample_skipped_at),
    onboardedAt: parseDate(data?.onboarded_at),
    grantedScopes,
    hasCalendarScope,
  };
}

export function isFullyOnboarded(state: OnboardingState): boolean {
  return Boolean(
    state.termsConsentedAt &&
      state.privacyAcknowledgedAt &&
      (state.calendarConnectedAt || state.calendarSkippedAt),
  );
}

export function isStepDone(
  state: OnboardingState,
  step: 'consent' | 'calendar' | 'sample',
): 'done' | 'skipped' | 'pending' {
  switch (step) {
    case 'consent':
      return state.termsConsentedAt && state.privacyAcknowledgedAt ? 'done' : 'pending';
    case 'calendar':
      if (state.calendarConnectedAt) return 'done';
      if (state.calendarSkippedAt) return 'skipped';
      return 'pending';
    case 'sample':
      if (state.sampleDataLoadedAt) return 'done';
      if (state.sampleSkippedAt) return 'skipped';
      return 'pending';
  }
}
