import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  PRIVACY_BODY,
  PRIVACY_HASH,
  TERMS_BODY,
  TERMS_HASH,
} from '@/lib/auth/onboarding';
import { requireUser } from '@/lib/auth/server';
import {
  getOnboardingState,
  PRIVACY_VERSION,
  TERMS_VERSION,
  isFullyOnboarded,
} from '@/lib/onboarding/state';
import { OnboardingStepper, type Step } from './_components/stepper';
import { StepCalendar } from './_components/step-calendar';
import { StepConsent } from './_components/step-consent';
import { StepDone } from './_components/step-done';
import { StepSample } from './_components/step-sample';

void TERMS_HASH;
void PRIVACY_HASH;

export const metadata = { title: 'はじめての設定' };

type SearchParams = { step?: string; error?: string };

const STEP_ERROR_TEXT: Record<string, string> = {
  consent_required: '次へ進むには、両方の項目に同意が必要です。',
  oauth_failed: 'Google カレンダー連携に失敗しました。もう一度お試しください。',
  incomplete: '必須ステップが完了していません。',
};

function resolveActive(
  step: string | undefined,
  state: Awaited<ReturnType<typeof getOnboardingState>>,
): 'consent' | 'calendar' | 'sample' | 'done' {
  if (step === 'consent' || step === 'calendar' || step === 'sample' || step === 'done') {
    return step;
  }
  if (!state.termsConsentedAt || !state.privacyAcknowledgedAt) return 'consent';
  if (!state.calendarConnectedAt) return 'calendar';
  if (!state.sampleDataLoadedAt) return 'sample';
  return 'done';
}

function buildStepperState(
  active: ReturnType<typeof resolveActive>,
  state: Awaited<ReturnType<typeof getOnboardingState>>,
): Step[] {
  const consentDone = !!state.termsConsentedAt && !!state.privacyAcknowledgedAt;
  const calendarDone = !!state.calendarConnectedAt;
  const sampleDone = !!state.sampleDataLoadedAt;

  const status = (id: Step['id'], isDone: boolean, optional?: boolean): Step['status'] => {
    if (isDone) return 'done';
    if (active === id) return 'active';
    if (optional && active === 'done') return 'skipped';
    return 'pending';
  };

  return [
    { id: 'consent', label: '同意事項', status: status('consent', consentDone) },
    { id: 'calendar', label: 'カレンダー', status: status('calendar', calendarDone) },
    { id: 'sample', label: 'サンプル', status: status('sample', sampleDone, true) },
    { id: 'done', label: '完了', status: active === 'done' ? 'active' : 'pending' },
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
  const errorMessage = params.error ? STEP_ERROR_TEXT[params.error] : null;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-2xl px-6 py-10 md:py-16 outline-none flex flex-col"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 mb-8 animate-fade-in">
        <p className="kicker">SC-61 — はじめての設定</p>
        <p className="kicker">{active === 'done' ? 'COMPLETE' : 'SETUP'}</p>
      </div>

      <header className="space-y-2 mb-8 animate-fade-up">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          ようこそ、{user.fullName ?? user.email?.split('@')[0] ?? ''} さん。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          ksp を使い始める前に、3 分だけ最初の設定を整えます。途中で止めても、次回ログインしたときに続きから再開できます。
        </p>
      </header>

      <OnboardingStepper steps={stepper} />

      {errorMessage ? (
        <Alert variant="warning" aria-live="polite" className="mb-6 animate-fade-up">
          <AlertTitle>確認してください</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section className="animate-fade-up [animation-delay:60ms]">
        {active === 'consent' ? (
          <StepConsent
            termsBody={TERMS_BODY}
            privacyBody={PRIVACY_BODY}
            termsVersion={TERMS_VERSION}
            privacyVersion={PRIVACY_VERSION}
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
            sampleLoaded={!!state.sampleDataLoadedAt}
          />
        )}
      </section>
    </main>
  );
}
