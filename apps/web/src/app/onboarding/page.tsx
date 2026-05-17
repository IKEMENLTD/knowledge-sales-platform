import { requireUser } from '@/lib/auth/server';
import { describeOnboardingError } from '@/lib/onboarding/messages';
import {
  PRIVACY_BODY,
  PRIVACY_HASH,
  PRIVACY_VERSION,
  TERMS_BODY,
  TERMS_HASH,
  TERMS_VERSION,
} from '@/lib/onboarding/policy-document';
import { getOnboardingState, isFullyOnboarded, isStepDone } from '@/lib/onboarding/state';
import { redirect } from 'next/navigation';
import { ErrorFocusAlert } from './_components/error-focus';
import { StepCalendar } from './_components/step-calendar';
import { StepConsent } from './_components/step-consent';
import { StepDone } from './_components/step-done';
import { StepSample } from './_components/step-sample';
import { OnboardingStepper, type Step } from './_components/stepper';

export const metadata = { title: 'はじめての設定' };
export const dynamic = 'force-dynamic';

type SearchParams = { step?: string; error?: string };

function resolveActive(
  step: string | undefined,
  state: Awaited<ReturnType<typeof getOnboardingState>>,
): 'consent' | 'calendar' | 'sample' | 'done' {
  if (step === 'done') {
    return isFullyOnboarded(state) ? 'done' : 'consent';
  }
  if (step === 'consent' || step === 'calendar' || step === 'sample') {
    return step;
  }
  if (!state.termsConsentedAt || !state.privacyAcknowledgedAt) return 'consent';
  if (!state.calendarConnectedAt && !state.calendarSkippedAt) return 'calendar';
  if (!state.sampleDataLoadedAt && !state.sampleSkippedAt) return 'sample';
  return 'done';
}

function buildStepperState(
  active: ReturnType<typeof resolveActive>,
  state: Awaited<ReturnType<typeof getOnboardingState>>,
): Step[] {
  const consentStatus = isStepDone(state, 'consent');
  const calendarStatus = isStepDone(state, 'calendar');
  const sampleStatus = isStepDone(state, 'sample');

  const status = (id: Step['id'], stepStatus: 'done' | 'skipped' | 'pending'): Step['status'] => {
    if (stepStatus === 'done') return 'done';
    if (stepStatus === 'skipped') return 'skipped';
    if (active === id) return 'active';
    return 'pending';
  };

  return [
    { id: 'consent', label: '同意事項', status: status('consent', consentStatus) },
    { id: 'calendar', label: 'カレンダー', status: status('calendar', calendarStatus) },
    { id: 'sample', label: 'サンプル', status: status('sample', sampleStatus) },
    {
      id: 'done',
      label: '完了',
      status: active === 'done' ? 'active' : 'pending',
    },
  ];
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const state = await getOnboardingState(user.id);

  if (state.onboardedAt && isFullyOnboarded(state) && params.step !== 'done') {
    redirect('/dashboard');
  }

  const active = resolveActive(params.step, state);
  const stepper = buildStepperState(active, state);
  const errorMessage = describeOnboardingError(params.error);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-2xl px-6 pt-10 md:pt-16 pb-[max(env(safe-area-inset-bottom),2.5rem)] outline-none flex flex-col"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 mb-8 animate-fade-in">
        <p className="kicker">はじめての設定</p>
        <p className="kicker">
          {active === 'done'
            ? 'COMPLETE'
            : active === 'consent'
              ? 'STEP 01 / 03'
              : active === 'calendar'
                ? 'STEP 02 / 03'
                : 'STEP 03 / 03'}
        </p>
      </div>

      <header className="space-y-2 mb-8 animate-fade-up">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          ようこそ、{user.fullName ?? user.email?.split('@')[0] ?? ''} さん。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          ksp を使い始める前に、3
          分だけ最初の設定を整えます。途中で止めても、次回ログインしたときに続きから再開できます。
        </p>
      </header>

      <OnboardingStepper steps={stepper} />

      {errorMessage ? (
        <ErrorFocusAlert title="確認してください" description={errorMessage} />
      ) : null}

      <section className="animate-fade-up [animation-delay:60ms]">
        {active === 'consent' ? (
          <StepConsent
            termsBody={TERMS_BODY}
            privacyBody={PRIVACY_BODY}
            termsVersion={TERMS_VERSION}
            privacyVersion={PRIVACY_VERSION}
            termsHash={TERMS_HASH}
            privacyHash={PRIVACY_HASH}
            showError={params.error === 'consent_required'}
          />
        ) : active === 'calendar' ? (
          <StepCalendar
            alreadyConnected={!!state.calendarConnectedAt}
            hasCalendarScope={state.hasCalendarScope}
          />
        ) : active === 'sample' ? (
          <StepSample alreadyLoaded={!!state.sampleDataLoadedAt} />
        ) : (
          <StepDone
            termsAccepted={!!state.termsConsentedAt}
            privacyAccepted={!!state.privacyAcknowledgedAt}
            calendarConnected={!!state.calendarConnectedAt}
            calendarSkipped={!!state.calendarSkippedAt}
            sampleLoaded={!!state.sampleDataLoadedAt}
            sampleSkipped={!!state.sampleSkippedAt}
          />
        )}
      </section>
    </main>
  );
}
