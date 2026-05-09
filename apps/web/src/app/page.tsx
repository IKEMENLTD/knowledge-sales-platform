import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';

export default function HomePage() {
  const isDev = env.NODE_ENV === 'development';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16 outline-none"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Knowledge Sales Platform
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          営業ナレッジ &amp; 商談アーカイブ
        </h1>
        <p className="mt-4 text-base text-muted-foreground max-w-xl">
          名刺取込・商談録画・自動要約・横断検索を一つに。
          会社のGoogleアカウントでサインインして、商談ナレッジの蓄積をはじめましょう。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login">サインイン</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">ダッシュボードへ</Link>
        </Button>
      </div>

      {isDev ? (
        <div className="mt-8 grid gap-2 text-xs text-muted-foreground border-t border-border pt-4">
          <p className="font-medium text-foreground">開発者向け (development only)</p>
          <p>
            設計書 / ロードマップは社内リポジトリ内で管理しています。本番ビルド時はこのブロック自体が描画されません
            (Security/Round2: 内部パス露出回避)。
          </p>
        </div>
      ) : null}
    </main>
  );
}
