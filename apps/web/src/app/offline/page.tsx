import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'オフライン' };

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-stretch justify-center gap-6 px-6 py-12 outline-none"
    >
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">SC-71</p>
        <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">オフラインです</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ネットワーク接続が確認できません。Wi-Fi / モバイル通信を確認してください。
        </p>
      </div>

      <Alert variant="info" aria-live="polite">
        <AlertTitle>オフラインでもできること</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
            <li>名刺撮影 (SC-33) — 復帰後に自動同期</li>
            <li>キュー一覧 (SC-34) — 待機中アイテムの確認</li>
            <li>クイック検索 (SC-35) — キャッシュ済みデータのみ</li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/mobile/queue">キューを見る</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">再試行</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Service Worker (sw.js) によりオフライン時もこのページを表示できます。
      </p>
    </main>
  );
}
