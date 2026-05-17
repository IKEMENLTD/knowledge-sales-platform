'use client';

import { cn } from '@/lib/utils';
import { Calendar, Filter, Search as SearchIcon, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * 検索フォーム — Client Component。
 *
 * 設計:
 *  - URL を Single Source of Truth として扱い、submit で `router.push` する。
 *  - kind chip は URL の `?kind=` と双方向同期。クリックで即座に push。
 *  - 期間プリセット (1週/1月/3月/全期間) は `from` / `to` を ISO 文字列で計算。
 *  - 担当者 select は `?owner=` と同期。`users` プロップで選択肢を server から受ける。
 *  - グローバル `/` ホットキーで検索 input にフォーカス (input/textarea 編集中は無視)。
 */

export type SearchUserOption = {
  id: string;
  fullName: string;
};

type Kind = 'all' | 'recording' | 'meeting' | 'contact';
type Period = 'all' | '1w' | '1m' | '3m';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'recording', label: '録画' },
  { value: 'meeting', label: '商談' },
  { value: 'contact', label: '名刺' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: '全期間' },
  { value: '1w', label: '1週間' },
  { value: '1m', label: '1ヶ月' },
  { value: '3m', label: '3ヶ月' },
];

function periodToFrom(period: Period): string | undefined {
  if (period === 'all') return undefined;
  const now = new Date();
  const d = new Date(now);
  if (period === '1w') d.setDate(now.getDate() - 7);
  else if (period === '1m') d.setMonth(now.getMonth() - 1);
  else if (period === '3m') d.setMonth(now.getMonth() - 3);
  return d.toISOString();
}

function fromToPeriod(from: string | null): Period {
  if (!from) return 'all';
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return 'all';
  const now = Date.now();
  const diffDays = (now - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 8) return '1w';
  if (diffDays <= 32) return '1m';
  if (diffDays <= 95) return '3m';
  return 'all';
}

export type SearchFormProps = {
  /** 現在のクエリ (server で正規化済み) */
  initialQuery: string;
  initialKind: Kind;
  initialOwnerId: string | null;
  initialFromIso: string | null;
  users: SearchUserOption[];
  /** よく聞かれる質問 (server から固定 5 件) */
  suggestions: readonly string[];
};

export function SearchForm({
  initialQuery,
  initialKind,
  initialOwnerId,
  initialFromIso,
  users,
  suggestions,
}: SearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [ownerId, setOwnerId] = useState<string>(initialOwnerId ?? '');
  const [period, setPeriod] = useState<Period>(fromToPeriod(initialFromIso));

  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const ownerId_ = useId();
  const periodId = useId();

  // URL から再導入 (戻る/進むで state を同期)
  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    const k = (searchParams.get('kind') ?? 'all') as Kind;
    setKind(KIND_OPTIONS.some((o) => o.value === k) ? k : 'all');
    setOwnerId(searchParams.get('owner') ?? '');
    setPeriod(fromToPeriod(searchParams.get('from')));
  }, [searchParams]);

  const pushQuery = useCallback(
    (next: { q?: string; kind?: Kind; ownerId?: string; period?: Period }) => {
      const params = new URLSearchParams();
      const nq = (next.q ?? q).trim();
      if (nq) params.set('q', nq);
      const nKind = next.kind ?? kind;
      if (nKind && nKind !== 'all') params.set('kind', nKind);
      const nOwner = next.ownerId ?? ownerId;
      if (nOwner) params.set('owner', nOwner);
      const nPeriod = next.period ?? period;
      const fromIso = periodToFrom(nPeriod);
      if (fromIso) params.set('from', fromIso);
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : '/search');
    },
    [q, kind, ownerId, period, router],
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    pushQuery({});
  };

  // `/` ホットキー — 編集 element にフォーカスがある時はスキップ。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const userOptions = useMemo(
    () => [{ id: '', fullName: 'すべての担当者' } as SearchUserOption, ...users],
    [users],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: <search> 要素は React 19 + Next 15 で型定義未整備。role=search を採用。
    <form onSubmit={onSubmit} role="search" className="space-y-3">
      <label
        htmlFor={inputId}
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border/70 bg-card',
          'shadow-sumi-sm shadow-inset-top px-4 h-14 cursor-text',
          'transition-[border-color,box-shadow] duration-fast ease-sumi',
          'focus-within:border-cinnabar/55 focus-within:shadow-focus-ring-cinnabar',
        )}
      >
        <SearchIcon aria-hidden strokeWidth={1.6} className="size-5 text-muted-foreground" />
        <input
          ref={inputRef}
          id={inputId}
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="価格交渉でうまくいったケース"
          aria-label="ナレッジを検索"
          autoComplete="off"
          spellCheck={false}
          className="bg-transparent outline-none text-base flex-1 placeholder:text-muted-foreground/70"
        />
        {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: kbd は仕様上飾りのみで操作対象ではないため presentation で隠す */}
        <kbd
          role="presentation"
          className="hidden sm:inline-flex items-center gap-1 rounded border border-border/70 px-1.5 h-6 text-[10px] tracking-wide text-muted-foreground bg-muted/50"
        >
          /
        </kbd>
        <button
          type="submit"
          className={cn(
            'hidden sm:inline-flex items-center rounded-md border border-cinnabar/40 text-cinnabar bg-cinnabar/8',
            'px-3 h-8 text-xs font-medium tracking-wide',
            'hover:bg-cinnabar/14 hover:border-cinnabar/55 transition-colors duration-fast ease-sumi',
          )}
        >
          検索
        </button>
      </label>

      <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0 m-0">
        <legend className="kicker flex items-center gap-1 mr-2">
          <Filter aria-hidden strokeWidth={1.6} className="size-3" />
          種別
        </legend>
        {KIND_OPTIONS.map((opt) => {
          const active = kind === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              aria-pressed={active}
              onClick={() => {
                setKind(opt.value);
                pushQuery({ kind: opt.value });
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border',
                'px-3 h-8 text-xs',
                'transition-colors duration-fast ease-sumi',
                active
                  ? 'border-cinnabar/55 text-cinnabar bg-cinnabar/10'
                  : 'border-border/70 bg-card/60 text-foreground hover:border-cinnabar/45 hover:text-cinnabar hover:bg-cinnabar/8',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label htmlFor={periodId} className="space-y-1.5">
          <span className="kicker flex items-center gap-1">
            <Calendar aria-hidden strokeWidth={1.6} className="size-3" />
            期間
          </span>
          <select
            id={periodId}
            value={period}
            onChange={(e) => {
              const next = e.target.value as Period;
              setPeriod(next);
              pushQuery({ period: next });
            }}
            className={cn(
              'w-full rounded-md border border-border/70 bg-card',
              'px-3 h-9 text-sm',
              'focus:outline-none focus:border-cinnabar/55 focus:shadow-focus-ring-cinnabar',
              'transition-[border-color,box-shadow] duration-fast ease-sumi',
            )}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={ownerId_} className="space-y-1.5">
          <span className="kicker flex items-center gap-1">
            <User aria-hidden strokeWidth={1.6} className="size-3" />
            担当者
          </span>
          <select
            id={ownerId_}
            value={ownerId}
            onChange={(e) => {
              const next = e.target.value;
              setOwnerId(next);
              pushQuery({ ownerId: next });
            }}
            className={cn(
              'w-full rounded-md border border-border/70 bg-card',
              'px-3 h-9 text-sm',
              'focus:outline-none focus:border-cinnabar/55 focus:shadow-focus-ring-cinnabar',
              'transition-[border-color,box-shadow] duration-fast ease-sumi',
            )}
          >
            {userOptions.map((u) => (
              <option key={u.id || 'all'} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="kicker">よく聞かれる質問</span>
        {suggestions.map((sample) => {
          const active = sample === q;
          return (
            <button
              key={sample}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                setQ(sample);
                pushQuery({ q: sample });
              }}
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
            </button>
          );
        })}
      </div>
    </form>
  );
}
