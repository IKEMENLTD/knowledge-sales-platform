'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import {
  PRIVACY_HASH,
  PRIVACY_VERSION,
  TERMS_HASH,
  TERMS_VERSION,
} from '@/lib/onboarding/policy-document';
import { createServerClient } from '@/lib/supabase/server';

type AuthContext = {
  userId: string;
  orgId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

class OnboardingError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

const isPostgresPermissionDenied = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === '42501';

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === '23505';

function safeIp(h: Headers): string | null {
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip');
}

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

function mapErrorToParam(e: unknown): string {
  if (e instanceof OnboardingError) return e.code;
  if (isPostgresPermissionDenied(e)) return 'permission_denied';
  if (isUniqueViolation(e)) return 'already_done';
  return 'save_failed';
}

// Step 1: 利用規約 + プライバシーポリシー同意
const ConsentInput = z.object({
  agree_terms: z.union([z.literal('on'), z.literal('true')]),
  agree_privacy: z.union([z.literal('on'), z.literal('true')]),
});

export async function acceptTerms(formData: FormData) {
  const parsed = ConsentInput.safeParse({
    agree_terms: formData.get('agree_terms'),
    agree_privacy: formData.get('agree_privacy'),
  });
  if (!parsed.success) {
    redirect('/onboarding?error=consent_required');
  }

  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase
    .from('consent_logs')
    .upsert(
      [
        {
          user_id: ctx.userId,
          org_id: ctx.orgId,
          consent_type: 'terms_of_service',
          version: TERMS_VERSION,
          content_hash: TERMS_HASH,
          accepted_at: now,
          ip_address: ctx.ipAddress,
          user_agent: ctx.userAgent,
        },
        {
          user_id: ctx.userId,
          org_id: ctx.orgId,
          consent_type: 'privacy_policy',
          version: PRIVACY_VERSION,
          content_hash: PRIVACY_HASH,
          accepted_at: now,
          ip_address: ctx.ipAddress,
          user_agent: ctx.userAgent,
        },
      ],
      { onConflict: 'user_id,consent_type,version', ignoreDuplicates: true },
    );
  if (insertErr) {
    redirect(`/onboarding?error=${mapErrorToParam(insertErr)}`);
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ terms_consented_at: now, privacy_acknowledged_at: now })
    .eq('id', ctx.userId);
  if (updateErr) {
    redirect(`/onboarding?error=${mapErrorToParam(updateErr)}`);
  }

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
  if (updateErr) {
    redirect(`/onboarding?error=${mapErrorToParam(updateErr)}`);
  }

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
  if (error) {
    redirect(`/onboarding?error=${mapErrorToParam(error)}`);
  }

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
    redirect(`/onboarding?error=${mapErrorToParam(seedErr)}`);
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ sample_data_loaded_at: now, sample_skipped_at: null })
    .eq('id', ctx.userId);
  if (updateErr) {
    redirect(`/onboarding?error=${mapErrorToParam(updateErr)}`);
  }

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
  if (error) {
    redirect(`/onboarding?error=${mapErrorToParam(error)}`);
  }

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
  if (error || !data) {
    redirect('/onboarding?error=save_failed');
  }

  if (!data.terms_consented_at || !data.privacy_acknowledged_at) {
    redirect('/onboarding?error=incomplete');
  }

  if (!data.calendar_connected_at && !data.calendar_skipped_at) {
    redirect('/onboarding?error=calendar_incomplete');
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.userId);
  if (updateErr) {
    redirect(`/onboarding?error=${mapErrorToParam(updateErr)}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

// Withdraw (GDPR Art.7(3))
const WithdrawInput = z.object({
  consent_type: z.enum(['terms_of_service', 'privacy_policy']),
});

export async function withdrawConsent(formData: FormData) {
  const parsed = WithdrawInput.safeParse({
    consent_type: formData.get('consent_type'),
  });
  if (!parsed.success) {
    redirect('/settings/privacy?error=invalid_input');
  }

  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('consent_logs')
    .update({ withdrawn_at: now })
    .eq('user_id', ctx.userId)
    .eq('consent_type', parsed.data.consent_type)
    .is('withdrawn_at', null);
  if (error) {
    redirect(`/settings/privacy?error=${mapErrorToParam(error)}`);
  }

  const usersPatch =
    parsed.data.consent_type === 'terms_of_service'
      ? { terms_consented_at: null }
      : { privacy_acknowledged_at: null };
  await supabase.from('users').update(usersPatch).eq('id', ctx.userId);
  await supabase.from('users').update({ onboarded_at: null }).eq('id', ctx.userId);

  revalidatePath('/settings/privacy');
  redirect('/settings/privacy?status=withdrawn');
}
