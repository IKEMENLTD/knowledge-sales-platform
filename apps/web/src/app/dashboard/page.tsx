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

      <section
        aria-label="最初の一歩"
        className="rounded-2xl border border-border/70 bg-card/80 shadow-sumi-sm overflow-hidden animate-fade-up [animation-delay:140ms]"
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 p-6 md:p-8 items-start">
          <div>
            <p className="kicker mb-3">最初の一歩 — № 05</p>
            <h2 className="display text-xl md:text-2xl font-semibold tracking-crisp">
              実データを入れる前に、サンプルで触ってみる。
            </h2>
            <p className="mt-3 text-sm md:text-[0.95rem] leading-7 text-muted-foreground max-w-prose">
              ダミーの商談・名刺・録画を入れた状態で操作感を確かめられます。あとで一括で消せます。
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-cinnabar/50 bg-cinnabar/5 px-4 py-2.5 text-sm font-medium text-cinnabar hover:bg-cinnabar hover:text-cinnabar-foreground transition-colors duration-fast ease-sumi self-end md:self-center"
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
            className={`display tabular text-metric font-semibold leading-none tracking-[-0.025em] ${metric === '—' ? 'text-muted-foreground/35' : ''}`}
          >
            {metric}
          </p>
        </div>
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
