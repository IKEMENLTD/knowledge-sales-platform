'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { captureException } from '@/lib/sentry';

/**
 * 20_failure_recovery: ダッシュボード描画失敗時のフォールバック。
 * Sentry に通知 + reset() で再試行ボタンを提供。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { boundary: 'dashboard' });
  }, [error]);

  return (
    <div className="space-y-4 max-w-xl">
      <Alert variant="destructive" aria-live="assertive">
        <AlertTitle>ダッシュボードを表示できませんでした</AlertTitle>
        <AlertDescription>
          一時的なエラーが発生しました。もう一度お試しください。問題が続く場合は管理者にお問い合わせください。
          {error.digest ? (
            <p className="mt-2 text-xs font-mono opacity-70">エラーID: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={() => reset()} aria-label="ダッシュボードを再読込">
          再試行
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">トップへ戻る</a>
        </Button>
      </div>
    </div>
  );
}
