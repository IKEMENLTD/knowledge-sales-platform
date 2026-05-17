import { ProtectedShell } from '@/components/layout/protected-shell';
import type { ReactNode } from 'react';

/**
 * /inbox/** は名寄せ衝突・通知などの未処理タスク受信箱。
 * Phase1 W3 で SC-74 (会社統合衝突一覧) 等を順次追加。
 */
export default function InboxLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
