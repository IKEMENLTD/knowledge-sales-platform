'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { captureException } from '@/lib/sentry';
import { useEffect } from 'react';

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
    <div className="space-y-6 max-w-xl mx-auto pt-8">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3">
        <p className="kicker">№ 01 — ホーム</p>
        <p className="kicker">読込失敗</p>
      </div>
      <Alert variant="destructive" aria-live="assertive">
        <AlertTitle>ホームを表示できませんでした</AlertTitle>
        <AlertDescription>
          ネットワークが不安定だった可能性があります。もう一度試して、それでも続くようでしたら管理者へお知らせください。
          {error.digest ? (
            <p className="mt-2 text-xs font-mono opacity-70">エラーID: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={() => reset()} aria-label="ホームを再読込">
          もう一度読み込む
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">トップへ戻る</a>
        </Button>
      </div>
    </div>
  );
}
