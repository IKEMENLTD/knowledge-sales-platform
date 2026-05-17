import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * OCR フィールド信頼度を 3 段階で可視化する小さい chip。
 *
 *   high (>= 0.95) — 緑 (chitose)。「読み取りに自信あり」
 *   mid  (0.70-0.94) — amber。 「目視確認推奨」
 *   low  (< 0.70) — cinnabar。「ほぼ要修正」
 *
 * confidence が undefined の場合は何も描画しない (= 該当フィールドの OCR 出力無し)。
 */
export type ConfidenceTier = 'high' | 'mid' | 'low';

export function tierOf(confidence: number | null | undefined): ConfidenceTier | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  if (confidence >= 0.95) return 'high';
  if (confidence >= 0.7) return 'mid';
  return 'low';
}

const TIER_CFG: Record<
  ConfidenceTier,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  high: {
    label: '高',
    className: 'border-chitose/40 bg-chitose-muted/30 text-chitose',
    Icon: CheckCircle2,
  },
  mid: {
    label: '中',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Icon: AlertCircle,
  },
  low: {
    label: '低',
    className: 'border-cinnabar/40 bg-cinnabar/8 text-cinnabar',
    Icon: AlertCircle,
  },
};

export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: number | null | undefined;
  className?: string;
}) {
  const tier = tierOf(confidence);
  if (!tier) return null;
  const { label, className: tierClass, Icon } = TIER_CFG[tier];
  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[10px] font-medium tracking-wide',
        'whitespace-nowrap shrink-0 tabular',
        tierClass,
        className,
      )}
      aria-label={`OCR 信頼度 ${label} (${pct}%)`}
      title={`OCR 信頼度: ${pct}%`}
    >
      <Icon aria-hidden strokeWidth={1.6} className="size-3" />
      {label} {pct}%
    </span>
  );
}
