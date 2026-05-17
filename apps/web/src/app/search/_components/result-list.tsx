'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SearchHit } from '@ksp/shared';
import { ArrowUpRight, IdCard, Mic, Sparkles, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';
import {
  buildHighlightRegex,
  buildTermSet,
  splitHighlight,
  tokenizeQuery,
} from '../_lib/highlight';

/**
 * 検索結果リスト — Client Component。
 *
 * - 各カードは `<button>` で、click 時に
 *   1. `/api/search/click` を fire-and-forget POST
 *   2. `router.push(href)` で navigate
 *   の順で実行する。Link だと先 navigate されて beacon が落ちるため。
 * - "なぜヒット" の explain pane は per-result toggle (Sparkles ボタン)。
 * - 結果 0 件: クエリ言い換えサジェストを表示。
 */

export type ResultListProps = {
  query: string;
  queryId: string | null;
  hits: SearchHit[];
  /** 結果0件時にカードの代わりに表示する rewrite サジェスト */
  rewriteSuggestions: readonly string[];
  /** 入力した kind フィルタを保持して queryRewrite に渡す */
  currentKind: string;
};

const KIND_CFG: Record<SearchHit['kind'], { Icon: typeof Mic; label: string; tone: string }> = {
  recording: { Icon: Mic, label: '録画', tone: 'border-cinnabar/40 text-cinnabar bg-cinnabar/10' },
  meeting: { Icon: Target, label: '商談', tone: 'border-foreground/25 text-foreground bg-card' },
  contact: {
    Icon: IdCard,
    label: '名刺',
    tone: 'border-chitose/40 text-chitose bg-chitose-muted/30',
  },
};

export function ResultList({
  query,
  queryId,
  hits,
  rewriteSuggestions,
  currentKind,
}: ResultListProps) {
  const router = useRouter();

  const { regex, termSet } = useMemo(() => {
    const terms = tokenizeQuery(query);
    return { regex: buildHighlightRegex(terms), termSet: buildTermSet(terms) };
  }, [query]);

  const [openExplain, setOpenExplain] = useState<string | null>(null);

  if (hits.length === 0) {
    return <EmptyState query={query} suggestions={rewriteSuggestions} currentKind={currentKind} />;
  }

  return (
    <ul className="space-y-3">
      {hits.map((hit, idx) => (
        <li key={hit.id}>
          <ResultRow
            hit={hit}
            rank={idx + 1}
            regex={regex}
            termSet={termSet}
            queryId={queryId}
            isExplainOpen={openExplain === hit.id}
            onToggleExplain={() => setOpenExplain((cur) => (cur === hit.id ? null : hit.id))}
            onNavigate={(href) => router.push(href as never)}
          />
        </li>
      ))}
    </ul>
  );
}

function ResultRow({
  hit,
  rank,
  regex,
  termSet,
  queryId,
  isExplainOpen,
  onToggleExplain,
  onNavigate,
}: {
  hit: SearchHit;
  rank: number;
  regex: RegExp | null;
  termSet: Set<string>;
  queryId: string | null;
  isExplainOpen: boolean;
  onToggleExplain: () => void;
  onNavigate: (href: string) => void;
}) {
  const { Icon, label, tone } = KIND_CFG[hit.kind];

  const handleNavigate = () => {
    void postClick({ queryId, hit, rank });
    onNavigate(hit.href);
  };

  return (
    <div className="group block">
      <Card interactive className="p-5 focus-within:shadow-focus-ring">
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
                <Icon aria-hidden strokeWidth={1.6} className="size-3" />
                {label}
              </span>
              <span className="kicker tabular">スコア {hit.score.toFixed(2)}</span>
              {hit.atSec !== undefined ? (
                <span className="text-[11px] text-muted-foreground truncate">
                  ・ {formatTimestamp(hit.atSec)} 該当
                </span>
              ) : null}
              {hit.sensitivity && hit.sensitivity !== 'public' && hit.sensitivity !== 'internal' ? (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                  {hit.sensitivity}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleNavigate}
              className={cn(
                'block text-left w-full',
                'focus-visible:outline-none focus-visible:shadow-focus-ring rounded-sm',
              )}
            >
              <h3 className="display text-base font-semibold tracking-crisp truncate group-hover:text-cinnabar transition-colors duration-fast ease-sumi">
                {hit.title}
              </h3>
            </button>

            <p className="text-xs text-muted-foreground truncate">{hit.context}</p>

            <p className="text-sm leading-relaxed text-foreground/85 border-l-2 border-cinnabar/40 pl-3">
              {renderHighlight(hit.snippet, regex, termSet)}
            </p>

            {hit.scoreBreakdown ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onToggleExplain}
                  aria-expanded={isExplainOpen}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] tracking-wide',
                    'text-muted-foreground hover:text-cinnabar transition-colors duration-fast ease-sumi',
                  )}
                >
                  <Sparkles aria-hidden strokeWidth={1.6} className="size-3" />
                  なぜヒット
                </button>
                {isExplainOpen ? <ExplainPane breakdown={hit.scoreBreakdown} /> : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            aria-label={`${hit.title} を開く`}
            onClick={handleNavigate}
            className={cn(
              'self-start rounded-md p-1',
              'text-muted-foreground hover:text-cinnabar transition-colors duration-fast ease-sumi',
              'focus-visible:outline-none focus-visible:shadow-focus-ring',
            )}
          >
            <ArrowUpRight
              aria-hidden
              className="size-4 transition-transform duration-fast ease-sumi group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </button>
        </div>
      </Card>
    </div>
  );
}

function ExplainPane({
  breakdown,
}: {
  breakdown: NonNullable<SearchHit['scoreBreakdown']>;
}) {
  const rows: { label: string; value: number | undefined; hint: string }[] = [
    { label: 'Vector (意味)', value: breakdown.vector, hint: '文意ベクトルの類似度' },
    { label: 'BM25 (語句)', value: breakdown.bm25, hint: 'キーワード一致の TF-IDF' },
    { label: 'RRF (合算)', value: breakdown.rrf, hint: '上位両ランクを Reciprocal で合算' },
  ];
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-card/60 p-3 space-y-1.5">
      {rows.map((r) => {
        const v = r.value;
        if (v === undefined) return null;
        const pct = Math.min(100, Math.max(0, v * 100));
        return (
          <div key={r.label} className="grid grid-cols-[10rem_1fr_3rem] gap-2 items-center">
            <span className="text-[11px] text-muted-foreground">{r.label}</span>
            <span className="h-1.5 rounded-full bg-border/50 overflow-hidden">
              <span
                className="block h-full bg-cinnabar/60"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </span>
            <span className="text-[11px] tabular text-foreground/80 text-right">
              {v.toFixed(3)}
            </span>
            <span className="col-span-3 text-[10px] text-muted-foreground/80">{r.hint}</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  query,
  suggestions,
  currentKind,
}: {
  query: string;
  suggestions: readonly string[];
  currentKind: string;
}) {
  const router = useRouter();
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-6 space-y-3">
      <p className="text-sm font-medium">「{query || '空のクエリ'}」に一致する結果はありません。</p>
      <p className="text-xs text-muted-foreground">
        意味検索でも当たらなかったため、別の表現に言い換えてみてください。
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set('q', s);
              if (currentKind && currentKind !== 'all') params.set('kind', currentKind);
              router.push(`/search?${params.toString()}`);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border',
              'px-3 h-8 text-xs',
              'border-border/70 bg-card/60 text-foreground',
              'hover:border-cinnabar/45 hover:text-cinnabar hover:bg-cinnabar/8',
              'transition-colors duration-fast ease-sumi',
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function renderHighlight(text: string, regex: RegExp | null, termSet: Set<string>): ReactNode {
  const segs = splitHighlight(text, regex, termSet);
  return segs.map((seg, i) =>
    seg.kind === 'match' ? (
      <mark
        // biome-ignore lint/suspicious/noArrayIndexKey: highlight 系は idx で十分
        key={i}
        className="bg-cinnabar/15 text-cinnabar rounded px-0.5 not-italic font-medium"
      >
        {seg.text}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: highlight 系は idx で十分
      <span key={i}>{seg.text}</span>
    ),
  );
}

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function postClick({
  queryId,
  hit,
  rank,
}: {
  queryId: string | null;
  hit: SearchHit;
  rank: number;
}) {
  // queryId が無い (degrade fixture) ときは click 記録をスキップ。
  if (!queryId) return;
  // UUID として妥当でない (fixture の "demo-" 接頭辞 ID) も skip。
  if (!/^[0-9a-f-]{36}$/i.test(hit.id)) return;
  try {
    const body = JSON.stringify({
      queryId,
      resultKind: hit.kind,
      resultId: hit.id,
      rank,
      score: hit.score,
    });
    const headers = { 'content-type': 'application/json' };
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/search/click', blob);
      if (ok) return;
    }
    // sendBeacon が失敗したら fetch (keepalive) で fire-and-forget。
    await fetch('/api/search/click', {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      credentials: 'same-origin',
    });
  } catch {
    // クリック記録は best-effort。失敗しても navigation を妨げない。
  }
}
