import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped';

export type Step = {
  id: 'consent' | 'calendar' | 'sample' | 'done';
  label: string;
  status: StepStatus;
};

/**
 * Editorial stepper — № NN 形式 + cinnabar active + chitose done。
 * Progress bar の代わりに数字付きノード + hairline 連結。
 */
export function OnboardingStepper({ steps }: { steps: Step[] }) {
  const visibleSteps = steps.filter((s) => s.id !== 'done');
  return (
    <nav aria-label="セットアップ進捗" className="mb-8">
      <ol className="flex items-center gap-0">
        {visibleSteps.map((step, idx) => {
          const isLast = idx === visibleSteps.length - 1;
          const isDone = step.status === 'done' || step.status === 'skipped';
          const isActive = step.status === 'active';
          return (
            <li key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div
                  className={cn(
                    'relative flex size-9 items-center justify-center rounded-full border-2 transition-colors duration-fast ease-sumi',
                    isDone &&
                      'border-chitose bg-chitose text-chitose-foreground',
                    isActive && 'border-cinnabar bg-cinnabar text-cinnabar-foreground',
                    !isDone &&
                      !isActive &&
                      'border-border bg-card text-muted-foreground',
                  )}
                >
                  {isDone ? (
                    <Check aria-hidden strokeWidth={2.5} className="size-4" />
                  ) : (
                    <span className="display tabular text-sm font-semibold">
                      {(idx + 1).toString().padStart(2, '0')}
                    </span>
                  )}
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full ring-4 ring-cinnabar/20 animate-pulse-ink"
                    />
                  ) : null}
                </div>
                <span
                  className={cn(
                    'text-[11px] font-medium tracking-crisp text-center leading-tight max-w-[90px]',
                    isActive
                      ? 'text-foreground'
                      : isDone
                        ? 'text-foreground/80'
                        : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast ? (
                <div
                  aria-hidden
                  className={cn(
                    'flex-1 h-px transition-colors duration-fast ease-sumi -mt-6',
                    isDone ? 'bg-chitose/60' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
