'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CheckSquare, Send, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type Commitment = {
  /** 行 ID。録画 JSON でユニークになる想定。fallback で `${i}` */
  id: string;
  /** 録画内タイムスタンプ秒。無ければ null */
  atSec: number | null;
  text: string;
  done: boolean;
  /** Recording.id (タイムスタンプジャンプ用) */
  recordingId?: string | null;
};

/**
 * 約束事項 + 次のアクション。
 *
 * - チェックボックスで完了/未完了をトグル。PATCH /api/meetings/[id] に
 *   commitmentUpdates として送る (API 側はオプショナル受信)。
 * - 完了 toggle 時、サーバが notifications を発火する (CS 通知 / OWNER 確認)。
 * - API 失敗時は元の状態に戻す。
 */
export function CommitmentsList({
  meetingId,
  initialCommitments,
  nextAction,
  isSample,
}: {
  meetingId: string;
  initialCommitments: Commitment[];
  nextAction: string | null;
  isSample: boolean;
}) {
  const [commitments, setCommitments] = useState<Commitment[]>(initialCommitments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (id: string) => {
    if (isSample) {
      setError('サンプルデータでは保存できません');
      return;
    }
    const prev = commitments;
    const next = commitments.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
    setCommitments(next);
    setError(null);

    const updated = next.find((c) => c.id === id);
    if (!updated) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            commitmentUpdates: [{ id, done: updated.done }],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 通知タブ等の更新のため router refresh
        router.refresh();
      } catch (_e) {
        setCommitments(prev);
        setError('完了状態を保存できませんでした');
      }
    });
  };

  return (
    <section aria-labelledby="commitments-heading" className="space-y-4">
      <div className="flex items-baseline gap-3">
        <CheckSquare aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2 id="commitments-heading" className="display text-lg font-semibold tracking-crisp">
          約束したこと、次の一手
        </h2>
        <span className="kicker tabular">
          {commitments.filter((c) => c.done).length} / {commitments.length} 完了
        </span>
      </div>

      {nextAction ? (
        <Card className="p-5 border-l-2 border-cinnabar/70 bg-cinnabar/[0.04]">
          <p className="kicker">次のアクション</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            <Send
              aria-hidden
              strokeWidth={1.6}
              className="inline size-3.5 mr-1.5 -mt-0.5 text-cinnabar"
            />
            {nextAction}
          </p>
        </Card>
      ) : null}

      <Card className="p-2">
        {commitments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            まだ約束事項はありません。録画解析後に自動で並びます。
          </p>
        ) : (
          <ul className="divide-y divide-border/60" aria-label="約束事項">
            {commitments.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  disabled={pending}
                  aria-pressed={c.done}
                  className={cn(
                    'group w-full flex items-start gap-3 p-3 text-left rounded-md',
                    'transition-colors duration-fast ease-sumi',
                    'hover:bg-accent/60 focus-visible:outline-none focus-visible:shadow-focus-ring',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  {c.done ? (
                    <CheckSquare
                      aria-hidden
                      strokeWidth={1.6}
                      className="size-5 mt-0.5 shrink-0 text-cinnabar"
                    />
                  ) : (
                    <Square
                      aria-hidden
                      strokeWidth={1.6}
                      className="size-5 mt-0.5 shrink-0 text-muted-foreground/80 group-hover:text-foreground/80"
                    />
                  )}
                  <span
                    className={cn(
                      'flex-1 text-sm leading-relaxed',
                      c.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {c.text}
                  </span>
                  {c.atSec != null ? (
                    <span className="kicker tabular shrink-0">{formatTimestamp(c.atSec)}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
