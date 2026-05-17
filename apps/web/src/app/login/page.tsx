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

/**
 * UX Round1 Desktop HIGH-D-01 + Mobile HIGH-M-03 fix:
 *  - lg+ で 2-column (左 hero + 落款 / 右 SSO card) に拡張
 *  - Google サインイン button を OAuth 慣習通り outline (白地) に
 *  - LogoMark 22→26px、kicker 採用
 *  - SubmitButton を size="xl" (h-14) で SSO ボタンの重みを増す
 *  - 落款 (inkan) accent を hero に内置で配置
 */
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
      className="relative min-h-dvh outline-none px-6 py-10 md:py-16 lg:py-0"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:min-h-dvh lg:grid-cols-[1.05fr_minmax(360px,420px)] lg:items-center lg:gap-16">
        {/* Hero (lg+ 表示 / mobile では SignInCard の上に compact 表示) */}
        <section className="space-y-7 lg:py-16 animate-fade-up">
          <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 max-w-md lg:max-w-none animate-fade-in">
            <Link href="/" aria-label="ksp ホーム" className="inline-flex items-center gap-2">
              <LogoMark size={26} />
              <span className="display text-base font-semibold tracking-crisp">ksp</span>
            </Link>
            <span className="kicker">№ 01 — SIGN IN</span>
          </div>

          <header className="space-y-3 max-w-md lg:max-w-none">
            <h1 className="display text-3xl md:text-4xl lg:text-[2.75rem] xl:text-5xl font-semibold tracking-crisp leading-[1.15]">
              <span className="block">商談を残し、</span>
              <span className="block">ナレッジに変える。</span>
            </h1>
            <p className="text-base md:text-[0.95rem] leading-relaxed text-muted-foreground max-w-prose">
              名刺・録画・商談がひとつに集まる場所。Google で安全にサインインして、続きから始めてください。
            </p>
          </header>

          {/* Hero only: lg+ に bullet 3 個を出して画面の余白を埋める */}
          <ul className="hidden lg:grid grid-cols-1 gap-3 text-sm text-foreground/85 max-w-prose">
            <li className="flex items-baseline gap-3">
              <span aria-hidden className="kicker tabular text-[10px] w-9 shrink-0">№ 01</span>
              <span>名刺を撮るだけで、商談相手が自動で並ぶ。</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span aria-hidden className="kicker tabular text-[10px] w-9 shrink-0">№ 02</span>
              <span>録画の要約と次の一手が、商談ごとに数分で揃う。</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span aria-hidden className="kicker tabular text-[10px] w-9 shrink-0">№ 03</span>
              <span>「価格交渉で押し返された商談」を、意味で横断検索。</span>
            </li>
          </ul>

          {/* 落款 inkan accent — hero 隅、控えめに */}
          <div className="hidden lg:flex items-center gap-3 pt-4">
            <span
              aria-hidden
              className="inline-block size-3 rounded-sm bg-cinnabar/35 rotate-12"
            />
            <span className="kicker text-[10px]">Knowledge Sales Platform</span>
          </div>
        </section>

        {/* SSO card */}
        <section className="w-full max-w-md mx-auto lg:mx-0 space-y-6 lg:py-16 animate-fade-up [animation-delay:60ms]">
          {errorMessage ? (
            <Alert variant="destructive" aria-live="polite">
              <AlertTitle>サインインに失敗しました</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardContent className="p-6 md:p-7 space-y-5">
              <form action={signInWithGoogle}>
                <input type="hidden" name="next" value={safeNext} />
                <SubmitButton
                  className="w-full gap-3"
                  size="xl"
                  variant="outline"
                  aria-label="Google でサインイン"
                  pendingLabel="サインイン中…"
                >
                  <GoogleG className="size-5 shrink-0" />
                  <span>Google でサインイン</span>
                </SubmitButton>
              </form>

              <details className="group rounded-lg border border-border/60 bg-surface-inset/40 text-sm">
                {/* UX Round2 LOW-M-16 fix: summary をタップ領域 44px に拡大 */}
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-medium tracking-crisp px-4 min-h-11 py-2">
                  <span>取得する権限について</span>
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform duration-fast ease-sumi group-open:rotate-180"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="px-4 pb-3 space-y-3 text-muted-foreground leading-relaxed">
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
        </section>
      </div>
    </main>
  );
}
