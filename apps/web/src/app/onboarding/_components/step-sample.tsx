'use client';

import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { loadSampleData, skipSampleData } from '@/lib/auth/onboarding';
import { Database, Sparkles } from 'lucide-react';

type Props = {
  alreadyLoaded: boolean;
};

export function StepSample({ alreadyLoaded }: Props) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="kicker">Step 03 — サンプルデータ (任意)</p>
        <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          実データの前に、ダミーで触ってみる。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          サンプル商談 3 件・名刺 5 件・録画 2 件を一時的に入れます。あとから一括で消せます。
        </p>
      </header>

      <div className="rounded-xl border border-border/70 bg-card shadow-sumi-sm p-5 md:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Database
            aria-hidden
            strokeWidth={1.6}
            className="size-6 shrink-0 mt-0.5 text-cinnabar"
          />
          <div className="flex-1">
            <p className="display text-base font-semibold tracking-crisp">入るもの</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>・商談: 田中商事 (受注) / フェニックス田中 (失注) / ナチュラルプレイ (進行中)</li>
              <li>・名刺: それぞれに紐づく担当者 5 名</li>
              <li>・録画: 商談アーカイブの要約・台詞検索の体験用 2 件</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground border-l-2 border-cinnabar/60 pl-3 py-1">
              実データには影響しません。サンプルは「管理」セクションのゴミ箱からいつでも消去できます。
            </p>
          </div>
        </div>
      </div>

      {alreadyLoaded ? (
        <div className="rounded-lg border border-chitose/40 bg-chitose-muted/30 p-4 flex items-center gap-3">
          <Sparkles aria-hidden strokeWidth={1.6} className="size-5 text-chitose shrink-0" />
          <p className="text-sm font-medium text-chitose">サンプルは既に入っています。</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <form action={skipSampleData}>
          <Button type="submit" variant="ghost" size="lg">
            あとで入れる / 必要ない
          </Button>
        </form>
        <form action={loadSampleData}>
          <SubmitButton variant="cinnabar" size="lg" pendingLabel="準備中…">
            <Sparkles aria-hidden className="size-4" />
            サンプルを入れる
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
