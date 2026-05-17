import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_ORG_ID } from '@ksp/shared';
import { redirect } from 'next/navigation';

/**
 * `public.users.role` enum と整合させる (packages/db/src/schema/users.ts)。
 * Phase1 では sales / cs / manager / admin / legal の 5 つ。
 */
export type UserRole = 'sales' | 'cs' | 'manager' | 'admin' | 'legal';

export type AppUser = {
  id: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  fullName: string | null;
  /**
   * Round3 Security HIGH-S-05/06/07 fix:
   *   各 callsite に DEFAULT_ORG_ID を hardcode していたのを撤去。
   *   `public.users.org_id` を SELECT して AppUser に詰める。
   *   Phase1 はシングルテナント = 全 user 同じ org_id を持つ前提。
   *   Phase2 マルチテナント cutover 時に GUC SET LOCAL を middleware で強制する。
   */
  orgId: string;
  /**
   * 19_onboarding_initial: オンボーディング完了日時。
   * `public.users.onboarded_at` 列が未生成の環境では null fallback。
   * 列の追加 migration は GROUP A2 が担当 (Phase1 W1 終盤)。
   */
  onboardedAt: Date | null;
};

/** role gate の比較用ランク。manager/admin 以外は同列扱い。 */
const ROLE_RANK: Record<UserRole, number> = {
  sales: 1,
  cs: 1,
  legal: 1,
  manager: 2,
  admin: 3,
};

export async function getUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Supabase Auth ユーザに加え、`public.users` テーブルから role / is_active を取得する。
 * 未登録 / 非活性の場合は /403 へ。
 *
 * @param options.role 必要最低 role を指定すると不足時 /403 redirect
 */
export async function requireUser(options?: { role?: UserRole }): Promise<AppUser> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // public.users から role を引く。未マイグレーション環境では sales fallback で動かす。
  let role: UserRole = 'sales';
  let isActive = true;
  let orgId: string = DEFAULT_ORG_ID;
  const metaName = (user.user_metadata?.full_name ?? null) as string | null;
  let fullName: string | null = metaName;
  let onboardedAt: Date | null = null;

  try {
    // onboarded_at 列がまだ無い環境でも落ちないよう、まず onboarded_at 込みで試す。
    const { data, error } = await supabase
      .from('users')
      .select('role,is_active,name,org_id,onboarded_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      const d = data as Record<string, unknown>;
      role = (d.role as UserRole) ?? 'sales';
      isActive = (d.is_active as boolean | null) ?? true;
      fullName = (d.name as string | null) ?? fullName;
      orgId = (d.org_id as string | null) ?? DEFAULT_ORG_ID;
      const rawOnboardedAt = d.onboarded_at;
      if (typeof rawOnboardedAt === 'string') {
        const parsed = new Date(rawOnboardedAt);
        if (!Number.isNaN(parsed.getTime())) {
          onboardedAt = parsed;
        }
      } else if (rawOnboardedAt instanceof Date) {
        onboardedAt = rawOnboardedAt;
      }
    } else if (error) {
      // onboarded_at 列が無い (42703 undefined_column 等) 場合は最小列で再試行。
      const fallback = await supabase
        .from('users')
        .select('role,is_active,name,org_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!fallback.error && fallback.data) {
        const d = fallback.data as Record<string, unknown>;
        role = (d.role as UserRole) ?? 'sales';
        isActive = (d.is_active as boolean | null) ?? true;
        fullName = (d.name as string | null) ?? fullName;
        orgId = (d.org_id as string | null) ?? DEFAULT_ORG_ID;
      }
    }
  } catch {
    // public.users 未生成 (migration 未適用) の Phase1 初期では fallback で動作させる
  }

  if (!isActive) {
    redirect('/403?reason=inactive');
  }

  if (options?.role && ROLE_RANK[role] < ROLE_RANK[options.role]) {
    redirect(`/403?reason=role&need=${options.role}`);
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    isActive,
    fullName,
    orgId,
    onboardedAt,
  };
}

/**
 * Round 2 Security CRITICAL-S-03 fix:
 *   API Route Handler 内で `requireUser()` を呼ぶと `redirect()` が internal な
 *   NEXT_REDIRECT exception を投げ、`defineRoute` の try-catch が 500 + redirect
 *   target leak を起こしていた。API 用には redirect ではなく throw を返す変種を
 *   用意し、defineRoute 側で 401/403 JSON にマッピングする。
 */
export class AuthError extends Error {
  override readonly name = 'AuthError';
  constructor(
    readonly status: 401 | 403,
    readonly code: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function requireApiUser(options?: { role?: UserRole }): Promise<AppUser> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthError(401, 'unauthorized');
  }

  let role: UserRole = 'sales';
  let isActive = true;
  let orgId: string = DEFAULT_ORG_ID;
  const metaName = (user.user_metadata?.full_name ?? null) as string | null;
  let fullName: string | null = metaName;
  let onboardedAt: Date | null = null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('role,is_active,name,org_id,onboarded_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      const d = data as Record<string, unknown>;
      role = (d.role as UserRole) ?? 'sales';
      isActive = (d.is_active as boolean | null) ?? true;
      fullName = (d.name as string | null) ?? fullName;
      orgId = (d.org_id as string | null) ?? DEFAULT_ORG_ID;
      const rawOnboardedAt = d.onboarded_at;
      if (typeof rawOnboardedAt === 'string') {
        const parsed = new Date(rawOnboardedAt);
        if (!Number.isNaN(parsed.getTime())) onboardedAt = parsed;
      } else if (rawOnboardedAt instanceof Date) {
        onboardedAt = rawOnboardedAt;
      }
    }
  } catch {
    /* fallback */
  }

  if (!isActive) {
    throw new AuthError(403, 'inactive', { reason: 'inactive' });
  }
  if (options?.role && ROLE_RANK[role] < ROLE_RANK[options.role]) {
    throw new AuthError(403, 'forbidden', { reason: 'role', need: options.role });
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    isActive,
    fullName,
    orgId,
    onboardedAt,
  };
}
