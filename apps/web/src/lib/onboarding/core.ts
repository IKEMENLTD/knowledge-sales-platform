import { z } from 'zod';
import {
  PRIVACY_HASH,
  PRIVACY_VERSION,
  TERMS_HASH,
  TERMS_VERSION,
} from '@/lib/onboarding/policy-document';

/**
 * Pure 関数層 (DI 可能、Supabase / Next.js から完全独立)。
 * Architecture R2-O-01: server action は薄いアダプタにして、ロジックはここで unit test 可能にする。
 */

export const ConsentInput = z.object({
  agree_terms: z.union([z.literal('on'), z.literal('true')]),
  agree_privacy: z.union([z.literal('on'), z.literal('true')]),
});
export type ConsentInputT = z.infer<typeof ConsentInput>;

export const WithdrawInput = z.object({
  consent_type: z.enum(['terms_of_service', 'privacy_policy']),
});
export type WithdrawInputT = z.infer<typeof WithdrawInput>;

export type AuthContext = {
  userId: string;
  orgId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type ConsentRow = {
  user_id: string;
  org_id: string;
  consent_type: 'terms_of_service' | 'privacy_policy';
  version: string;
  content_hash: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
};

export function buildConsentRows(ctx: AuthContext, acceptedAt: string): ConsentRow[] {
  return [
    {
      user_id: ctx.userId,
      org_id: ctx.orgId,
      consent_type: 'terms_of_service',
      version: TERMS_VERSION,
      content_hash: TERMS_HASH,
      accepted_at: acceptedAt,
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
    },
    {
      user_id: ctx.userId,
      org_id: ctx.orgId,
      consent_type: 'privacy_policy',
      version: PRIVACY_VERSION,
      content_hash: PRIVACY_HASH,
      accepted_at: acceptedAt,
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
    },
  ];
}

export const isPostgresPermissionDenied = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === '42501';

export const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === '23505';

/**
 * IP 抽出を pure 関数化。テスト容易性のため Headers 引数を取る。
 */
export function safeIp(headers: { get(name: string): string | null }): string | null {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}

/**
 * Postgres error → URL safe error code。
 */
export function mapErrorToCode(e: unknown): string {
  if (isPostgresPermissionDenied(e)) return 'permission_denied';
  if (isUniqueViolation(e)) return 'already_done';
  return 'save_failed';
}

/**
 * 完了判定 (server action から呼ぶ): users 行から必須ステップが揃っているかを判定。
 */
export function evaluateCompletion(row: {
  terms_consented_at: string | null;
  privacy_acknowledged_at: string | null;
  calendar_connected_at: string | null;
  calendar_skipped_at: string | null;
}): { ok: true } | { ok: false; code: 'incomplete' | 'calendar_incomplete' } {
  if (!row.terms_consented_at || !row.privacy_acknowledged_at) {
    return { ok: false, code: 'incomplete' };
  }
  if (!row.calendar_connected_at && !row.calendar_skipped_at) {
    return { ok: false, code: 'calendar_incomplete' };
  }
  return { ok: true };
}

export function parseConsentForm(formData: FormData): ConsentInputT | null {
  const parsed = ConsentInput.safeParse({
    agree_terms: formData.get('agree_terms'),
    agree_privacy: formData.get('agree_privacy'),
  });
  return parsed.success ? parsed.data : null;
}

export function parseWithdrawForm(formData: FormData): WithdrawInputT | null {
  const parsed = WithdrawInput.safeParse({
    consent_type: formData.get('consent_type'),
  });
  return parsed.success ? parsed.data : null;
}
