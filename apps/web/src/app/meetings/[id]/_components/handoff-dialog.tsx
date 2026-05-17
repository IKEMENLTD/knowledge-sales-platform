'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type HandoffCandidate = {
  /** users.id (uuid) */
  id: string;
  fullName: string;
  role: 'cs' | 'manager' | 'admin' | 'legal' | 'sales';
  department: string | null;
};

/**
 * 営業 → CS のハンドオフ Dialog。
 *
 * - toUserId select + draftNotes textarea
 * - POST /api/meetings/[id]/handoff
 * - draftNotes 空のままで POST すると server 側で LLM 自動生成 (zod 仕様)
 * - 成功時は router.refresh() で CS タブ等の表示を反映
 */
export function HandoffDialog({
  meetingId,
  candidates,
  /** AI 要約から組み立てた下書き (空でも OK) */
  draftNotesSeed,
  isSample,
}: {
  meetingId: string;
  candidates: HandoffCandidate[];
  draftNotesSeed: string;
  isSample: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [toUserId, setToUserId] = useState<string>(candidates[0]?.id ?? '');
  const [notes, setNotes] = useState(draftNotesSeed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = () => {
    setError(null);
    if (!toUserId) {
      setError('引き継ぎ先を選んでください');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/handoff`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            toUserId,
            draftNotes: notes.trim() ? notes.trim() : undefined,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setOpen(false);
        router.refresh();
      } catch (_e) {
        setError('引き継ぎ書を作成できませんでした');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSample && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="cinnabar" size="sm" disabled={isSample}>
          <Send aria-hidden strokeWidth={1.6} className="size-4" />
          CS へ引き継ぐ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商談を CS へ引き継ぐ</DialogTitle>
          <DialogDescription>
            受注後の運用を担当するメンバーへ、要約・約束事項・次のアクションをまとめて渡します。
            下書きは AI が用意していますが、現場の文脈は必ず書き足してから渡しましょう。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`handoff-to-${meetingId}`}>引き継ぎ先</Label>
            <select
              id={`handoff-to-${meetingId}`}
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className={cn(
                'h-11 w-full rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
                'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
                'focus-visible:outline-none focus-visible:border-ring focus-visible:bg-card',
                'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]',
              )}
              required
            >
              {candidates.length === 0 ? (
                <option value="">(候補なし)</option>
              ) : (
                candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.role !== 'cs' ? ` (${c.role})` : ''}
                    {c.department ? ` ・ ${c.department}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`handoff-notes-${meetingId}`}>引き継ぎメモ (下書き)</Label>
            <textarea
              id={`handoff-notes-${meetingId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              maxLength={20_000}
              placeholder="空欄で送信すると、AI が要約・約束事項から自動生成します"
              className={cn(
                'w-full rounded-md border border-border bg-surface-inset/60 px-3 py-2 text-sm leading-relaxed',
                'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]',
                'focus-visible:outline-none focus-visible:border-ring focus-visible:bg-card',
                'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]',
              )}
            />
            <p className="text-[10px] text-muted-foreground tabular">
              {notes.length.toLocaleString()} / 20,000 文字
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            variant="cinnabar"
            onClick={onSubmit}
            disabled={pending || !toUserId}
          >
            {pending ? '送信中…' : '引き継ぎを作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
