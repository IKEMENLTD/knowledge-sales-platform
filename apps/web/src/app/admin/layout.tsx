import { ProtectedShell } from '@/components/layout/protected-shell';
import type { ReactNode } from 'react';

/**
 * /admin/** は admin role 必須。requireUser({ role: 'admin' }) で /403 へリダイレクト。
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell role="admin">{children}</ProtectedShell>;
}
