'use client';

/**
 * ステージ別カンバン — HTML5 ネイティブ Drag & Drop + キーボード DnD。
 *
 * dnd-kit を本 PR では追加できない (apps/web/package.json は触らない規約) ため、
 * ブラウザ標準の `draggable` 属性で実装。a11y は @dnd-kit announcer に倣い、
 * `aria-live="polite"` の sr-only 領域でステージ遷移を読み上げる。
 *
 * キーボード DnD:
 *   1. カードのドラッグハンドル (GripVertical) に Tab → Enter / Space で「掴む」
 *   2. ← → で隣接ステージへ移動 (drop ターゲットを変更)
 *   3. Enter / Space で「離す」 → API PATCH
 *   4. Escape で破棄
 *
 * 楽観的更新:
 *   - 表示状態 (groups) は即時更新
 *   - PATCH 成功で確定
 *   - 失敗時は ロールバック + toast.error
 *   - 404 (API 未実装) は別 toast で「API がまだ準備中」を伝え、表示は楽観値のまま維持
 */

import { type DemoMeetingStage, STAGE_LABELS } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { MeetingCardData } from './meeting-card';
import { MeetingCard, STAGE_TONE } from './meeting-card';

const STAGE_ORDER: DemoMeetingStage[] = ['scheduled', 'in_progress', 'won', 'lost', 'on_hold'];

export type KanbanBoardProps = {
  meetings: MeetingCardData[];
  /** API が未実装の前提で動かすときは true。toast 文言だけ差し替わる。 */
  isFixtureMode?: boolean;
};

type GroupMap = Record<DemoMeetingStage, MeetingCardData[]>;

function groupByStage(items: MeetingCardData[]): GroupMap {
  const map: GroupMap = {
    scheduled: [],
    in_progress: [],
    won: [],
    lost: [],
    on_hold: [],
  };
  for (const m of items) map[m.stage].push(m);
  for (const k of STAGE_ORDER) {
    map[k].sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  }
  return map;
}

export function KanbanBoard({ meetings, isFixtureMode = false }: KanbanBoardProps) {
  const [groups, setGroups] = useState<GroupMap>(() => groupByStage(meetings));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [keyboardPick, setKeyboardPick] = useState<{
    id: string;
    fromStage: DemoMeetingStage;
    targetStage: DemoMeetingStage;
  } | null>(null);
  const [announce, setAnnounce] = useState<string>('');
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceId = useId();

  const speak = useCallback((msg: string) => {
    setAnnounce(msg);
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnounce(''), 1500);
  }, []);

  /** 楽観更新 + PATCH。返り値は API に投げて成功したか。 */
  const applyStageChange = useCallback(
    async (id: string, from: DemoMeetingStage, to: DemoMeetingStage) => {
      if (from === to) return true;

      const prev = groups;
      // 楽観更新
      setGroups((g) => {
        const next: GroupMap = {
          scheduled: [...g.scheduled],
          in_progress: [...g.in_progress],
          won: [...g.won],
          lost: [...g.lost],
          on_hold: [...g.on_hold],
        };
        const idx = next[from].findIndex((m) => m.id === id);
        if (idx === -1) return g;
        const removed = next[from].splice(idx, 1);
        const moved = removed[0];
        if (!moved) return g;
        const updated: MeetingCardData = { ...moved, stage: to };
        next[to] = [updated, ...next[to]];
        return next;
      });
      speak(`${STAGE_LABELS[from]} から ${STAGE_LABELS[to]} へ移動しました。`);

      if (isFixtureMode) {
        toast.message('サンプルデータのため一時的な移動です', {
          description: 'DB 接続後に永続化されます。',
        });
        return true;
      }

      try {
        // P0-M-01 fix: API 側は POST + { toStage } 受け (audit を必ず残す設計)。
        // 従来 PATCH + { stage } で送っていたため 405 / 422 で全壊していた。
        const res = await fetch(`/api/meetings/${id}/stage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toStage: to }),
        });
        if (res.ok) {
          toast.success(`${STAGE_LABELS[to]} に移動しました`);
          return true;
        }
        if (res.status === 404) {
          toast.message('API がまだ準備中です', {
            description: '表示上は移動済みです (リロードで戻ります)。',
          });
          return false;
        }
        throw new Error(`POST /api/meetings/${id}/stage failed: ${res.status}`);
      } catch (err) {
        // ロールバック
        setGroups(prev);
        speak(`移動に失敗しました。${STAGE_LABELS[from]} に戻しました。`);
        toast.error('ステージ移動に失敗しました', {
          description: err instanceof Error ? err.message : '通信エラー',
        });
        return false;
      }
    },
    [groups, isFixtureMode, speak],
  );

  // HTML5 DnD ハンドラ ------------------------------------------------------
  const onDragStart = (id: string, stage: DemoMeetingStage) => {
    setDraggingId(id);
    speak(`${STAGE_LABELS[stage]} のカードを掴みました。`);
  };
  const onDragEnd = () => {
    setDraggingId(null);
  };
  const onDropTo = (stage: DemoMeetingStage) => {
    if (!draggingId) return;
    const from = (Object.keys(groups) as DemoMeetingStage[]).find((s) =>
      groups[s].some((m) => m.id === draggingId),
    );
    if (!from) return;
    void applyStageChange(draggingId, from, stage);
    setDraggingId(null);
  };

  // キーボード DnD --------------------------------------------------------
  const pickWithKeyboard = (id: string, stage: DemoMeetingStage) => {
    setKeyboardPick({ id, fromStage: stage, targetStage: stage });
    speak(
      `${STAGE_LABELS[stage]} のカードを掴みました。矢印キーで移動先を選び、もう一度 Space で離します。`,
    );
  };
  const moveKeyboardTarget = (dir: -1 | 1) => {
    setKeyboardPick((cur) => {
      if (!cur) return cur;
      const idx = STAGE_ORDER.indexOf(cur.targetStage);
      const nextIdx = Math.max(0, Math.min(STAGE_ORDER.length - 1, idx + dir));
      const nextStage = STAGE_ORDER[nextIdx] ?? cur.targetStage;
      if (nextStage !== cur.targetStage) {
        speak(`移動先候補: ${STAGE_LABELS[nextStage]}`);
      }
      return { ...cur, targetStage: nextStage };
    });
  };
  const releaseKeyboard = (commit: boolean) => {
    if (!keyboardPick) return;
    if (commit) {
      void applyStageChange(keyboardPick.id, keyboardPick.fromStage, keyboardPick.targetStage);
    } else {
      speak('移動を取り消しました。');
    }
    setKeyboardPick(null);
  };

  const totalCount = useMemo(
    () => STAGE_ORDER.reduce((acc, s) => acc + groups[s].length, 0),
    [groups],
  );

  return (
    <>
      <ol
        className={cn(
          // モバイル: 横スクロール + scroll-snap で 1 列ずつスナップ
          'flex sm:grid gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-5',
          'overflow-x-auto sm:overflow-visible',
          'snap-x snap-mandatory sm:snap-none',
          // iOS Safari の慣性スクロール
          '-mx-4 px-4 sm:mx-0 sm:px-0',
          'touch-pan-x',
        )}
        aria-label={`商談ステージ ${totalCount} 件`}
        aria-describedby={announceId}
      >
        {STAGE_ORDER.map((stage) => {
          const list = groups[stage];
          const isDropTarget =
            (draggingId !== null && stage) ||
            (keyboardPick !== null && keyboardPick.targetStage === stage);

          return (
            <li
              key={stage}
              className={cn(
                'flex flex-col gap-3 min-w-0',
                // モバイル横スクロール時はビュー幅の 80% で snap、sm 以上は通常 grid
                'snap-start shrink-0 w-[82vw] sm:w-auto sm:shrink',
              )}
              onDragOver={(e) => {
                if (draggingId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDropTo(stage);
              }}
            >
              <div
                className={cn(
                  'flex items-center justify-between sticky z-[1] bg-background/85 backdrop-blur py-2',
                  'top-[calc(var(--app-header-h,3.5rem)+env(safe-area-inset-top))]',
                  keyboardPick?.targetStage === stage &&
                    'ring-2 ring-cinnabar/60 rounded-md px-2 -mx-2',
                )}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className={cn('size-2 rounded-full', STAGE_TONE[stage].dot)} />
                  <h3 className="display text-sm font-semibold tracking-crisp">
                    {STAGE_LABELS[stage]}
                  </h3>
                </div>
                <span className="kicker tabular">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <EmptyColumn highlight={Boolean(isDropTarget) && draggingId !== null} />
              ) : (
                list.map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => onDragStart(m.id, stage)}
                    onDragEnd={onDragEnd}
                  >
                    <MeetingCard
                      meeting={m}
                      isDragging={draggingId === m.id || keyboardPick?.id === m.id}
                      dragHandleProps={{
                        onKeyDown: (e) => {
                          // Space / Enter で pick / release のトグル
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            if (keyboardPick?.id === m.id) {
                              releaseKeyboard(true);
                            } else {
                              pickWithKeyboard(m.id, stage);
                            }
                            return;
                          }
                          if (!keyboardPick || keyboardPick.id !== m.id) return;
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            moveKeyboardTarget(-1);
                          } else if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            moveKeyboardTarget(1);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            releaseKeyboard(false);
                          }
                        },
                        // ハンドルクリックで Link 遷移を止める
                        onClick: (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        },
                      }}
                    />
                  </div>
                ))
              )}
            </li>
          );
        })}
      </ol>
      {/* announcer — @dnd-kit と同じ役割の sr-only live region */}
      <output id={announceId} aria-live="polite" aria-atomic="true" className="sr-only">
        {announce}
      </output>
    </>
  );
}

function EmptyColumn({ highlight = false }: { highlight?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border/60 p-4 text-center transition-colors',
        highlight && 'border-cinnabar/40 bg-cinnabar/5',
      )}
    >
      <p className="text-xs text-muted-foreground">該当なし</p>
    </div>
  );
}
