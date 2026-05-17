import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata = { title: '権限がありません' };

const REASON_TEXT: Record<string, string> = {
  inactive: 'このアカウントは現在停止されています。管理者にご連絡ください。',
  role: 'この機能を使う役割が、まだあなたに割り当てられていません。',
};

function ShieldOffIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 240 200" className="w-full max-w-[300px] h-auto" role="img">
      <defs>
        <pattern id="grid403" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="240" height="200" fill="url(#grid403)" opacity="0.6" />
      {/* 鍵 + 横切る線 */}
      <g transform="translate(120 100)">
        <circle
          r="56"
          fill="hsl(var(--surface-raised))"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />
        <path
          d="M -22 -12 a 22 22 0 1 1 44 0 v 26 h -44 z"
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="-26"
          y="0"
          width="52"
          height="32"
          rx="3"
          fill="hsl(var(--surface-raised))"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
        />
        <circle r="3.5" fill="hsl(var(--foreground))" cy="14" />
        {/* 朱の cross-out line */}
        <line
          x1="-58"
          y1="-58"
          x2="58"
          y2="58"
          stroke="hsl(var(--cinnabar))"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.92"
        />
      </g>
    </svg>
  );
}

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
      className="mx-auto min-h-dvh max-w-2xl px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-8"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">アクセス制限</p>
        <p className="kicker">403</p>
      </div>

      <div className="flex justify-center animate-fade-up">
        <ShieldOffIllustration />
      </div>

      <header className="text-center space-y-3 animate-fade-up [animation-delay:60ms]">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          この機能は、いまの権限では使えません。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose mx-auto">
          {message}
        </p>
      </header>

      {need ? (
        <Alert variant="warning" aria-live="polite" className="max-w-md mx-auto w-full">
          <AlertTitle>必要な役割</AlertTitle>
          <AlertDescription className="font-mono text-sm">{need}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border/70 bg-card/80 shadow-sumi-sm p-5 md:p-6 max-w-md mx-auto w-full">
        <p className="display font-semibold tracking-crisp">権限の付与を依頼する</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          上長または組織の管理者に依頼してください。社内チャット、または
          <span className="mx-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            管理者向け窓口
          </span>
          への連絡で受け付けます。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="default" size="lg">
          <Link href="/dashboard">ホームへ戻る</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">サインインし直す</Link>
        </Button>
      </div>
    </main>
  );
}
