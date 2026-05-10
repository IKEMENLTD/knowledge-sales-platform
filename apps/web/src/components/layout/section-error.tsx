'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { captureException } from '@/lib/sentry';

/**
 * 認証済みセクション共通の error boundary。
 * 20_failure_recovery: Sentry 通知 + reset() 再試行 + ダッシュボード復帰導線。
 *
 * 各セクションの error.tsx から薄くラップして使う想定。
 */
export function SectionErrorBoundary({
  boundary,
  title,
  error,
  reset,
}: {
  boundary: string;
  title: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { boundary });
  }, [boundary, error]);

  return (
    <div className="space-y-6 max-w-xl mx-auto pt-8">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3">
        <p className="kicker">{boundary}</p>
        <p className="kicker">読込失敗</p>
      </div>
      <Alert variant="destructive" aria-live="assertive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          ネットワークが不安定だった可能性があります。もう一度試して、それでも続くようでしたら管理者へお知らせください。
          {error.digest ? (
            <p className="mt-2 text-xs font-mono opacity-70">エラーID: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={() => reset()} aria-label="再読込">
          もう一度読み込む
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">ホームへ戻る</a>
        </Button>
      </div>
    </div>
  );
}
