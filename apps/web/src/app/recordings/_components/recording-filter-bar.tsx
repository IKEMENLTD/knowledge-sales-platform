'use client';

import { cn } from '@/lib/utils';
import { Filter, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'すべての状態' },
  { value: 'pending', label: '取り込み待ち' },
  { value: 'downloading', label: '取得中' },
  { value: 'transcribing', label: '文字起こし中' },
  { value: 'analyzing', label: '要約中' },
  { value: 'embedding', label: '索引化中' },
  { value: 'completed', label: '完了' },
  { value: 'failed', label: '失敗' },
];

const SELECT_CLASS = cn(
  'h-9 rounded-md border border-border bg-card/70 px-2.5 text-sm',
  'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
  'transition-[border-color,box-shadow,background-color] duration-fast ease-sumi',
  'hover:border-foreground/25 hover:bg-card',
  'focus-visible:outline-none focus-visible:border-ring focus-visible:bg-card',
  'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
);
const DATE_CLASS = cn(SELECT_CLASS, 'tabular w-[10.5rem]');

export type OwnerOption = { id: string; fullName: string };

/**
 * 録画一覧の URL クエリ同期 filter bar。
 * - select 操作で即時 router.push (transition 内で navigate)。
 * - 期間は YYYY-MM-DD の <input type="date">。値があるときだけ ISO 化して URL に積む。
 * - 「クリア」で全 query 解除。
 */
export function RecordingFilterBar({
  owners,
  defaultOwnerUserId,
  defaultStatus,
  defaultFrom,
  defaultTo,
}: {
  owners: OwnerOption[];
  defaultOwnerUserId?: string;
  defaultStatus?: string;
  /** YYYY-MM-DD (URL から渡される ISO の date 部だけ) */
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasFilter = useMemo(
    () => Boolean(defaultOwnerUserId || defaultStatus || defaultFrom || defaultTo),
    [defaultOwnerUserId, defaultStatus, defaultFrom, defaultTo],
  );

  const updateParam = useCallback(
    (key: string, raw: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!raw) next.delete(key);
      else next.set(key, raw);
      // offset を 0 に戻す (filter 変更時にページ位置は維持しない方が UX 上自然)
      next.delete('offset');
      const qs = next.toString();
      // typed routes (experimental) は動的 URL を `as never` で逃がす。/recordings 固定なので安全。
      const href = (qs ? `${pathname}?${qs}` : pathname) as never;
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router, searchParams],
  );

  const toIsoStart = (d: string) => (d ? `${d}T00:00:00.000Z` : null);
  const toIsoEnd = (d: string) => (d ? `${d}T23:59:59.999Z` : null);

  const onClear = useCallback(() => {
    startTransition(() => {
      router.push(pathname as never);
    });
  }, [pathname, router]);

  return (
    // role="search" は WAI-ARIA の検索 landmark。biome の useSemanticElements は
    // <input type="search"> への置換を提案するが、ここは複数 control を含む landmark
    // としての form なので意図通り。
    // biome-ignore lint/a11y/useSemanticElements: form を search landmark にしている
    <form
      role="search"
      aria-label="録画の絞り込み"
      className={cn(
        'rounded-lg border border-border/60 bg-card/70 p-3 md:p-4',
        'flex flex-wrap items-end gap-3',
      )}
      onSubmit={(e) => {
        // submit は使わず、各 control の onChange でナビゲーションする。
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <Filter aria-hidden strokeWidth={1.6} className="size-3.5" />
        絞り込み
      </div>

      <label className="flex flex-col gap-1">
        <span className="kicker">担当者</span>
        <select
          className={SELECT_CLASS}
          aria-label="担当者で絞り込む"
          defaultValue={defaultOwnerUserId ?? ''}
          onChange={(e) => updateParam('ownerUserId', e.target.value || null)}
          disabled={isPending}
        >
          <option value="">すべての担当者</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="kicker">状態</span>
        <select
          className={SELECT_CLASS}
          aria-label="処理状態で絞り込む"
          defaultValue={defaultStatus ?? ''}
          onChange={(e) => updateParam('status', e.target.value || null)}
          disabled={isPending}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="kicker">開始日</span>
        <input
          type="date"
          className={DATE_CLASS}
          aria-label="開始日"
          defaultValue={defaultFrom ?? ''}
          onChange={(e) => updateParam('from', toIsoStart(e.target.value))}
          disabled={isPending}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="kicker">終了日</span>
        <input
          type="date"
          className={DATE_CLASS}
          aria-label="終了日"
          defaultValue={defaultTo ?? ''}
          onChange={(e) => updateParam('to', toIsoEnd(e.target.value))}
          disabled={isPending}
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        {isPending ? (
          <span className="kicker text-muted-foreground" aria-live="polite">
            更新中…
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          disabled={!hasFilter || isPending}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border/70 bg-card/60',
            'px-2.5 h-9 text-xs text-muted-foreground transition-colors',
            'hover:text-foreground hover:border-foreground/30',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <X aria-hidden strokeWidth={1.8} className="size-3.5" />
          クリア
        </button>
      </div>
    </form>
  );
}
