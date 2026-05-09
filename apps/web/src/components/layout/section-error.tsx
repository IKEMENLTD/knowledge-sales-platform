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
    <div className="space-y-4 max-w-xl">
      <Alert variant="destructive" aria-live="assertive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          一時的なエラーが発生しました。もう一度お試しください。問題が続く場合は管理者にお問い合わせください。
          {error.digest ? (
            <p className="mt-2 text-xs font-mono opacity-70">エラーID: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={() => reset()} aria-label="再読込">
          再試行
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">ダッシュボードへ戻る</a>
        </Button>
      </div>
    </div>
  );
}
