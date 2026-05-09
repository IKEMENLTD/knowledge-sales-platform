import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

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
  const metaName = (user.user_metadata?.full_name ?? null) as string | null;
  let fullName: string | null = metaName;
  let onboardedAt: Date | null = null;

  try {
    // onboarded_at 列がまだ無い環境でも落ちないよう、まず onboarded_at 込みで試す。
    const { data, error } = await supabase
      .from('users')
      .select('role,is_active,full_name,onboarded_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      role = ((data as Record<string, unknown>).role as UserRole) ?? 'sales';
      isActive = ((data as Record<string, unknown>).is_active as boolean | null) ?? true;
      fullName = ((data as Record<string, unknown>).full_name as string | null) ?? fullName;
      const rawOnboardedAt = (data as Record<string, unknown>).onboarded_at;
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
        .select('role,is_active,full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (!fallback.error && fallback.data) {
        role = (fallback.data.role as UserRole) ?? 'sales';
        isActive = fallback.data.is_active ?? true;
        fullName = (fallback.data.full_name as string | null) ?? fullName;
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
    onboardedAt,
  };
}
