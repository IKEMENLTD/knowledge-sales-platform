import { env } from '@/lib/env';
import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_ORG_ID } from '@ksp/shared';
import { redirect } from 'next/navigation';

/**
 * Round1 cross-cutting P0-3 / X-2 fix:
 *   `requireUser()` / `requireApiUser()` の `public.users` lookup 失敗時 fallback
 *   (role=sales, isActive=true) は Phase1 初期の migration 未適用環境で `/dashboard`
 *   を起動可能にするための救済策だが、本番で role 列が NULL や fetch エラーを
 *   sales 権限として通すと「未登録ユーザに sales 権限」=「DB 列追加忘れで実質
 *   anonymous」のリスクが残る。
 *
 *   そのため production だけは fallback を「inactive 扱い」に降格し、
 *   `/403?reason=inactive` (web) または AuthError 403 (API) を返す。
 *   dev/test/preview では従来通り fallback (sales / active) を維持して
 *   ローカル開発を妨げない。
 */
function shouldUseInsecureFallback(): boolean {
  return env.NODE_ENV !== 'production';
}

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
  /**
   * cross-cutting P0-3 / X-2 fix:
   *   実際に `public.users` 行が取得できたかを追跡する。dev/test は従来通り
   *   fallback で前進、production は inactive 扱いで /403 に送る。
   */
  let userRowLoaded = false;

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
      userRowLoaded = true;
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
        userRowLoaded = true;
      }
    }
  } catch {
    // public.users 未生成 (migration 未適用) の Phase1 初期では fallback で動作させる
  }

  // cross-cutting P0-3 / X-2 fix:
  //   production で users 行が取れなかった場合 (migration 未適用 / DB 異常 / 招待前 auth user 等)、
  //   sales 権限で勝手に通すと「DB 列追加忘れで anonymous → sales 昇格」リスクが残るので
  //   inactive 扱いに格下げして /403 へ送る。dev/test は従来通り fallback。
  if (!userRowLoaded && !shouldUseInsecureFallback()) {
    redirect('/403?reason=inactive&detail=no_user_row');
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
  // cross-cutting P0-3 / X-2 fix: production では fallback (sales role) を許さない。
  let userRowLoaded = false;

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
      userRowLoaded = true;
    } else if (error) {
      // onboarded_at 列が無い (42703 undefined_column) 等で 1 次 SELECT が失敗した場合の最小列再試行。
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
        userRowLoaded = true;
      }
    }
  } catch {
    /* fallback */
  }

  // cross-cutting P0-3 / X-2 fix:
  //   production で users 行が無い場合は inactive 扱いで 403 を返す。
  if (!userRowLoaded && !shouldUseInsecureFallback()) {
    throw new AuthError(403, 'inactive', { reason: 'inactive', detail: 'no_user_row' });
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
