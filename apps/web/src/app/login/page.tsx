import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signInWithGoogle } from '@/lib/auth/actions';
import { sanitizeNext } from '@/lib/auth/redirect';

export const metadata = { title: 'サインイン' };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'OAuth コードが取得できませんでした。もう一度お試しください。',
  oauth_failed: 'Google 認証に失敗しました。ネットワーク状況を確認してください。',
  inactive: 'このアカウントは現在無効化されています。管理者にお問い合わせください。',
  role: 'このページを表示する権限がありません。',
};

function describeError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ERROR_MESSAGES[raw] ?? `ログインエラー: ${raw}`;
}

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 15: searchParams は Promise
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = describeError(params.error);
  const safeNext = sanitizeNext(params.next);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-md flex-col items-stretch justify-center gap-6 px-6 py-12 outline-none"
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">サインイン</CardTitle>
          <CardDescription>会社のGoogleアカウントでサインインしてください</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {errorMessage ? (
            <Alert variant="destructive" aria-live="polite">
              <AlertTitle>ログインに失敗しました</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form action={signInWithGoogle} className="space-y-3">
            <input type="hidden" name="next" value={safeNext} />
            <Button type="submit" className="w-full" size="lg" aria-label="Googleでサインイン">
              <span aria-hidden className="mr-2">
                🔐
              </span>
              Google でサインイン
            </Button>
          </form>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">付与される権限について</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>openid / email / profile</strong> — サインイン本人確認用
              </li>
              <li>
                <strong>Google Calendar (events)</strong> — 商談スケジュール自動取込
              </li>
            </ul>
            <p>
              Gmail / Drive 等の追加権限は、機能を初めて使うタイミングで個別にお願いします
              (incremental authorization)。
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="underline-offset-4 hover:underline">
              トップへ戻る
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
