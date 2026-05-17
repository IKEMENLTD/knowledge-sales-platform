'use client';

import { SubmitButton } from '@/components/ui/submit-button';
import { completeOnboarding } from '@/lib/auth/onboarding';
import { ArrowRight, Check, Minus } from 'lucide-react';

type Props = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  calendarConnected: boolean;
  calendarSkipped: boolean;
  sampleLoaded: boolean;
  sampleSkipped: boolean;
};

export function StepDone({
  termsAccepted,
  privacyAccepted,
  calendarConnected,
  calendarSkipped,
  sampleLoaded,
  sampleSkipped,
}: Props) {
  const items: Array<{
    label: string;
    status: 'done' | 'skipped' | 'pending';
    optional?: boolean;
  }> = [
    { label: '利用規約に同意', status: termsAccepted ? 'done' : 'pending' },
    { label: 'プライバシーポリシーに同意', status: privacyAccepted ? 'done' : 'pending' },
    {
      label: 'Google カレンダー連携',
      status: calendarConnected ? 'done' : calendarSkipped ? 'skipped' : 'pending',
    },
    {
      label: 'サンプルデータ投入',
      status: sampleLoaded ? 'done' : sampleSkipped ? 'skipped' : 'pending',
      optional: true,
    },
  ];

  const allRequiredDone =
    termsAccepted && privacyAccepted && (calendarConnected || calendarSkipped);

  return (
    <form action={completeOnboarding} className="space-y-6 relative">
      <div
        aria-hidden
        className="absolute -top-4 right-0 inkan size-14 rotate-3 text-2xl font-display select-none"
      >
        了
      </div>

      <header className="space-y-2 pr-16">
        <p className="kicker">SETUP COMPLETE — お疲れさまでした</p>
        <h2 className="display text-3xl md:text-4xl font-semibold tracking-crisp">
          準備が、整いました。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          ホームに戻り、最初の商談・名刺を記録するところから始めましょう。
        </p>
      </header>

      <ul
        aria-label="セットアップの状態"
        className="rounded-xl border border-border/70 bg-card shadow-sumi-sm divide-y divide-border/60 overflow-hidden"
      >
        {items.map((item) => {
          const isDone = item.status === 'done';
          const isSkipped = item.status === 'skipped';
          const isPending = item.status === 'pending';

          return (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 p-4"
              aria-label={`${item.label} — ${isDone ? '完了' : isSkipped ? 'スキップ (任意)' : '未完了'}`}
            >
              <span className="flex items-center gap-3 text-sm">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    isDone
                      ? 'bg-chitose text-chitose-foreground'
                      : isSkipped
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-destructive/10 text-destructive border border-destructive/40'
                  }`}
                  aria-hidden
                >
                  {isDone ? (
                    <Check strokeWidth={2.5} className="size-3.5" />
                  ) : isSkipped ? (
                    <Minus strokeWidth={2.5} className="size-3.5" />
                  ) : (
                    <span className="text-[10px] font-display font-semibold">!</span>
                  )}
                </span>
                <span className={isPending ? 'text-destructive' : 'text-foreground'}>
                  {item.label}
                  {item.optional ? <span className="ml-2 kicker">任意</span> : null}
                </span>
              </span>
              <span className="kicker">{isDone ? '完了' : isSkipped ? 'スキップ' : '未完了'}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end pt-2">
        <SubmitButton
          variant="cinnabar"
          size="xl"
          pendingLabel="完了処理中…"
          disabled={!allRequiredDone}
        >
          ホームへ進む
          <ArrowRight aria-hidden className="size-4" />
        </SubmitButton>
      </div>
    </form>
  );
}
