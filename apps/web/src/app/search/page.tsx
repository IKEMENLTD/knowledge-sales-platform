import { ArrowUpRight, IdCard, Mic, Search as SearchIcon, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  DEMO_CONTACTS,
  DEMO_MEETINGS,
  DEMO_RECORDINGS,
  findMeeting,
  formatDateJp,
  formatTimestamp,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';

export const metadata = { title: '検索' };

type SearchResultKind = 'meeting' | 'recording' | 'contact';

type SearchResult = {
  id: string;
  kind: SearchResultKind;
  title: string;
  context: string;
  snippet: string;
  score: number;
  href: string;
  meta: string;
  atSec?: number;
};

const DEFAULT_QUERY = '価格交渉で押し返された商談';

const SUGGESTED_QUERIES = [
  '価格交渉で押し返された商談',
  '導入時に詰まりやすい論点',
  '受注に至った理由が明確な案件',
  'POC 評価後に失注した理由',
  'CTO が同席した商談',
];

/**
 * Phase 1: 検索 API は未接続。fixture から組み立てた架空のヒット結果を表示する。
 * クエリは表示テキスト・ハイライト・kicker に反映するが、結果セットそのものは
 * 固定 — 本番の意味検索とのギャップは aside ブロックでユーザーに開示する。
 */
const SAMPLE_RESULTS: SearchResult[] = (() => {
  const tanaka = DEMO_MEETINGS.find((m) => m.id === 'demo-m-001');
  const phoenix = DEMO_MEETINGS.find((m) => m.id === 'demo-m-002');
  const recTanaka = DEMO_RECORDINGS.find((r) => r.id === 'demo-r-001');
  const recPhoenix = DEMO_RECORDINGS.find((r) => r.id === 'demo-r-002');
  const nakamura = DEMO_CONTACTS.find((c) => c.id === 'demo-c-001');

  const results: SearchResult[] = [];
  if (recTanaka && tanaka) {
    results.push({
      id: recTanaka.id,
      kind: 'recording',
      title: recTanaka.title,
      context: `${tanaka.companyName} ・ ${formatDateJp(tanaka.scheduledAt)}`,
      snippet:
        '中村部長: 「3 年契約にできるなら、価格面で何か工夫してもらえないかと思っています」鈴木: 「3 年契約の特別単価は社内で確認できますので、5/13 までに見積書をお送りします」',
      score: 0.92,
      href: `/recordings/${recTanaka.id}`,
      meta: `${formatTimestamp(421)} 該当`,
      atSec: 421,
    });
  }
  if (phoenix && recPhoenix) {
    results.push({
      id: recPhoenix.id,
      kind: 'recording',
      title: recPhoenix.title,
      context: `${phoenix.companyName} ・ ${formatDateJp(phoenix.scheduledAt)}`,
      snippet:
        '小林課長: 「機能には満足してます。ただ、組み込みに 2 ヶ月かかるとなると、今期の予算では難しい」',
      score: 0.81,
      href: `/recordings/${recPhoenix.id}`,
      meta: `${formatTimestamp(1135)} 該当`,
      atSec: 1135,
    });
  }
  if (tanaka) {
    results.push({
      id: tanaka.id,
      kind: 'meeting',
      title: tanaka.title,
      context: `商談 ・ ${formatDateJp(tanaka.scheduledAt)}`,
      snippet: tanaka.aiSummary,
      score: 0.74,
      href: `/meetings/${tanaka.id}`,
      meta: '要約に該当',
    });
  }
  if (nakamura) {
    const m = findMeeting('demo-m-001');
    results.push({
      id: nakamura.id,
      kind: 'contact',
      title: `${nakamura.fullName} / ${nakamura.title}`,
      context: `${nakamura.companyName}`,
      snippet: `関連商談: ${m?.title ?? ''}。コスト最適化の決裁者で、年度予算は 4 月確定で動きやすい。`,
      score: 0.62,
      href: `/contacts/${nakamura.id}/review`,
      meta: '担当者プロファイル',
    });
  }
  return results;
})();

function tokenizeQuery(q: string): string[] {
  // 日本語/英語混在クエリを軽量分割。長さ 2 以上の語のみ採用。
  // (Phase 2 では kuromoji 等で形態素解析)
  const raw = q
    .split(/[\s、。「」『』"'?!？！,.\\/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  // 重複除去
  return Array.from(new Set(raw));
}

function buildHighlightRegex(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // case-insensitive (JP 混在クエリで Phoenix/phoenix のような表記揺れに対応)
  return new RegExp(`(${escaped.join('|')})`, 'gi');
}

function sectionNo(n: number) {
  return `№ ${n.toString().padStart(2, '0')}`;
}

export default async function SearchPage(props: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const q = (sp.q ?? DEFAULT_QUERY).trim();
  const terms = tokenizeQuery(q);
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  const hlRegex = buildHighlightRegex(terms);
  const results = SAMPLE_RESULTS;

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">{sectionNo(1)} — 検索</p>
        <span className="kicker tabular">{results.length} 件ヒット</span>
      </div>

      <header className="space-y-2 animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          社の知見を、横断する。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          商談・録画・名刺を意味で検索。キーワード一致と文脈一致の両方で当てます。権限のないコンテンツは結果から自動的に除外されます。
        </p>
      </header>

      <section
        aria-labelledby="search-query-no"
        className="space-y-4 animate-fade-up [animation-delay:60ms]"
      >
        <div className="flex items-baseline gap-3">
          <span id="search-query-no" className="section-no text-base">{sectionNo(2)}</span>
          <h2 className="display text-sm font-semibold tracking-crisp">質問を入力</h2>
        </div>
        <form action="/search" method="get" role="search" className="space-y-3">
          <label
            htmlFor="search-q"
            className={cn(
              'flex items-center gap-3 rounded-xl border border-border/70 bg-card',
              'shadow-sumi-sm shadow-inset-top px-4 h-14 cursor-text',
              'transition-[border-color,box-shadow] duration-fast ease-sumi',
              'focus-within:border-cinnabar/55 focus-within:shadow-focus-ring-cinnabar',
            )}
          >
            <SearchIcon aria-hidden strokeWidth={1.6} className="size-5 text-muted-foreground" />
            <input
              id="search-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="価格交渉でうまくいったケース"
              aria-label="ナレッジを検索"
              className="bg-transparent outline-none text-base flex-1 placeholder:text-muted-foreground/70"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border/70 px-1.5 h-6 text-[10px] tracking-wide text-muted-foreground bg-muted/50">
              Enter
            </kbd>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker">よく聞かれる質問</span>
            {SUGGESTED_QUERIES.map((sample) => {
              const active = sample === q;
              return (
                <Link
                  key={sample}
                  href={`/search?q=${encodeURIComponent(sample)}` as never}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border',
                    'px-3 h-8 text-xs',
                    'transition-colors duration-fast ease-sumi',
                    active
                      ? 'border-cinnabar/55 text-cinnabar bg-cinnabar/10'
                      : 'border-border/70 bg-card/60 text-foreground hover:border-cinnabar/45 hover:text-cinnabar hover:bg-cinnabar/8',
                  )}
                >
                  {sample}
                </Link>
              );
            })}
          </div>
        </form>
      </section>

      <div className="hairline" aria-hidden />

      <section
        aria-labelledby="search-results-no"
        className="space-y-4 animate-fade-up [animation-delay:120ms]"
      >
        <div className="flex items-baseline gap-3">
          <span id="search-results-no" className="section-no text-base">{sectionNo(3)}</span>
          <h2 className="display text-lg font-semibold tracking-crisp truncate">
            「{q}」の結果
          </h2>
          <span className="kicker">デモ</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Phase 1: 結果セットは固定のサンプルです。本番では入力したクエリに応じてリアルタイムに変化します。
        </p>
        <ul className="space-y-3">
          {results.map((r, idx) => (
            <li key={r.id}>
              <ResultRow result={r} rank={idx + 1} hlRegex={hlRegex} termSet={termSet} />
            </li>
          ))}
        </ul>
      </section>

      <aside
        className="rounded-xl border border-dashed border-cinnabar/35 bg-cinnabar/5 p-5 flex items-start gap-3 animate-fade-up [animation-delay:180ms]"
        aria-label="検索の仕組み"
      >
        <Sparkles aria-hidden strokeWidth={1.6} className="size-5 shrink-0 text-cinnabar mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">セマンティック + キーワード ハイブリッド</p>
          <p className="text-muted-foreground leading-relaxed">
            録画の文字起こしは pgvector で意味検索、メタデータ (会社名・担当者) はキーワードで完全一致。両者のスコアを重み付け合算してランキングします。Phase 2 で再ランカー (LLM rerank) を追加予定。
          </p>
        </div>
      </aside>
    </div>
  );
}

function ResultRow({
  result,
  rank,
  hlRegex,
  termSet,
}: {
  result: SearchResult;
  rank: number;
  hlRegex: RegExp | null;
  termSet: Set<string>;
}) {
  const kindCfg: Record<SearchResultKind, { Icon: typeof Mic; label: string; tone: string }> = {
    recording: { Icon: Mic, label: '録画', tone: 'border-cinnabar/40 text-cinnabar bg-cinnabar/10' },
    meeting: { Icon: Target, label: '商談', tone: 'border-foreground/25 text-foreground bg-card' },
    contact: {
      Icon: IdCard,
      label: '名刺',
      tone: 'border-chitose/40 text-chitose bg-chitose-muted/30',
    },
  };
  const { Icon, label, tone } = kindCfg[result.kind];
  return (
    <Link href={result.href as never} className="group block focus-visible:outline-none">
      <Card interactive className="p-5 focus-visible:shadow-focus-ring">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-start">
          <span className="display tabular w-9 text-base text-muted-foreground pt-0.5">
            {rank.toString().padStart(2, '0')}
          </span>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[10px] font-medium tracking-wide',
                  tone,
                )}
              >
                <Icon aria-hidden strokeWidth={1.8} className="size-3" />
                {label}
              </span>
              <span className="kicker tabular">スコア {result.score.toFixed(2)}</span>
              <span className="text-[11px] text-muted-foreground truncate">・ {result.meta}</span>
            </div>
            <h3 className="display text-base font-semibold tracking-crisp truncate">
              {result.title}
            </h3>
            <p className="text-xs text-muted-foreground">{result.context}</p>
            <p className="text-sm leading-relaxed text-foreground/85 border-l-2 border-cinnabar/40 pl-3">
              {highlight(result.snippet, hlRegex, termSet)}
            </p>
          </div>
          <ArrowUpRight
            aria-hidden
            className="size-4 text-muted-foreground shrink-0 transition-transform duration-fast ease-sumi group-hover:text-cinnabar group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>
      </Card>
    </Link>
  );
}

function highlight(text: string, re: RegExp | null, termSet: Set<string>) {
  if (!re || termSet.size === 0) return text;
  const parts = text.split(re);
  return parts.map((p, i) =>
    termSet.has(p.toLowerCase()) ? (
      <mark
        key={i}
        className="bg-cinnabar/15 text-cinnabar rounded px-0.5 not-italic font-medium"
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
