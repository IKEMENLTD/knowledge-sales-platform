'use client';

import {
  buildHighlightRegex,
  buildTermSet,
  splitHighlight,
  tokenizeQuery,
} from '@/app/search/_lib/highlight';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, Pencil, Search, X } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PlayerController, SpeakerColorMap } from './recording-player';

/**
 * 文字起こしペイン。
 *
 * - 全 segment を時刻順表示
 * - クリック → `controllerRef.current?.seekTo(startSec)` で動画ジャンプ
 * - 親から渡される `currentSec` の範囲に該当する segment を highlight + 自動スクロール
 * - 検索 box (台詞内 substring) → 最初のヒットへスクロール + 全ヒットを `<mark>` で強調
 * - 話者ラベルは inline edit (PATCH は別途、UI 完結。確定で onSpeakerRename を発火)
 *
 * a11y:
 *  - ul > li[role="listitem"]、現在再生中 segment は aria-current="time"
 *  - segment クリックは button (Enter/Space で発火)
 *  - 検索 input は role=searchbox / aria-controls=transcript-list
 */

export type TranscriptSegmentLite = {
  index: number;
  startSec: number;
  endSec: number;
  speakerLabel: string | null;
  text: string;
};

export interface TranscriptPaneProps {
  segments: TranscriptSegmentLite[];
  /** 現在の動画再生秒数。これに該当する segment を高亮 */
  currentSec: number;
  /** クリックで動画位置を変えるための controller */
  controllerRef: React.RefObject<PlayerController | null>;
  /** 話者ごとの色 (recording-player.tsx 由来) */
  speakerColors: SpeakerColorMap;
  /** 話者ラベルの確定リネーム時に発火 (API 呼び出しは親で) */
  onSpeakerRename?: (oldLabel: string, newLabel: string) => void;
}

function formatTs(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function TranscriptPane({
  segments,
  currentSec,
  controllerRef,
  speakerColors,
  onSpeakerRename,
}: TranscriptPaneProps) {
  const [query, setQuery] = useState('');
  // 話者ラベルの上書きマップ (UI 内ローカル。確定で onSpeakerRename + props 側で永続化)
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});

  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startSec - b.startSec),
    [segments],
  );

  // ハイライト用 regex
  const terms = useMemo(() => tokenizeQuery(query), [query]);
  const regex = useMemo(() => buildHighlightRegex(terms), [terms]);
  const termSet = useMemo(() => buildTermSet(terms), [terms]);

  // 検索結果 index リスト
  const matchIndices = useMemo(() => {
    if (terms.length === 0) return [];
    const lowerTerms = terms.map((t) => t.toLowerCase());
    return sortedSegments
      .filter((s) => {
        const t = s.text.toLowerCase();
        return lowerTerms.some((q) => t.includes(q));
      })
      .map((s) => s.index);
  }, [sortedSegments, terms]);

  // currentSec → 現在 segment index
  const activeIndex = useMemo(() => {
    const first = sortedSegments[0];
    if (!first) return null;
    // bisect 的に最後にヒットしたものを取る (start <= currentSec < end)
    let candidate = first.index;
    for (const s of sortedSegments) {
      if (s.startSec <= currentSec) candidate = s.index;
      else break;
    }
    return candidate;
  }, [sortedSegments, currentSec]);

  // 自動スクロール: 再生中 segment が view から外れたら scroll
  useEffect(() => {
    if (activeIndex === null) return;
    const el = itemRefs.current.get(activeIndex);
    if (!el || !listRef.current) return;
    const list = listRef.current;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top + 24 || elRect.bottom > listRect.bottom - 24) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleSearchKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && matchIndices.length > 0) {
        const first = matchIndices[0];
        if (first === undefined) {
          e.preventDefault();
          return;
        }
        const target = sortedSegments.find((s) => s.index === first);
        if (target) {
          controllerRef.current?.seekTo(target.startSec);
          const el = itemRefs.current.get(first);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setQuery('');
        e.preventDefault();
      }
    },
    [matchIndices, sortedSegments, controllerRef],
  );

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <p className="kicker">文字起こし</p>
        <span className="kicker tabular">
          {sortedSegments.length} 発言
          {terms.length > 0 ? ` ・ ヒット ${matchIndices.length} 件` : ''}
        </span>
      </header>

      <div className="relative">
        <Search
          aria-hidden
          strokeWidth={1.6}
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/80 pointer-events-none"
        />
        <Input
          preset="search"
          role="searchbox"
          aria-controls="transcript-list"
          aria-label="台詞内を検索"
          placeholder="台詞を検索 (Enter で先頭ヒットへジャンプ)"
          value={query}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKey}
          className="pl-9 pr-9"
        />
        {query ? (
          <button
            type="button"
            aria-label="検索をクリア"
            onClick={() => setQuery('')}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center',
              'size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent',
              'focus-visible:outline-none focus-visible:shadow-focus-ring',
            )}
          >
            <X strokeWidth={1.6} className="size-4" />
          </button>
        ) : null}
      </div>

      <ul
        id="transcript-list"
        ref={listRef}
        aria-label="文字起こしの発言一覧"
        className={cn(
          'max-h-[640px] overflow-y-auto space-y-1.5 pr-1',
          '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]',
        )}
      >
        {sortedSegments.map((s) => {
          const rawLabel = (s.speakerLabel ?? '不明').toString();
          const label = labelOverrides[rawLabel] ?? rawLabel;
          const color = speakerColors[rawLabel] ?? speakerColors[label] ?? null;
          const isActive = s.index === activeIndex;
          const isMatch = matchIndices.includes(s.index);
          const segments = splitHighlight(s.text, regex, termSet);
          return (
            <li
              key={s.index}
              ref={(el) => {
                if (el) itemRefs.current.set(s.index, el);
                else itemRefs.current.delete(s.index);
              }}
              aria-current={isActive ? 'time' : undefined}
              className={cn(
                'group rounded-md border transition-[border-color,background-color] duration-fast',
                isActive
                  ? 'border-cinnabar/40 bg-cinnabar/[0.06] dark:bg-cinnabar/[0.10]'
                  : isMatch
                    ? 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/[0.08]'
                    : 'border-transparent hover:border-border/70 hover:bg-accent/40',
              )}
            >
              <div className="flex items-start gap-3 p-2.5">
                <button
                  type="button"
                  onClick={() => controllerRef.current?.seekTo(s.startSec)}
                  aria-label={`${formatTs(s.startSec)} の発言へジャンプ`}
                  className={cn(
                    'tabular text-[11px] w-12 shrink-0 text-muted-foreground pt-0.5 text-left',
                    'hover:text-cinnabar focus-visible:outline-none focus-visible:text-cinnabar',
                  )}
                >
                  {formatTs(s.startSec)}
                </button>
                <div className="flex-1 min-w-0 space-y-1">
                  <SpeakerLabel
                    label={label}
                    color={color}
                    onCommit={(next) => {
                      if (!next || next === label) return;
                      setLabelOverrides((prev) => ({ ...prev, [rawLabel]: next }));
                      onSpeakerRename?.(rawLabel, next);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => controllerRef.current?.seekTo(s.startSec)}
                    aria-label={`${formatTs(s.startSec)} の発言を再生`}
                    className={cn(
                      'block w-full text-left text-sm leading-relaxed text-foreground/90 cursor-pointer',
                      'whitespace-pre-wrap break-words bg-transparent p-0 m-0',
                      'focus-visible:outline-none focus-visible:bg-accent/40 rounded',
                    )}
                  >
                    {segments.map((seg, i) =>
                      seg.kind === 'match' ? (
                        <mark
                          key={`m-${s.index}-${i}-${seg.text}`}
                          className="bg-amber-200/70 dark:bg-amber-400/30 text-foreground rounded-sm px-0.5"
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={`t-${s.index}-${i}-${seg.text.slice(0, 8)}`}>{seg.text}</span>
                      ),
                    )}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {sortedSegments.length === 0 ? (
          <li className="text-sm text-muted-foreground p-4 text-center">
            文字起こしがまだありません。処理が完了するとここに並びます。
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function SpeakerLabel({
  label,
  color,
  onCommit,
}: {
  label: string;
  color: SpeakerColorMap[string] | null;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      setDraft(label);
    }
  }, [editing, label]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onCommit(trimmed);
    setEditing(false);
  }, [draft, label, onCommit]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              e.preventDefault();
            } else if (e.key === 'Escape') {
              cancel();
              e.preventDefault();
            }
          }}
          aria-label="話者名を編集"
          className={cn(
            'h-6 text-[11px] px-2 rounded border border-cinnabar/50 bg-card',
            'focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
            'tracking-crisp font-medium',
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="決定"
          onClick={commit}
          className="size-7"
        >
          <Check strokeWidth={1.6} className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="キャンセル"
          onClick={cancel}
          className="size-7"
        >
          <X strokeWidth={1.6} className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium tracking-crisp ring-1 ring-inset',
          color?.bg ?? 'bg-card/60',
          color?.fg ?? 'text-foreground/80',
          color?.ring ?? 'ring-border/70',
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${label} を編集`}
        className={cn(
          'inline-flex items-center justify-center size-6 rounded text-muted-foreground',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          'hover:text-foreground hover:bg-accent transition-opacity duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus-ring',
        )}
      >
        <Pencil strokeWidth={1.6} className="size-3" />
      </button>
    </div>
  );
}
