'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CheckSquare, Square } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { PlayerController } from './recording-player';

/**
 * 約束事項 (commitments) + 次のアクション (next_actions) のチェックリスト。
 *
 *  - 各行はクリック (時刻アンカーがあれば) でその時刻まで動画ジャンプ
 *  - チェックボックスで完了/未完了を切替。完了で onCompleteCommitment が発火し、
 *    親はそれを引き継ぎ通知 (notifications.handoff_pending) の起動に使う想定。
 *    API が未実装でも UI 上は state に保持して表示が変わる
 *  - サンプルモード時はチェック状態は localStorage に保存しない (ページ離脱で消える)
 */

export type CommitmentItem = {
  /** 一意 key (recordingId + atSec + index 等) */
  id: string;
  who?: string | null;
  what: string;
  byWhen?: string | null;
  atSec?: number | null;
};

export type NextActionItem = {
  id: string;
  what: string;
  owner?: string | null;
  dueDate?: string | null;
};

export interface CommitmentsPanelProps {
  commitments: CommitmentItem[];
  nextActions: NextActionItem[];
  controllerRef: React.RefObject<PlayerController | null>;
  /** 完了/未完了の永続化を試みる。失敗しても UI は更新する。 */
  onToggleCommitment?: (id: string, done: boolean) => Promise<void> | void;
  onToggleNextAction?: (id: string, done: boolean) => Promise<void> | void;
  /** すべて完了したら handoff_pending を fire (UI 上のヒント表示も) */
  onAllDone?: () => void;
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

export function CommitmentsPanel({
  commitments,
  nextActions,
  controllerRef,
  onToggleCommitment,
  onToggleNextAction,
  onAllDone,
}: CommitmentsPanelProps) {
  const [doneCommitments, setDoneCommitments] = useState<Record<string, boolean>>({});
  const [doneNextActions, setDoneNextActions] = useState<Record<string, boolean>>({});

  const total = commitments.length + nextActions.length;
  const doneCount =
    commitments.filter((c) => doneCommitments[c.id]).length +
    nextActions.filter((a) => doneNextActions[a.id]).length;

  // 全完了で fire (1度のみ。done -> undone に戻る場合は再度 fire 可能)
  useEffect(() => {
    if (total > 0 && doneCount === total) onAllDone?.();
  }, [total, doneCount, onAllDone]);

  const toggleCommitment = useCallback(
    async (id: string) => {
      setDoneCommitments((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        return next;
      });
      try {
        await onToggleCommitment?.(id, !doneCommitments[id]);
      } catch {
        /* fallback: UI は既に切替済み。同期失敗は静かに無視 */
      }
    },
    [doneCommitments, onToggleCommitment],
  );

  const toggleNextAction = useCallback(
    async (id: string) => {
      setDoneNextActions((prev) => ({ ...prev, [id]: !prev[id] }));
      try {
        await onToggleNextAction?.(id, !doneNextActions[id]);
      } catch {
        /* noop */
      }
    },
    [doneNextActions, onToggleNextAction],
  );

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <p className="kicker">約束 ・ 次のアクション</p>
        <span className="kicker tabular text-muted-foreground">
          {doneCount} / {total} 完了
        </span>
      </header>

      <section className="space-y-2.5" aria-label="約束事項">
        <h3 className="display text-sm font-semibold tracking-crisp">商談中の約束</h3>
        {commitments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            この録画から抽出された約束事項はありません。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {commitments.map((c) => {
              const done = !!doneCommitments[c.id];
              const byWhen = formatDate(c.byWhen);
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-md border border-transparent p-2',
                      done ? 'bg-chitose-muted/60 dark:bg-chitose/15' : 'hover:bg-accent/40',
                      'transition-[background-color,border-color] duration-fast',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCommitment(c.id)}
                      aria-pressed={done}
                      aria-label={done ? '未完了に戻す' : '完了にする'}
                      className={cn(
                        'inline-flex items-center justify-center size-6 shrink-0 rounded',
                        done ? 'text-chitose' : 'text-muted-foreground hover:text-foreground',
                        'focus-visible:outline-none focus-visible:shadow-focus-ring',
                      )}
                    >
                      {done ? (
                        <CheckSquare strokeWidth={1.6} className="size-4" />
                      ) : (
                        <Square strokeWidth={1.6} className="size-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className={cn(
                          'text-sm leading-relaxed',
                          done ? 'line-through text-muted-foreground' : 'text-foreground/90',
                        )}
                      >
                        {c.what}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {c.who ? <span>担当: {c.who}</span> : null}
                        {byWhen ? <span>期限: {byWhen}</span> : null}
                        {typeof c.atSec === 'number' && c.atSec >= 0 ? (
                          <button
                            type="button"
                            onClick={() => controllerRef.current?.seekTo(c.atSec ?? 0)}
                            className={cn(
                              'tabular text-cinnabar hover:underline',
                              'focus-visible:outline-none focus-visible:underline',
                            )}
                          >
                            {formatTs(c.atSec)} の発言を見る
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2.5" aria-label="次のアクション">
        <h3 className="display text-sm font-semibold tracking-crisp">次のアクション</h3>
        {nextActions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            次のアクションはまだ登録されていません。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {nextActions.map((a) => {
              const done = !!doneNextActions[a.id];
              const due = formatDate(a.dueDate);
              return (
                <li key={a.id}>
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-md border border-transparent p-2',
                      done ? 'bg-chitose-muted/60 dark:bg-chitose/15' : 'hover:bg-accent/40',
                      'transition-[background-color,border-color] duration-fast',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleNextAction(a.id)}
                      aria-pressed={done}
                      aria-label={done ? '未完了に戻す' : '完了にする'}
                      className={cn(
                        'inline-flex items-center justify-center size-6 shrink-0 rounded',
                        done ? 'text-chitose' : 'text-muted-foreground hover:text-foreground',
                        'focus-visible:outline-none focus-visible:shadow-focus-ring',
                      )}
                    >
                      {done ? (
                        <CheckSquare strokeWidth={1.6} className="size-4" />
                      ) : (
                        <Square strokeWidth={1.6} className="size-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p
                        className={cn(
                          'text-sm leading-relaxed',
                          done ? 'line-through text-muted-foreground' : 'text-foreground/90',
                        )}
                      >
                        {a.what}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {a.owner ? <span>担当: {a.owner}</span> : null}
                        {due ? <span>期限: {due}</span> : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {total > 0 && doneCount === total ? (
        <output
          className={cn(
            'block text-xs leading-relaxed p-3 rounded-md border border-chitose/40',
            'bg-chitose-muted/70 dark:bg-chitose/15 text-chitose',
          )}
        >
          すべて完了しました。引き継ぎ書 (CS 部門宛) を作成できます。
        </output>
      ) : null}
    </Card>
  );
}
