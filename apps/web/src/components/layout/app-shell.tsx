import { Logo } from '@/components/brand/logo';
import { signOut } from '@/lib/auth/actions';
import type { AppUser } from '@/lib/auth/server';
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
 * Editorial app shell.
 *  - sticky header + cream paper background
 *  - safe-area-inset-top で notch 配慮
 *  - HeaderNav (md+) + MobileBottomNav (sm only)
 *  - bottomActionBar slot は ページ固有 1〜2 アクション用 (片手UI)
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
