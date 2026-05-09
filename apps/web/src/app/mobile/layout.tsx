import type { ReactNode } from 'react';
import { ProtectedShell } from '@/components/layout/protected-shell';

/**
 * /mobile/** は片手UIを意識した縦長レイアウト。AppShell 上の bottom_action_bar を活用。
 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
