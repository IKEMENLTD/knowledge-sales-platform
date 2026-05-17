import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/auth/server';
import type { ReactNode } from 'react';

/**
 * 認証必須レイアウト。
 * 配下の `/dashboard`, `/contacts`, `/meetings`, `/recordings`, `/search`, `/admin`,
 * `/settings`, `/mobile`, `/onboarding` で共通利用したいが、
 * Next.js のディレクトリ単位なので各セクション側で AppShell をラップしてもよい。
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
