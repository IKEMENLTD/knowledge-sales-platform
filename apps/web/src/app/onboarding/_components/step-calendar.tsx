'use client';

import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { connectCalendar, skipCalendar } from '@/lib/auth/onboarding';
import { Calendar, CheckCircle2 } from 'lucide-react';

type Props = {
  alreadyConnected: boolean;
  hasCalendarScope: boolean;
};

export function StepCalendar({ alreadyConnected, hasCalendarScope }: Props) {
  const Connected = (
    <div className="rounded-lg border border-chitose/40 bg-chitose-muted/30 p-5 flex items-start gap-4">
      <CheckCircle2 aria-hidden strokeWidth={1.6} className="size-5 shrink-0 mt-0.5 text-chitose" />
      <div className="flex-1">
        <p className="display text-sm font-semibold tracking-crisp text-chitose">
          Google カレンダーと連携済みです。
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          今日以降の商談予定がホームに自動表示されます。連携を解除したいときは「設定」画面から行えます。
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="kicker">Step 02 — Google カレンダー</p>
        <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          今日の商談予定を、ホームに自動表示する。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          Google カレンダーから商談の予定 (calendar.events) のみを読み取ります。Gmail や Drive
          へのアクセスは行いません。
        </p>
      </header>

      {alreadyConnected || hasCalendarScope ? Connected : null}

      <div className="rounded-xl border border-border/70 bg-card shadow-sumi-sm p-5 md:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Calendar
            aria-hidden
            strokeWidth={1.4}
            className="size-6 shrink-0 mt-0.5 text-cinnabar"
          />
          <div className="flex-1">
            <p className="display text-base font-semibold tracking-crisp">取得する情報</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>・カレンダーの予定 (タイトル / 日時 / 出席者 / 会議URL)</li>
              <li>・予定の更新通知 (新規作成・変更・キャンセル)</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground border-l-2 border-cinnabar/60 pl-3 py-1">
              情報は社外に共有されません。ksp 内で商談・名刺・録画と紐づけるためだけに使われます。
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <form action={skipCalendar}>
          <Button type="submit" variant="ghost" size="lg">
            あとで連携する
          </Button>
        </form>
        <form action={connectCalendar}>
          <SubmitButton variant="cinnabar" size="lg" pendingLabel="連携中…">
            {alreadyConnected || hasCalendarScope ? '次へ進む' : 'Google カレンダーを連携する'}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
