'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type NavItem = {
  href: string;
  label: string;
  /** admin role 限定など (display gate, 実際のガードは layout 側 requireUser({role}) で行う) */
  requireRole?: 'manager' | 'admin';
};

/**
 * usePathname() で aria-current="page" を付与 (21_a11y_i18n)
 */
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション" className="hidden md:flex items-center gap-1">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'px-3 py-2 text-sm font-medium rounded-md transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
