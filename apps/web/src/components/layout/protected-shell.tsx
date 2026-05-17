import { type UserRole, requireUser } from '@/lib/auth/server';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';

/**
 * 認証必須セクション用ラッパ。
 * `requireUser({ role })` で role gate を実装、AppShell でレイアウト適用。
 */
export async function ProtectedShell({
  children,
  role,
  bottomActionBar,
}: {
  children: ReactNode;
  role?: UserRole;
  bottomActionBar?: ReactNode;
}) {
  const user = await requireUser({ role });
  return (
    <AppShell user={user} bottomActionBar={bottomActionBar}>
      {children}
    </AppShell>
  );
}
