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
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * AI セクション (要約 / 重要点 / 顧客ニーズ / 反論) の編集 Dialog。
 *
 * - `mode = 'text'` → textarea 1 つ。改行可。
 * - `mode = 'list'` → 改行区切りで箇条書きを入力。
 *
 * 保存は PATCH /api/meetings/[id] に `{ aiOverrides: { [field]: ... } }` で送る想定。
 * Phase 2K の API 仕様 (別 agent 担当) と合わせて、未実装フィールドでも 4xx で
 * 戻されれば error 表示するのみで UI は壊れない。
 */
export function AiSectionEditDialogClient({
  meetingId,
  field,
  mode,
  initialText,
  initialItems,
  sectionLabel,
  disabled,
}: {
  meetingId: string;
  field: 'summary' | 'keyPoints' | 'customerNeeds' | 'objections';
  mode: 'text' | 'list';
  initialText: string | null;
  initialItems: string[] | null;
  sectionLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(
    mode === 'text' ? (initialText ?? '') : (initialItems ?? []).join('\n'),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSave = () => {
    setError(null);
    const value =
      mode === 'text'
        ? text.trim()
        : text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aiOverrides: { [field]: value } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setOpen(false);
        router.refresh();
      } catch (_e) {
        setError('保存に失敗しました');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${sectionLabel}を編集`}
          disabled={disabled}
        >
          <Pencil aria-hidden strokeWidth={1.6} className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sectionLabel}を整える</DialogTitle>
          <DialogDescription>
            {mode === 'text'
              ? 'AI 要約をそのまま使うか、現場の言葉に書き換えます。引き継ぎ書にもこの内容が反映されます。'
              : '1 行 1 件で書きます。空行は無視されます。'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`ai-edit-${field}`} className="sr-only">
            {sectionLabel}
          </Label>
          <textarea
            id={`ai-edit-${field}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={mode === 'text' ? 6 : 8}
            className="w-full rounded-md border border-border bg-surface-inset/60 px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:border-ring focus-visible:bg-card focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
            maxLength={5000}
          />
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
          <Button type="button" variant="cinnabar" onClick={onSave} disabled={pending}>
            {pending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
