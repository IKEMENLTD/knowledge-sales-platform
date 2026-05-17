'use client';

import { cn } from '@/lib/utils';
import { Calendar, LayoutDashboard, Menu, ScanLine, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  primary?: boolean;
};

const TABS: readonly Tab[] = [
  { href: '/dashboard', label: 'ホーム', Icon: LayoutDashboard },
  { href: '/meetings', label: '商談', Icon: Calendar },
  { href: '/mobile/scan', label: '名刺', Icon: ScanLine, primary: true },
  { href: '/mobile/quick-lookup', label: '検索', Icon: Search },
  { href: '/settings', label: 'メニュー', Icon: Menu },
];

/**
 * モバイル底部タブナビゲーション。
 *  - 5 tabs: ホーム / 商談 / 名刺(中央 FAB) / 検索 / メニュー
 *  - safe-area-inset-bottom 対応
 *  - active tab に cinnabar の縦線アクセント
 *  - reach zone (画面下 1/3) 内に主操作を集約 (片手UI)
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      id="site-nav"
      aria-label="モバイル主要ナビゲーション"
      className={cn(
        'md:hidden fixed bottom-0 inset-x-0 z-30',
        'border-t border-border bg-background/92 backdrop-blur',
        'px-1 pt-1.5',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'shadow-[0_-4px_24px_-12px_hsl(var(--shadow-color)/0.18)]',
      )}
    >
      <ul className="grid grid-cols-5 items-stretch gap-0.5">
        {TABS.map(({ href, label, Icon, primary }) => {
          const active =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
          return (
            <li key={href} className="contents">
              <Link
                href={href as never}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5',
                  'min-h-[52px] rounded-lg',
                  'text-[11px] font-medium tracking-crisp',
                  'transition-colors duration-fast ease-sumi',
                  primary && 'mx-auto -mt-3',
                  primary
                    ? cn(
                        'h-12 w-12 rounded-full',
                        'bg-cinnabar text-cinnabar-foreground',
                        'shadow-cinnabar-glow',
                        'active:scale-95',
                      )
                    : active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground active:bg-accent/60',
                )}
              >
                {!primary && active ? <span aria-hidden className="nav-active-mark" /> : null}
                <Icon
                  aria-hidden
                  strokeWidth={primary ? 2 : 1.6}
                  className={cn(primary ? 'size-5' : 'size-[18px]')}
                />
                <span className={cn(primary && 'sr-only')}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
