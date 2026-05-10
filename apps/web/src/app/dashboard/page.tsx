import { ArrowUpRight, Calendar, IdCard, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';

export const metadata = { title: 'ホーム' };

function greetByHour(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'おつかれさまです';
}

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.onboardedAt == null) {
    redirect('/onboarding');
  }

  const greeting = greetByHour(new Date());
  const displayName = user.fullName ?? user.email?.split('@')[0] ?? '';

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — ホーム</p>
        <time
          className="kicker tabular"
          dateTime={new Date().toISOString().slice(0, 10)}
        >
          {new Intl.DateTimeFormat('ja-JP', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          }).format(new Date())}
        </time>
      </div>

      <header className="space-y-2 animate-fade-up">
        <p className="text-sm text-muted-foreground">{greeting}、</p>
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          {displayName} さん。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          まだデータが入っていません。最初の数分で整えると、明日の商談からホームが活きはじめます。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <section
        aria-label="主要 KPI"
        className="grid grid-cols-1 gap-4 md:grid-cols-3 animate-fade-up [animation-delay:80ms]"
      >
        <KpiCard
          no="02"
          kicker="今週の商談"
          Icon={Calendar}
          metric="—"
          hint="Google カレンダーをつなぐと、今日の商談が並びます。"
          cta={{ href: '/onboarding', label: 'カレンダーを連携する' }}
        />
        <KpiCard
          no="03"
          kicker="未処理の名刺"
          Icon={IdCard}
          metric="—"
          hint="撮影 / アップロードした名刺がここに集まります。"
          cta={{ href: '/contacts/import', label: '最初の名刺を取り込む' }}
        />
        <KpiCard
          no="04"
          kicker="ナレッジ検索"
          Icon={Sparkles}
          metric="—"
          hint="蓄積した商談から、必要な答えを意味で引きます。"
          cta={{ href: '/search', label: '検索を開く' }}
        />
      </section>

      {/*
        Dashboard hero — 真の hero card に格上げ:
        - 上に radial cinnabar glow で視覚 weight UP
        - 右下に inkan 落款 (rotated-8) で signature 感
        - border-foreground/10 で primary card の3つよりも勝つ存在感
      */}
      <section
        aria-label="最初の一歩"
        className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sumi animate-fade-up [animation-delay:140ms]"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--cinnabar)/0.08),transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute -right-8 -bottom-8 size-44 rotate-[-8deg] rounded-md bg-cinnabar/[0.06] shadow-[inset_0_0_0_1px_hsl(var(--cinnabar)/0.18)]"
        />
        <div
          aria-hidden
          className="absolute -right-2 -bottom-2 size-16 rotate-[-8deg] rounded inkan flex items-center justify-center text-2xl font-display"
        >
          K
        </div>
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 p-6 md:p-10 items-start">
          <div>
            <p className="kicker mb-3">最初の一歩 — № 05</p>
            <h2 className="display text-2xl md:text-[1.875rem] font-semibold tracking-crisp leading-tight text-balance">
              実データを入れる前に、
              <br className="hidden sm:block" />
              サンプルで触ってみる。
            </h2>
            <p className="mt-3 text-sm md:text-[0.95rem] leading-7 text-muted-foreground max-w-prose">
              ダミーの商談・名刺・録画を入れた状態で操作感を確かめられます。あとで一括で消せます。
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-cinnabar/50 bg-cinnabar/8 px-4 py-2.5 text-sm font-medium text-cinnabar hover:bg-cinnabar hover:text-cinnabar-foreground hover:-translate-y-px hover:shadow-cinnabar-glow transition-[transform,box-shadow,background-color,color] duration-fast ease-sumi self-end md:self-center"
          >
            セットアップを再開する
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

type KpiCardProps = {
  no: string;
  kicker: string;
  metric: string;
  hint: string;
  Icon: typeof Calendar;
  cta?: { href: string; label: string };
};

function KpiCard({ no, kicker, metric, hint, Icon, cta }: KpiCardProps) {
  return (
    <Card className="group relative overflow-hidden">
      <div
        aria-hidden
        className="absolute right-0 top-0 size-24 rounded-full bg-cinnabar/0 blur-2xl transition-colors duration-slow ease-sumi group-hover:bg-cinnabar/8"
      />
      <CardContent className="relative p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="kicker">{kicker}</p>
          <span className="section-no text-base">№ {no}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <Icon
            aria-hidden
            strokeWidth={1.4}
            className="size-6 shrink-0 text-muted-foreground/60 group-hover:text-cinnabar/80 transition-colors duration-med ease-sumi"
          />
          <p
            className={`display tabular text-metric font-semibold leading-none tracking-[-0.022em] ${metric === '—' ? 'text-muted-foreground/35' : ''}`}
          >
            {metric}
          </p>
        </div>
        {/* 空状態の baseline + cinnabar 脈動 dot — 用意ができる前の "静かな準備" */}
        {metric === '—' ? (
          <div aria-hidden className="relative h-4">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[image:repeating-linear-gradient(to_right,hsl(var(--border))_0,hsl(var(--border))_3px,transparent_3px,transparent_6px)]" />
            <span className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-cinnabar/70 animate-pulse-ink" />
          </div>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground/85">{hint}</p>
        {cta ? (
          <Link
            href={cta.href as never}
            className="group/cta inline-flex items-center gap-1.5 text-xs font-medium text-foreground/85 hover:text-cinnabar transition-colors duration-fast ease-sumi"
          >
            {cta.label}
            <ArrowUpRight
              aria-hidden
              className="size-3.5 transition-transform duration-fast ease-sumi group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
            />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
