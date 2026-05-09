import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/lib/auth/actions';
import type { AppUser } from '@/lib/auth/server';
import { HeaderNav, type NavItem } from './header-nav';

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'ダッシュボード' },
  { href: '/contacts/import', label: '名刺取込' },
  { href: '/meetings', label: '商談' },
  { href: '/recordings', label: '録画' },
  { href: '/search', label: '検索' },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin/users', label: 'ユーザ管理', requireRole: 'admin' },
];

/**
 * 認証済み画面の共通シェル。
 * - ヘッダー: ロゴ / ナビ / ユーザメニュー (signout)
 * - main#main-content: skip-link 受け
 * - bottomActionBar slot: 17_offline_mobile の片手UI bottom_action_bar 用 (モバイル)
 */
export function AppShell({
  user,
  children,
  bottomActionBar,
}: {
  user: AppUser;
  children: ReactNode;
  bottomActionBar?: ReactNode;
}) {
  const items = user.role === 'admin' ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold tracking-tight"
              aria-label="Knowledge Sales Platform ホーム"
            >
              <span aria-hidden className="inline-block h-6 w-6 rounded bg-primary" />
              <span>KSP</span>
            </Link>
            <HeaderNav items={items} />
          </div>

          <div className="flex items-center gap-3">
            <span
              className="hidden sm:inline-block text-sm text-muted-foreground truncate max-w-[160px]"
              title={user.email ?? undefined}
            >
              {user.fullName ?? user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="サインアウト"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                サインアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 container py-6 md:py-8 outline-none pb-24 md:pb-8"
      >
        {children}
      </main>

      {bottomActionBar ? (
        <div
          // 片手UI bottom_action_bar - 17_offline_mobile
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          role="region"
          aria-label="モバイルアクションバー"
        >
          {bottomActionBar}
        </div>
      ) : null}
    </div>
  );
}
