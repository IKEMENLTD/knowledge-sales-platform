import { cn } from '@/lib/utils';

/**
 * KSP Brand Mark — "K" letterform + inkan (落款) accent square.
 *
 * 思想: editorial industrial Japanese
 *   - "K" は3ストロークでミニマル
 *   - 右下に朱の落款四角 (inkan) で 営業=活動 のメタファ
 *   - Mark-only (favicon, avatar) と Wordmark (header) の2 variant
 */

type LogoMarkProps = {
  className?: string;
  size?: number;
  /** "ink" = primary on cream / "cream" = inverse / "currentColor" = ヘッダー等で context override */
  tone?: 'ink' | 'cream' | 'currentColor';
  /** inkan を抑制 (favicon の超小サイズ等) */
  noInkan?: boolean;
  ariaLabel?: string;
};

export function LogoMark({
  className,
  size = 32,
  tone = 'ink',
  noInkan = false,
  ariaLabel = 'Knowledge Sales Platform',
}: LogoMarkProps) {
  const fg =
    tone === 'currentColor'
      ? 'currentColor'
      : tone === 'cream'
        ? 'hsl(var(--primary-foreground))'
        : 'hsl(var(--primary))';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      className={cn('block', className)}
    >
      {/* K letterform — 太めの sumi ストロークで */}
      <g fill={fg}>
        {/* Vertical stroke */}
        <rect x="6" y="6" width="3.6" height="20" rx="0.6" />
        {/* Upper diagonal */}
        <path d="M11.4 16 L21 6 L24 6 L13.4 16.8 Z" />
        {/* Lower diagonal */}
        <path d="M13.4 15.2 L24 26 L21 26 L11.4 16 Z" />
      </g>
      {/* Inkan (落款) — 朱の小四角 */}
      {!noInkan ? (
        <rect
          x="22.5"
          y="22.5"
          width="6"
          height="6"
          rx="0.5"
          fill="hsl(var(--cinnabar))"
        />
      ) : null}
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** "compact" = mark + ksp / "full" = mark + ksp + tagline */
  variant?: 'compact' | 'full';
  tone?: 'ink' | 'cream' | 'currentColor';
};

export function Logo({ className, variant = 'compact', tone = 'currentColor' }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <LogoMark size={26} tone={tone} ariaLabel="Knowledge Sales Platform" />
      <span className="display flex items-baseline gap-1.5 text-[0.95rem] font-semibold tracking-crisp">
        <span>ksp</span>
        {variant === 'full' ? (
          <>
            <span aria-hidden className="text-muted-foreground/60 font-normal">/</span>
            <span className="kicker">Knowledge × Sales</span>
          </>
        ) : null}
      </span>
    </span>
  );
}
