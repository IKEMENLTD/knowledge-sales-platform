import { Button } from '@/components/ui/button';
import { ArrowRight, Inbox, RotateCcw, ScanLine, Search } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'オフライン' };

function CloudOffIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 240 200" className="w-full max-w-[300px] h-auto" role="img">
      <defs>
        <pattern id="gridOffline" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="240" height="200" fill="url(#gridOffline)" opacity="0.6" />
      <g transform="translate(120 100)">
        {/* Cloud */}
        <path
          d="M -50 16 a 22 22 0 0 1 8 -42 a 30 30 0 0 1 56 -2 a 22 22 0 0 1 0 44 z"
          fill="hsl(var(--surface-raised))"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Diagonal cinnabar slash */}
        <line
          x1="-60"
          y1="-50"
          x2="60"
          y2="50"
          stroke="hsl(var(--cinnabar))"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.92"
        />
        {/* Falling drops */}
        <circle cx="-26" cy="36" r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.6" />
        <circle cx="0" cy="40" r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.55" />
        <circle cx="26" cy="36" r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.6" />
      </g>
    </svg>
  );
}

const STILL_AVAILABLE = [
  {
    Icon: ScanLine,
    title: '名刺の撮影',
    body: '回線が戻ったときに自動でアップロードされます。',
    href: '/mobile/scan',
  },
  {
    Icon: Inbox,
    title: 'オフラインキューの確認',
    body: 'まだ送れていないものをここで確認できます。',
    href: '/mobile/queue',
  },
  {
    Icon: Search,
    title: 'キャッシュ済みデータの検索',
    body: '一度読んだ商談はオフラインでも引けます。',
    href: '/mobile/quick-lookup',
  },
];

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-2xl px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-8"
    >
      {/* UX Round1 Desktop HIGH-D-02 fix: xl+ で左右に細 vertical hairline を出して editorial frame に */}
      <span
        aria-hidden
        className="hidden xl:block absolute left-[calc(50%-min(46vw,720px))] top-12 bottom-12 w-px bg-border/40"
      />
      <span
        aria-hidden
        className="hidden xl:block absolute right-[calc(50%-min(46vw,720px))] top-12 bottom-12 w-px bg-border/40"
      />
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">通信状態</p>
        <p className="kicker">オフライン</p>
      </div>

      <div className="flex justify-center animate-fade-up">
        <CloudOffIllustration />
      </div>

      <header className="text-center space-y-3 animate-fade-up [animation-delay:60ms]">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          いま、ネットにつながっていません。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose mx-auto">
          回線が戻り次第、自動で再接続します。記録した名刺やメモは端末内に保管されているので、まだ大丈夫です。
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-center gap-3 animate-fade-up [animation-delay:120ms]">
        <Button asChild variant="cinnabar" size="lg">
          <Link href="/dashboard">
            <RotateCcw aria-hidden strokeWidth={1.6} />
            <span>もう一度読み込む</span>
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/mobile/queue">キューを見る</Link>
        </Button>
      </div>

      <div className="hairline" aria-hidden />

      <section className="space-y-4 animate-fade-up [animation-delay:180ms]">
        <p className="kicker">オフラインでもできること</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {STILL_AVAILABLE.map((item) => (
            <li key={item.title}>
              <Link
                href={item.href as never}
                className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sumi-sm transition-[transform,box-shadow,border-color] duration-med ease-sumi hover:-translate-y-0.5 hover:shadow-sumi hover:border-foreground/30"
              >
                <item.Icon
                  aria-hidden
                  strokeWidth={1.6}
                  className="size-5 shrink-0 mt-0.5 text-cinnabar/85 transition-colors duration-med ease-sumi"
                />
                <div className="flex-1">
                  <p className="display text-sm font-semibold tracking-crisp">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 mt-1 text-muted-foreground/40 transition-transform duration-fast ease-sumi group-hover:translate-x-0.5 group-hover:text-cinnabar"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* UX Round2 LOW-D-09 fix: 落款 (inkan accent) — offline にも detail signature 流派 */}
      <div className="flex justify-end pt-2">
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
          title="落款"
        />
      </div>
    </main>
  );
}
