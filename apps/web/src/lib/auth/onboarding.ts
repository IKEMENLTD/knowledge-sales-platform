'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import {
  buildConsentRows,
  evaluateCompletion,
  isUniqueViolation,
  mapErrorToCode,
  parseConsentForm,
  parseWithdrawForm,
  safeIp,
  type AuthContext,
} from '@/lib/onboarding/core';
import { captureException } from '@/lib/sentry';
import { createServerClient } from '@/lib/supabase/server';

async function requireAuthContext(): Promise<AuthContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row, error } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !row?.org_id) {
    captureException(error ?? new Error('users.org_id missing'), {
      where: 'requireAuthContext',
      userId: user.id,
    });
    redirect('/onboarding?error=org_missing');
  }

  const h = await headers();
  return {
    userId: user.id,
    orgId: row.org_id as string,
    ipAddress: safeIp(h),
    userAgent: h.get('user-agent'),
  };
}

function reportAndRedirect(target: string, action: string, e: unknown): never {
  captureException(e, { action });
  redirect(`${target}?error=${mapErrorToCode(e)}`);
}

// Step 1: 利用規約 + プライバシーポリシー同意
export async function acceptTerms(formData: FormData) {
  const parsed = parseConsentForm(formData);
  if (!parsed) {
    redirect('/onboarding?error=consent_required');
  }

  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase
    .from('consent_logs')
    .upsert(buildConsentRows(ctx, now), {
      onConflict: 'user_id,consent_type,version',
      ignoreDuplicates: true,
    });
  if (insertErr) reportAndRedirect('/onboarding', 'acceptTerms.consent_logs.upsert', insertErr);

  const { error: updateErr } = await supabase
    .from('users')
    .update({ terms_consented_at: now, privacy_acknowledged_at: now })
    .eq('id', ctx.userId);
  if (updateErr) reportAndRedirect('/onboarding', 'acceptTerms.users.update', updateErr);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=calendar');
}

// Step 2: Google カレンダー
const REQUIRED_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function connectCalendar() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const providerToken = session?.provider_token ?? null;
  const userMeta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const grantedScopes =
    typeof userMeta['scopes'] === 'string'
      ? (userMeta['scopes'] as string)
      : typeof userMeta['scope'] === 'string'
        ? (userMeta['scope'] as string)
        : '';
  const hasCalendarScope =
    Boolean(providerToken) && grantedScopes.includes(REQUIRED_CALENDAR_SCOPE);

  if (!hasCalendarScope) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${env.APP_URL}/auth/callback?next=${encodeURIComponent('/onboarding?step=calendar')}`,
        scopes: `openid email profile ${REQUIRED_CALENDAR_SCOPE}`,
        queryParams: { prompt: 'consent', access_type: 'offline' },
      },
    });
    if (error || !data?.url) {
      captureException(error ?? new Error('oauth url missing'), {
        action: 'connectCalendar.oauth',
      });
      redirect('/onboarding?error=oauth_failed');
    }
    redirect(data.url);
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({
      calendar_connected_at: new Date().toISOString(),
      calendar_skipped_at: null,
    })
    .eq('id', ctx.userId)
    .is('calendar_connected_at', null);
  if (updateErr) reportAndRedirect('/onboarding', 'connectCalendar.users.update', updateErr);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=sample');
}

export async function skipCalendar() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('users')
    .update({ calendar_skipped_at: new Date().toISOString() })
    .eq('id', ctx.userId);
  if (error) reportAndRedirect('/onboarding', 'skipCalendar', error);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=sample');
}

// Step 3: Sample data
export async function loadSampleData() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error: seedErr } = await supabase.from('sample_data_seeds').insert({
    org_id: ctx.orgId,
    seed_kind: 'onboarding_demo',
    payload: { triggered_by: ctx.userId, at: now },
    applied_by: ctx.userId,
  });

  if (seedErr && !isUniqueViolation(seedErr)) {
    reportAndRedirect('/onboarding', 'loadSampleData.seed.insert', seedErr);
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ sample_data_loaded_at: now, sample_skipped_at: null })
    .eq('id', ctx.userId);
  if (updateErr) reportAndRedirect('/onboarding', 'loadSampleData.users.update', updateErr);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=done');
}

export async function skipSampleData() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('users')
    .update({ sample_skipped_at: new Date().toISOString() })
    .eq('id', ctx.userId);
  if (error) reportAndRedirect('/onboarding', 'skipSampleData', error);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=done');
}

export async function completeOnboarding() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('users')
    .select(
      'terms_consented_at, privacy_acknowledged_at, calendar_connected_at, calendar_skipped_at',
    )
    .eq('id', ctx.userId)
    .maybeSingle();
  if (error || !data) reportAndRedirect('/onboarding', 'completeOnboarding.users.select', error);

  const ev = evaluateCompletion({
    terms_consented_at: (data as { terms_consented_at: string | null }).terms_consented_at,
    privacy_acknowledged_at: (data as { privacy_acknowledged_at: string | null })
      .privacy_acknowledged_at,
    calendar_connected_at: (data as { calendar_connected_at: string | null })
      .calendar_connected_at,
    calendar_skipped_at: (data as { calendar_skipped_at: string | null }).calendar_skipped_at,
  });
  if (!ev.ok) redirect(`/onboarding?error=${ev.code}`);

  const { error: updateErr } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.userId);
  if (updateErr) reportAndRedirect('/onboarding', 'completeOnboarding.users.update', updateErr);

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

// Withdraw (GDPR Art.7(3))
export async function withdrawConsent(formData: FormData) {
  const parsed = parseWithdrawForm(formData);
  if (!parsed) {
    redirect('/settings/privacy?error=invalid_input');
  }

  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('consent_logs')
    .update({ withdrawn_at: now })
    .eq('user_id', ctx.userId)
    .eq('consent_type', parsed.consent_type)
    .is('withdrawn_at', null);
  if (error) reportAndRedirect('/settings/privacy', 'withdrawConsent.consent_logs.update', error);

  const usersPatch =
    parsed.consent_type === 'terms_of_service'
      ? { terms_consented_at: null }
      : { privacy_acknowledged_at: null };
  await supabase.from('users').update(usersPatch).eq('id', ctx.userId);
  await supabase.from('users').update({ onboarded_at: null }).eq('id', ctx.userId);

  revalidatePath('/settings/privacy');
  redirect('/settings/privacy?status=withdrawn');
}
