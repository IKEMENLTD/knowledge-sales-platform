import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Editorial landing — "Sumi & Cinnabar" brand presence.
 * 商談を残し、ナレッジに変える。— ksp.
 */
export default function HomePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-5xl px-6 py-10 md:py-16 outline-none flex flex-col"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 mb-12 md:mb-20 animate-fade-in">
        <p className="kicker">№ 01 — ksp / Knowledge × Sales</p>
        <p className="hidden md:block kicker">2026 — α</p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 flex-1 animate-fade-up">
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-center gap-3 text-cinnabar">
            <span aria-hidden className="inkan size-9 rounded text-base font-display">
              K
            </span>
            <span className="kicker text-cinnabar">商談、ナレッジに。</span>
          </div>
          <h1 className="display text-[2.625rem] md:text-[4.5rem] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">
            営業の現場を、
            <br className="hidden md:block" />
            会社の知見に変える。
          </h1>
          <p className="max-w-prose text-lg md:text-xl leading-relaxed text-foreground/75">
            <strong className="font-semibold text-foreground">Zoom 録画・名刺・メール</strong>を AI
            が構造化し、商談ごとの要点・約束事項・次の一手を、組織の財産として残します。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Button asChild variant="cinnabar" size="lg">
              <Link href="/login">はじめる →</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/dashboard">ダッシュボードを見る</Link>
            </Button>
          </div>
        </div>

        <aside
          aria-hidden
          className="lg:col-span-4 hidden lg:flex items-center justify-center relative"
        >
          <div className="relative">
            <div className="absolute -inset-12 -z-10 rounded-full bg-cinnabar/5 blur-3xl" />
            <LogoMark size={224} />
          </div>
        </aside>
      </section>

      <section className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 border-y border-border divide-y md:divide-y-0 md:divide-x divide-border animate-fade-up [animation-delay:60ms]">
        {[
          {
            no: '02',
            title: '名刺を、その場で。',
            body: '片手で撮るだけで、相手・会社・連絡先が自動で登録される。重複も自動で検知。',
          },
          {
            no: '03',
            title: '録画を、要約に。',
            body: 'Zoom の録画から要点・反論・次のアクション・約束事項を抽出。台詞の場面まで遡れる。',
          },
          {
            no: '04',
            title: '社の知見を、横断検索。',
            body: '「うまくいった価格交渉」のような問いに、過去の商談台詞から答えを返す。',
          },
        ].map((item) => (
          <div key={item.no} className="p-6 md:p-8">
            <p className="section-no text-2xl mb-3">№ {item.no}</p>
            <h3 className="display text-xl font-semibold tracking-crisp mb-3 text-balance">
              {item.title}
            </h3>
            <p className="text-sm leading-7 text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-12 md:mt-16 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-muted-foreground">
        <p>© 2026 Knowledge Holdings × IKEMENLTD — internal use.</p>
        <p className="kicker">ksp / KNOWLEDGE × SALES</p>
      </footer>
    </main>
  );
}
