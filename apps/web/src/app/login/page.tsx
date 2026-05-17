import { LogoMark } from '@/components/brand/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { signInWithGoogle } from '@/lib/auth/actions';
import { sanitizeNext } from '@/lib/auth/redirect';
import Link from 'next/link';

export const metadata = { title: 'サインイン' };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'OAuth コードが取得できませんでした。もう一度お試しください。',
  oauth_failed: 'Google 認証に失敗しました。ネットワーク状況を確認してください。',
  inactive: 'このアカウントは現在停止されています。管理者にお問い合わせください。',
  role: 'このページを表示する権限がありません。',
};

function describeError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ERROR_MESSAGES[raw] ?? `ログインエラー: ${raw}`;
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .55 4.1 1.45l3-3C17.3 1.7 14.9.7 12 .7 7.4.7 3.4 3.3 1.4 7l3.5 2.7C5.9 6.9 8.7 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.85-.07-1.65-.2-2.4H12v4.55h6.5c-.3 1.5-1.15 2.75-2.45 3.6l3.55 2.75c2.05-1.9 3.2-4.7 3.2-8z"
      />
      <path
        fill="#FBBC05"
        d="M5 14.3c-.25-.7-.4-1.5-.4-2.3 0-.8.15-1.6.4-2.3L1.4 7C.5 8.5 0 10.2 0 12c0 1.8.5 3.5 1.4 5l3.6-2.7z"
      />
      <path
        fill="#34A853"
        d="M12 23.3c3.25 0 6-1.05 8-2.9l-3.55-2.75c-1 .65-2.25 1.05-4.45 1.05-3.3 0-6.1-1.9-7.1-4.7L1.4 17c2 3.7 6 6.3 10.6 6.3z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = describeError(params.error);
  const safeNext = sanitizeNext(params.next);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-md px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-7"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <Link href="/" aria-label="ksp ホーム" className="inline-flex items-center gap-2">
          <LogoMark size={22} />
          <span className="display text-sm font-semibold tracking-crisp">ksp</span>
        </Link>
        <span className="kicker">SIGN IN</span>
      </div>

      <header className="space-y-3 animate-fade-up">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp">
          おかえりなさい。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          会社の Google アカウントでサインインすると、ホームに戻れます。
        </p>
      </header>

      {errorMessage ? (
        <Alert variant="destructive" aria-live="polite" className="animate-fade-up">
          <AlertTitle>サインインに失敗しました</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="animate-fade-up [animation-delay:60ms]">
        <CardContent className="p-6 md:p-7 space-y-5">
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={safeNext} />
            <SubmitButton
              className="w-full gap-3"
              size="lg"
              variant="default"
              aria-label="Google でサインイン"
              pendingLabel="サインイン中…"
            >
              <GoogleG className="size-5 shrink-0" />
              <span>Google でサインイン</span>
            </SubmitButton>
          </form>

          <details className="group rounded-lg border border-border/60 bg-surface-inset/40 px-4 py-3 text-sm">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-medium tracking-crisp">
              <span>取得する権限について</span>
              <span
                aria-hidden
                className="text-muted-foreground transition-transform duration-fast ease-sumi group-open:rotate-180"
              >
                ⌄
              </span>
            </summary>
            <div className="mt-3 space-y-3 text-muted-foreground leading-relaxed">
              <p>
                <span className="font-medium text-foreground">
                  本人確認 (openid / email / profile)
                </span>
                <br />
                ksp にログインしているのが、確かにあなたであることを Google に確認します。
              </p>
              <p>
                <span className="font-medium text-foreground">Google カレンダー</span>
                <br />
                今日の商談予定をホームに自動で取り込みます。新しい予定を ksp
                から作ることもできます。
              </p>
              <p className="text-xs">
                Gmail や Drive
                の権限は、その機能をはじめて使うときに改めて伺います。今このタイミングでまとめて許可する必要はありません。
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <footer className="text-center text-xs text-muted-foreground space-y-1">
        <p>
          <Link href="/" className="underline-offset-4 hover:underline">
            トップへ戻る
          </Link>
        </p>
      </footer>
    </main>
  );
}
