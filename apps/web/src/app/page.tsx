import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Knowledge Sales Platform
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          営業ナレッジ &amp; 商談アーカイブ
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Phase 1 (Week 1-4) スキャフォールド構築済み。Supabase / Google OAuth /
          Zoom連携の設定後、商談録画自動取込&検索のMVPが起動します。
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          サインイン
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          ダッシュボード
        </Link>
      </div>

      <div className="mt-8 grid gap-4 text-sm text-muted-foreground">
        <p>
          📘 設計書: <code className="rounded bg-muted px-1.5 py-0.5">../営業、CS統合管理システム＿ナレッジさん/sales_platform_design_spec_v2.xlsx</code>
        </p>
        <p>
          🚀 ロードマップ: <code className="rounded bg-muted px-1.5 py-0.5">README.md</code>
        </p>
      </div>
    </main>
  );
}
