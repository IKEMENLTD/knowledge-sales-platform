import { Logo } from '@/components/brand/logo';
import { signOut } from '@/lib/auth/actions';
import type { AppUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeaderNav, type NavItem } from './header-nav';
import { MobileBottomNav } from './mobile-bottom-nav';
import { SignOutButton } from './signout-button';
import { ThemeToggle } from './theme-toggle';

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'ホーム' },
  { href: '/contacts', label: '名刺' },
  { href: '/meetings', label: '商談' },
  { href: '/recordings', label: '録画' },
  { href: '/search', label: '検索' },
];

const ADMIN_ITEMS: NavItem[] = [{ href: '/admin/users', label: 'メンバー', requireRole: 'admin' }];

/**
 * Round2 P1 G-P1-4 fix:
 *   ヘッダ右上の通知 bell + 未読件数 badge。
 *   RLS notifications_self が user_id=auth.uid() を強制するので
 *   `count(*) where read_at is null` だけで自分宛の未読数になる。
 *   テーブル不在 (Phase1 初期環境) でも 0 を返す。
 */
async function fetchUnreadNotificationCount(): Promise<number> {
  try {
    const supabase = await createServerClient();
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Editorial app shell.
 *  - sticky header + cream paper background
 *  - safe-area-inset-top で notch 配慮
 *  - HeaderNav (md+) + MobileBottomNav (sm only)
 *  - bottomActionBar slot は ページ固有 1〜2 アクション用 (片手UI)
 */
export async function AppShell({
  user,
  children,
  bottomActionBar,
}: {
  user: AppUser;
  children: ReactNode;
  bottomActionBar?: ReactNode;
}) {
  const items = user.role === 'admin' ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;
  const unreadCount = await fetchUnreadNotificationCount();

  return (
    <div className="min-h-dvh flex flex-col" style={{ ['--app-header-h' as string]: '3.5rem' }}>
      <header
        className="sticky top-0 z-40 w-full pt-safe bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/72"
        style={{ boxShadow: 'inset 0 -1px 0 hsl(var(--border) / 0.6)' }}
      >
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-7">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:shadow-focus-ring"
              aria-label="Knowledge Sales Platform ホーム"
            >
              <Logo />
            </Link>
            <HeaderNav items={items} />
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className="hidden sm:inline-flex items-center text-sm text-muted-foreground truncate max-w-[180px]"
              title={user.email ?? undefined}
            >
              {user.fullName ?? user.email}
            </span>
            <span aria-hidden className="hidden sm:block h-5 w-px bg-border" />
            {/* Round2 P1 G-P1-4: 通知 bell + 未読 badge。md 以上のみ表示 (sm では bottom-nav 経由)。 */}
            <Link
              href="/inbox"
              className="hidden md:inline-flex relative items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:shadow-focus-ring transition-colors duration-fast ease-sumi"
              aria-label={
                unreadCount > 0 ? `受信箱 (未読 ${unreadCount} 件)` : '受信箱'
              }
            >
              <Bell aria-hidden strokeWidth={1.6} className="size-4" />
              {unreadCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-cinnabar text-cinnabar-foreground text-[10px] font-semibold tabular tracking-tight leading-none border-2 border-background"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </Link>
            <span aria-hidden className="hidden md:block h-5 w-px bg-border" />
            {/* UX Round1 Desktop MID-D-04: ThemeToggle (system / light / dark) */}
            <ThemeToggle className="hidden md:inline-flex" />
            <span aria-hidden className="hidden md:block h-5 w-px bg-border" />
            <form action={signOut}>
              <SignOutButton />
            </form>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 container pt-6 md:pt-8 pb-12 md:pb-12 outline-none pb-nav"
      >
        {children}
      </main>

      <MobileBottomNav />

      {bottomActionBar ? (
        <div
          className={[
            'md:hidden fixed bottom-[max(4.25rem,calc(4.25rem+env(safe-area-inset-bottom)))]',
            'inset-x-0 z-20 px-4 py-2.5',
            'flex items-center pointer-events-none',
            '[&>*]:pointer-events-auto',
          ].join(' ')}
          style={{ justifyContent: 'var(--bottom-action-bar-justify)' }}
          role="region"
          aria-label="ページアクション"
        >
          {bottomActionBar}
        </div>
      ) : null}
    </div>
  );
}
