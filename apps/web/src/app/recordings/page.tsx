import { requireUser } from '@/lib/auth/server';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { RecordingCard } from './_components/recording-card';
import { RecordingFilterBar } from './_components/recording-filter-bar';
import { RecordingFailedCard, RecordingProcessingCard } from './_components/recording-skeleton';
import { type RecordingListItem, loadRecordings } from './_lib/load-recordings';

export const metadata = { title: '録画' };
export const dynamic = 'force-dynamic';

type SearchParams = {
  ownerUserId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
};

const PAGE_SIZE = 20;

function isoDatePart(iso?: string): string | undefined {
  if (!iso) return undefined;
  const idx = iso.indexOf('T');
  return idx > 0 ? iso.slice(0, idx) : iso;
}

function formatHours(totalSec: number): string {
  if (totalSec <= 0) return '0';
  const hours = totalSec / 3600;
  // 10時間以上は整数、未満は小数1桁。
  return hours >= 10 ? Math.round(hours).toString() : (Math.round(hours * 10) / 10).toString();
}

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // role gate — RLS は Supabase 側で再確認するが、UI gate も明示。
  await requireUser();
  const sp = (await searchParams) ?? {};

  const result = await loadRecordings({
    ownerUserId: sp.ownerUserId,
    status: sp.status,
    from: sp.from,
    to: sp.to,
    limit: sp.limit ?? String(PAGE_SIZE),
    offset: sp.offset,
  });

  const offset = Number(sp.offset ?? 0) || 0;
  const limit = Number(sp.limit ?? PAGE_SIZE) || PAGE_SIZE;
  const totalHours = formatHours(result.totalDurationSec);

  // 表示順: 失敗 → 処理中 → 完了 (ユーザーが拾うべき順)
  const failed = result.items.filter((r) => r.processingStatus === 'failed');
  const processing = result.items.filter(
    (r) => r.processingStatus !== 'completed' && r.processingStatus !== 'failed',
  );
  const completed = result.items.filter((r) => r.processingStatus === 'completed');

  const visible: { kind: 'failed' | 'processing' | 'completed'; rec: RecordingListItem }[] = [
    ...failed.map((rec) => ({ kind: 'failed' as const, rec })),
    ...processing.map((rec) => ({ kind: 'processing' as const, rec })),
    ...completed.map((rec) => ({ kind: 'completed' as const, rec })),
  ];

  const hasFilter = Boolean(sp.ownerUserId || sp.status || sp.from || sp.to);

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 録画</p>
        <span className="kicker tabular">
          {result.totalCount} 件 ・ 累計 {totalHours} 時間
        </span>
      </div>

      <header className="space-y-2 animate-fade-up max-w-3xl">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          商談の録画を、ナレッジに変える。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          Zoom の録画を自動取り込み。文字起こし・要約・話者ごとの感情の流れ・台詞検索まで、1
          件あたり数分で揃います。
        </p>
        {result.isFallback ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <span className="size-1.5 rounded-full bg-cinnabar" aria-hidden />
            まだ録画がありません — サンプルを表示しています
          </p>
        ) : null}
      </header>

      {/* KPI ストリップ */}
      <section
        aria-label="録画の状態サマリ"
        aria-live="polite"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-up [animation-delay:40ms]"
      >
        <KpiStat kicker="累計の長さ" metric={`${totalHours} 時間`} hint="完了済 + 処理中の合計" />
        <KpiStat
          kicker="処理中"
          metric={`${result.processingCount} 件`}
          hint={result.processingCount > 0 ? '完了まで通常 5〜10 分' : '進行中の処理はありません'}
          Icon={result.processingCount > 0 ? Loader2 : undefined}
          accent={result.processingCount > 0 ? 'pulse' : undefined}
        />
        <KpiStat
          kicker="失敗"
          metric={`${result.failedCount} 件`}
          hint={result.failedCount > 0 ? '再実行ボタンで再キックできます' : '失敗はありません'}
          Icon={result.failedCount > 0 ? AlertCircle : undefined}
          accent={result.failedCount > 0 ? 'danger' : undefined}
        />
      </section>

      <div className="hairline" aria-hidden />

      {/* Filter */}
      <section className="animate-fade-up [animation-delay:60ms]">
        <RecordingFilterBar
          owners={result.owners}
          defaultOwnerUserId={sp.ownerUserId}
          defaultStatus={sp.status}
          defaultFrom={isoDatePart(sp.from)}
          defaultTo={isoDatePart(sp.to)}
        />
      </section>

      <section aria-label="録画一覧" className="space-y-5 animate-fade-up [animation-delay:80ms]">
        {visible.length === 0 ? (
          <EmptyState hasFilter={hasFilter} />
        ) : (
          visible.map((v, idx) => {
            if (v.kind === 'failed') {
              return <RecordingFailedCard key={v.rec.id} recording={v.rec} index={idx} />;
            }
            if (v.kind === 'processing') {
              return <RecordingProcessingCard key={v.rec.id} recording={v.rec} index={idx} />;
            }
            return <RecordingCard key={v.rec.id} recording={v.rec} index={idx} />;
          })
        )}
      </section>

      {/* Pager — fixture (3件) では描画しない。totalCount が limit を超えるときだけ。 */}
      {result.totalCount > limit ? (
        <Pager offset={offset} limit={limit} total={result.totalCount} searchParams={sp} />
      ) : null}
    </div>
  );
}

function KpiStat({
  kicker,
  metric,
  hint,
  Icon,
  accent,
}: {
  kicker: string;
  metric: string;
  hint: string;
  Icon?: typeof Loader2;
  accent?: 'pulse' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card/70 p-4 space-y-2',
        'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
      )}
    >
      <div className="flex items-baseline justify-between">
        <p className="kicker">{kicker}</p>
        {Icon ? (
          <Icon
            aria-hidden
            strokeWidth={1.6}
            className={cn(
              'size-4',
              accent === 'pulse' && 'text-cinnabar animate-spin',
              accent === 'danger' && 'text-cinnabar',
            )}
          />
        ) : null}
      </div>
      <p className="display tabular text-2xl font-semibold tracking-[-0.022em] leading-none">
        {metric}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-10 text-center space-y-2">
      <p className="display text-base font-semibold tracking-crisp">
        {hasFilter ? '条件に合う録画はありません' : 'まだ録画がありません'}
      </p>
      <p className="text-sm text-muted-foreground">
        {hasFilter
          ? '担当者・期間・状態の条件を緩めるか、クリアしてみてください。'
          : 'Zoom 連携が有効なら、商談終了から数分で自動的にここに並びます。'}
      </p>
      {hasFilter ? (
        <Link
          href="/recordings"
          className="inline-flex items-center gap-1 text-sm text-cinnabar hover:underline mt-2"
        >
          絞り込みをクリア
        </Link>
      ) : null}
    </div>
  );
}

function Pager({
  offset,
  limit,
  total,
  searchParams,
}: {
  offset: number;
  limit: number;
  total: number;
  searchParams: SearchParams;
}) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const buildHref = (newOffset: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'offset') qs.set(k, v);
    }
    if (newOffset > 0) qs.set('offset', String(newOffset));
    const s = qs.toString();
    return s ? `/recordings?${s}` : '/recordings';
  };
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;
  const pageNo = Math.floor(offset / limit) + 1;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <nav aria-label="ページ送り" className="flex items-center justify-between pt-2">
      <Link
        href={buildHref(prevOffset) as never}
        aria-disabled={!hasPrev}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border/70 bg-card/60',
          'px-3 h-9 text-xs text-foreground transition-colors',
          'hover:border-foreground/30',
          !hasPrev && 'opacity-40 pointer-events-none',
        )}
      >
        前のページ
      </Link>
      <p className="kicker tabular">
        {pageNo} / {lastPage}
      </p>
      <Link
        href={buildHref(nextOffset) as never}
        aria-disabled={!hasNext}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border/70 bg-card/60',
          'px-3 h-9 text-xs text-foreground transition-colors',
          'hover:border-foreground/30',
          !hasNext && 'opacity-40 pointer-events-none',
        )}
      >
        次のページ
      </Link>
    </nav>
  );
}
