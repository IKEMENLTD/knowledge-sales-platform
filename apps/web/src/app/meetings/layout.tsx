import type { ReactNode } from 'react';
import { ProtectedShell } from '@/components/layout/protected-shell';

export default function MeetingsLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
