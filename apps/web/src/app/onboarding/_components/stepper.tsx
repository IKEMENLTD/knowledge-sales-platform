import { Check, Pause } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped';

export type Step = {
  id: 'consent' | 'calendar' | 'sample' | 'done';
  label: string;
  status: StepStatus;
};

/**
 * Editorial stepper —
 *  - done: chitose green + 戻り Link (再編集可能)
 *  - active: cinnabar + pulse-ink ring
 *  - skipped: muted + Pause icon (任意ステップで skip 済)
 *  - pending: gray
 *  - aria-current="step" を active item に付与
 */
export function OnboardingStepper({ steps }: { steps: Step[] }) {
  // 4 step 含めて表示 (Step 4 = 完了)
  return (
    <nav aria-label="セットアップ進捗" className="mb-8">
      <ol className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isDone = step.status === 'done';
          const isActive = step.status === 'active';
          const isSkipped = step.status === 'skipped';
          const isComplete = isDone || isSkipped;
          const number = (idx + 1).toString().padStart(2, '0');

          const node = (
            <div
              className={cn(
                'relative flex size-9 items-center justify-center rounded-full border-2 transition-colors duration-fast ease-sumi',
                isDone && 'border-chitose bg-chitose text-chitose-foreground',
                isSkipped && 'border-muted-foreground/50 bg-muted text-muted-foreground',
                isActive && 'border-cinnabar bg-cinnabar text-cinnabar-foreground',
                !isComplete && !isActive && 'border-border bg-card text-muted-foreground',
              )}
            >
              {isDone ? (
                <Check aria-hidden strokeWidth={2.5} className="size-4" />
              ) : isSkipped ? (
                <Pause aria-hidden strokeWidth={2.25} className="size-3.5" />
              ) : (
                <span className="display tabular text-sm font-semibold">{number}</span>
              )}
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full ring-4 ring-cinnabar/20 animate-pulse-ink"
                />
              ) : null}
            </div>
          );

          const labelEl = (
            <span
              className={cn(
                'text-xs font-medium tracking-crisp text-center leading-tight max-w-[96px]',
                isActive
                  ? 'text-foreground'
                  : isComplete
                    ? 'text-foreground/80'
                    : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          );

          return (
            <li
              key={step.id}
              className="flex items-center flex-1"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="flex flex-col items-center gap-2 flex-1">
                {/* done のみ Link で戻れる (active / pending / skipped はクリック不可) */}
                {isDone && step.id !== 'done' ? (
                  <Link
                    href={`/onboarding?step=${step.id}`}
                    aria-label={`${step.label} を再確認`}
                    className="rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar"
                  >
                    {node}
                  </Link>
                ) : (
                  node
                )}
                {labelEl}
              </div>
              {!isLast ? (
                <div
                  aria-hidden
                  className={cn(
                    'flex-1 h-px transition-colors duration-fast ease-sumi -mt-6',
                    isComplete ? 'bg-chitose/50' : 'bg-border',
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
