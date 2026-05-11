'use client';

import { ArrowRight, Check } from 'lucide-react';
import { SubmitButton } from '@/components/ui/submit-button';
import { completeOnboarding } from '@/lib/auth/onboarding';

type Props = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  calendarConnected: boolean;
  sampleLoaded: boolean;
};

export function StepDone({
  termsAccepted,
  privacyAccepted,
  calendarConnected,
  sampleLoaded,
}: Props) {
  const items = [
    { label: '利用規約に同意', done: termsAccepted },
    { label: 'プライバシーポリシーに同意', done: privacyAccepted },
    { label: 'Google カレンダー連携', done: calendarConnected },
    { label: 'サンプルデータ投入', done: sampleLoaded, optional: true },
  ];

  return (
    <form action={completeOnboarding} className="space-y-6">
      <header className="space-y-2">
        <p className="kicker">セットアップ完了</p>
        <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          準備ができました。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          ホームに戻り、最初の商談・名刺を記録するところから始めましょう。
        </p>
      </header>

      <ul className="rounded-xl border border-border/70 bg-card shadow-sumi-sm divide-y divide-border/60 overflow-hidden">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 p-4"
          >
            <span className="flex items-center gap-3 text-sm">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                  item.done
                    ? 'bg-chitose text-chitose-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
                aria-hidden
              >
                <Check strokeWidth={2.5} className="size-3.5" />
              </span>
              <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
                {item.optional ? (
                  <span className="ml-2 kicker">任意</span>
                ) : null}
              </span>
            </span>
            <span className="kicker">{item.done ? '完了' : 'スキップ'}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-end pt-2">
        <SubmitButton variant="cinnabar" size="xl" pendingLabel="準備中…">
          ホームへ進む
          <ArrowRight aria-hidden className="size-4" />
        </SubmitButton>
      </div>
    </form>
  );
}
