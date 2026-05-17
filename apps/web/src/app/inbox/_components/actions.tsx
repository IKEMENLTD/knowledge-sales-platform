import { markAllNotificationsRead, markNotificationRead, retrySync } from '../actions';
import type { ReactNode } from 'react';

/**
 * Inbox の Server Action 呼び出し form を 1 ファイルに集約。
 *   - すべて `'use server'` 経由なので、CSRF 対策は Next.js の Server Action token で自動。
 *   - フォーム submit 後 `revalidatePath('/inbox')` で SSR を再描画する。
 *
 * 分離理由: page.tsx (Server Component) からは普通の <form action={action}> として使い、
 *   client interactivity 不要。styling は children に委ねる。
 */
export function MarkReadForm({
  notificationId,
  children,
}: {
  notificationId: string;
  children: ReactNode;
}) {
  return (
    <form action={markNotificationRead}>
      <input type="hidden" name="notificationId" value={notificationId} />
      {children}
    </form>
  );
}

export function MarkAllReadForm({ children }: { children: ReactNode }) {
  return <form action={markAllNotificationsRead}>{children}</form>;
}

export function RetrySyncForm({
  notificationId,
  children,
}: {
  notificationId: string;
  children: ReactNode;
}) {
  return (
    <form action={retrySync}>
      <input type="hidden" name="notificationId" value={notificationId} />
      {children}
    </form>
  );
}
