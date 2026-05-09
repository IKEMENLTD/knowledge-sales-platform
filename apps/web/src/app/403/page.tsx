import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'アクセス権限がありません' };

const REASON_TEXT: Record<string, string> = {
  inactive: 'このアカウントは現在無効化されています。管理者に連絡してください。',
  role: '操作権限が不足しています。必要な役割が付与されていません。',
};

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; need?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason ?? 'role';
  const need = params.need;
  const message = REASON_TEXT[reason] ?? '指定の操作を実行する権限がありません。';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-stretch justify-center gap-6 px-6 py-12 outline-none"
    >
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">SC-70</p>
        <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">
          アクセス権限がありません
        </h1>
      </div>

      <Alert variant="warning" aria-live="polite">
        <AlertTitle>403 Forbidden</AlertTitle>
        <AlertDescription>
          {message}
          {need ? (
            <p className="mt-2 text-xs">
              必要な役割: <code className="font-mono">{need}</code>
            </p>
          ) : null}
        </AlertDescription>
      </Alert>

      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm space-y-2">
        <p className="font-medium">権限を申請する</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          上長または組織の admin に role 変更を依頼してください。社内チャットや
          <code className="mx-1 rounded bg-background px-1.5 py-0.5">support@</code>
          宛のメールがおすすめです。
        </p>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/dashboard">ダッシュボードへ戻る</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">サインインし直す</Link>
        </Button>
      </div>
    </main>
  );
}
