import type { ReactNode } from 'react';
import { ProtectedShell } from '@/components/layout/protected-shell';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
