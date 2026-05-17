'use client';

/**
 * 商談一覧のフィルタバー — URL クエリ同期 (担当者 / ステージ / 期間 / 自由検索)。
 *
 * SearchParams を Source of Truth として保持。フォームの onSubmit と select の onChange で
 * router.push し、Server Component 側の re-render に委ねる。
 *
 * クエリキー (URL 上は機械可読のため英語 key 維持。UI ラベルは編集的日本語のみ):
 *   stage      : DemoMeetingStage | ''        — 商談ステージ
 *   dealStatus : open | won | lost | on_hold  — 案件の状態
 *   ownerUserId: uuid | ''                    — 担当者
 *   q          : 自由検索 (タイトル / 会社名 / 次の一手 部分一致)
 *   from / to  : ISO date (yyyy-mm-dd)         — 期間
 */

import { Input } from '@/components/ui/input';
import { STAGE_LABELS } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import { Filter, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export type FilterOwner = { id: string; fullName: string };

export type MeetingFilterBarProps = {
  owners: FilterOwner[];
};

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全ステージ' },
  { value: 'scheduled', label: STAGE_LABELS.scheduled },
  { value: 'in_progress', label: STAGE_LABELS.in_progress },
  { value: 'won', label: STAGE_LABELS.won },
  { value: 'lost', label: STAGE_LABELS.lost },
  { value: 'on_hold', label: STAGE_LABELS.on_hold },
];

const DEAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全ての状態' },
  { value: 'open', label: '進行中' },
  { value: 'won', label: '受注' },
  { value: 'lost', label: '失注' },
  { value: 'on_hold', label: '保留' },
];

export function MeetingFilterBar({ owners }: MeetingFilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get('q') ?? '');
  const [stage, setStage] = useState(sp.get('stage') ?? '');
  const [dealStatus, setDealStatus] = useState(sp.get('dealStatus') ?? '');
  const [ownerUserId, setOwnerUserId] = useState(sp.get('ownerUserId') ?? '');
  const [from, setFrom] = useState(sp.get('from') ?? '');
  const [to, setTo] = useState(sp.get('to') ?? '');

  // 親の URL が外部 (戻る/履歴) で変わったら同期しなおす
  useEffect(() => {
    setQ(sp.get('q') ?? '');
    setStage(sp.get('stage') ?? '');
    setDealStatus(sp.get('dealStatus') ?? '');
    setOwnerUserId(sp.get('ownerUserId') ?? '');
    setFrom(sp.get('from') ?? '');
    setTo(sp.get('to') ?? '');
  }, [sp]);

  const hasAnyFilter = useMemo(
    () => Boolean(q || stage || dealStatus || ownerUserId || from || to),
    [q, stage, dealStatus, ownerUserId, from, to],
  );

  const push = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string> = {
      q,
      stage,
      dealStatus,
      ownerUserId,
      from,
      to,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push((qs ? `/meetings?${qs}` : '/meetings') as never);
  };

  const reset = () => {
    setQ('');
    setStage('');
    setDealStatus('');
    setOwnerUserId('');
    setFrom('');
    setTo('');
    router.push('/meetings' as never);
  };

  return (
    <form
      aria-label="商談検索"
      onSubmit={(e) => {
        e.preventDefault();
        push({});
      }}
      className={cn(
        'rounded-xl border border-border/60 bg-card/80 backdrop-blur p-3 md:p-4',
        'grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3',
      )}
    >
      <div className="md:col-span-4 relative">
        <Search
          aria-hidden
          strokeWidth={1.6}
          className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
        />
        <Input
          preset="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タイトル / 会社名 / 次の一手 を検索"
          className="pl-9"
          aria-label="自由検索"
        />
      </div>

      <select
        value={stage}
        onChange={(e) => {
          setStage(e.target.value);
          push({ stage: e.target.value });
        }}
        aria-label="商談ステージで絞り込み"
        className={cn(
          'md:col-span-2 h-11 rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
          'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
        )}
      >
        {STAGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={dealStatus}
        onChange={(e) => {
          setDealStatus(e.target.value);
          push({ dealStatus: e.target.value });
        }}
        aria-label="案件の状態で絞り込み"
        className={cn(
          'md:col-span-2 h-11 rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
          'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
        )}
      >
        {DEAL_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={ownerUserId}
        onChange={(e) => {
          setOwnerUserId(e.target.value);
          push({ ownerUserId: e.target.value });
        }}
        aria-label="担当者で絞り込み"
        className={cn(
          'md:col-span-2 h-11 rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
          'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
        )}
      >
        <option value="">全担当</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.fullName}
          </option>
        ))}
      </select>

      <div className="md:col-span-2 flex items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => push({ from })}
          aria-label="開始日"
          className="h-11 flex-1 min-w-0 rounded-md border border-border bg-surface-inset/60 px-2 text-xs tabular"
        />
        <span aria-hidden className="text-muted-foreground text-xs">
          〜
        </span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => push({ to })}
          aria-label="終了日"
          className="h-11 flex-1 min-w-0 rounded-md border border-border bg-surface-inset/60 px-2 text-xs tabular"
        />
      </div>

      <div className="md:col-span-12 flex items-center justify-between gap-2 pt-1">
        <p className="kicker flex items-center gap-1.5">
          <Filter aria-hidden strokeWidth={1.6} className="size-3" />
          <span>{hasAnyFilter ? '絞り込み中' : '全件表示'}</span>
        </p>
        <div className="flex items-center gap-2">
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={reset}
              className={cn(
                // モバイルでもタップしやすく 44px (h-11)、デスクトップは引き締めて h-9
                'inline-flex items-center gap-1.5 h-11 md:h-9 px-3 rounded-md border border-border/70 bg-background text-xs',
                'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <X aria-hidden strokeWidth={1.6} className="size-3.5" />
              クリア
            </button>
          ) : null}
          <button
            type="submit"
            className={cn(
              'inline-flex items-center gap-1.5 h-11 md:h-9 px-3 rounded-md text-xs font-medium',
              'bg-foreground text-background hover:bg-foreground/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            検索
          </button>
        </div>
      </div>
    </form>
  );
}
