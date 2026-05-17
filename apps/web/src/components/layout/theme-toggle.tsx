'use client';

import { cn } from '@/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * UX Round1 Desktop MID-D-04 fix:
 *   next-themes は導入済だが切替 UI が無かった。Header 右端に置く 3-state toggle
 *   (system / light / dark) を追加。Sumi & Cinnabar editorial トーンに揃え、
 *   focus-visible / aria-pressed / role="radiogroup" で a11y 完備。
 */
const OPTIONS = [
  { value: 'system' as const, label: 'システム', Icon: Monitor },
  { value: 'light' as const, label: 'ライト', Icon: Sun },
  { value: 'dark' as const, label: 'ダーク', Icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // SSR/hydration ズレ回避: mount まで system 扱い
  const active = mounted ? (theme ?? 'system') : 'system';

  return (
    <div
      role="radiogroup"
      aria-label="表示テーマ"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-card/70 p-0.5',
        'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.5)]',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${label}テーマ`}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center justify-center size-8 rounded-[5px]',
              'text-muted-foreground transition-colors duration-fast ease-sumi',
              'focus-visible:outline-none focus-visible:shadow-focus-ring',
              isActive
                ? 'bg-foreground text-background shadow-sumi-sm'
                : 'hover:text-foreground hover:bg-accent/40',
            )}
          >
            <Icon aria-hidden strokeWidth={1.6} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
