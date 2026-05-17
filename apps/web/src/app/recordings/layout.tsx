import { ProtectedShell } from '@/components/layout/protected-shell';
import type { ReactNode } from 'react';

export default function RecordingsLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
