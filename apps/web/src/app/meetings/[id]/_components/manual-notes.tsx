'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

/**
 * 営業マンの手書きメモ (markdown 簡易)。
 *
 * - textarea で書きながら、変更が 3 秒間止まったら自動保存 (PATCH manualNotes)
 * - 保存中・保存済み・エラーの 3 状態を inline で表示
 * - blur 時にも即時保存
 * - 入力上限 zod (20000) と一致
 */
const AUTOSAVE_DEBOUNCE_MS = 3_000;
const MAX_LENGTH = 20_000;

type SaveState =
  | { kind: 'idle'; savedAt: Date | null }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

export function ManualNotes({
  meetingId,
  initialNotes,
  isSample,
}: {
  meetingId: string;
  initialNotes: string;
  isSample: boolean;
}) {
  const [value, setValue] = useState(initialNotes);
  const [state, setState] = useState<SaveState>({ kind: 'idle', savedAt: null });
  const [, startTransition] = useTransition();
  const lastSavedRef = useRef(initialNotes);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新の prop / state を ref 経由で参照することで、effect 依存配列を空に保つ
  // (auto-save タイマーをキー入力ごとに作り直したくないため)。
  const valueRef = useRef(value);
  valueRef.current = value;
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;
  const isSampleRef = useRef(isSample);
  isSampleRef.current = isSample;

  // 依存は全て ref 経由なので useCallback([]) で stable に保てる。
  const persist = useCallback((next: string) => {
    if (isSampleRef.current) {
      setState({ kind: 'error', message: 'サンプルデータでは保存できません' });
      return;
    }
    if (next === lastSavedRef.current) return;
    setState({ kind: 'saving' });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingIdRef.current}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ manualNotes: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastSavedRef.current = next;
        setState({ kind: 'idle', savedAt: new Date() });
      } catch (_e) {
        setState({ kind: 'error', message: '保存に失敗しました' });
      }
    });
  }, []);

  // debounce — value 変化を ref 経由で読む。
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value === lastSavedRef.current) return;
    timerRef.current = setTimeout(() => {
      persist(valueRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, persist]);

  // unmount で flush。ref 経由で最新値を読むため依存配列は空で OK。
  useEffect(() => {
    return () => {
      if (valueRef.current !== lastSavedRef.current && !isSampleRef.current) {
        // best-effort fire-and-forget
        fetch(`/api/meetings/${meetingIdRef.current}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ manualNotes: valueRef.current }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  return (
    <section aria-labelledby="manual-notes-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <FileText aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2 id="manual-notes-heading" className="display text-lg font-semibold tracking-crisp">
          手書きメモ
        </h2>
        <StatusInline state={state} />
      </div>
      <Card className="p-2">
        <label className="sr-only" htmlFor={`notes-${meetingId}`}>
          手書きメモ
        </label>
        <textarea
          id={`notes-${meetingId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => persist(value)}
          rows={8}
          maxLength={MAX_LENGTH}
          placeholder={[
            '商談中に気づいたこと、AI が拾えなかった文脈を、自分の言葉で残します。',
            '',
            '- 雑談で出た趣味 / 出身地',
            '- 競合の話',
            '- 次回までの宿題',
          ].join('\n')}
          className={cn(
            'w-full rounded-md bg-transparent border-0',
            'px-3 py-2.5 text-sm leading-relaxed',
            'focus-visible:outline-none focus-visible:bg-card focus-visible:rounded-md',
            'placeholder:text-muted-foreground/60 placeholder:whitespace-pre-line',
          )}
        />
        <div className="px-3 pb-2 flex items-center justify-between text-[10px] text-muted-foreground tabular">
          <span>
            {value.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()} 文字
          </span>
          <span>3 秒で自動保存</span>
        </div>
      </Card>
    </section>
  );
}

function StatusInline({ state }: { state: SaveState }) {
  if (state.kind === 'saving') {
    return <span className="kicker text-cinnabar">保存中…</span>;
  }
  if (state.kind === 'error') {
    return (
      <span role="alert" className="kicker text-destructive truncate" title={state.message}>
        {state.message}
      </span>
    );
  }
  if (state.savedAt) {
    return <span className="kicker tabular">{formatSavedAt(state.savedAt)} に保存済み</span>;
  }
  return null;
}

function formatSavedAt(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}
