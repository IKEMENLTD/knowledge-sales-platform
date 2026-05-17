'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = {
  href: string;
  label: string;
  requireRole?: 'manager' | 'admin';
};

/**
 * Editorial header nav.
 *  - active: 下に 2px の cinnabar inset rule
 *  - hover: foreground 切替 + 背景は弱く
 *  - 44px+ tap target を維持
 */
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      id="site-nav"
      aria-label="メインナビゲーション"
      className="hidden md:flex items-center gap-0.5"
    >
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative inline-flex items-center justify-center min-h-11 px-3.5',
              'text-sm font-medium tracking-crisp',
              'rounded-md transition-colors duration-fast ease-sumi',
              'focus-visible:outline-none focus-visible:shadow-focus-ring',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
          >
            {item.label}
            {isActive ? (
              <span
                aria-hidden
                className="absolute bottom-0 left-3.5 right-3.5 h-[2px] bg-cinnabar rounded-full"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
