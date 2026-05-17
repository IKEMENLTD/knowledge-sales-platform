'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * タイトル / 金額 (JPY) / クロージング日 の inline 編集。
 *
 * 表示 ↔ 編集の二態。Save で PATCH /api/meetings/[id]。
 * 編集中の値は内部 state、保存成功でサーバ反映 → router.refresh()。
 */
export function HeaderEditFieldsClient({
  meetingId,
  initialTitle,
  initialAmount,
  initialCloseDate,
  disabled,
}: {
  meetingId: string;
  initialTitle: string;
  initialAmount: number | null;
  initialCloseDate: string | null;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : '');
  const [closeDate, setCloseDate] = useState(initialCloseDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSave = () => {
    setError(null);
    const body: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== initialTitle) body.title = title.trim();
    const amountNum = amount.trim() ? Number(amount.replace(/[,\s]/g, '')) : null;
    if (amountNum != null) {
      if (Number.isNaN(amountNum) || amountNum < 0) {
        setError('金額は 0 以上の整数で入力してください');
        return;
      }
      if (amountNum !== initialAmount) body.dealAmount = Math.floor(amountNum);
    }
    if (closeDate && closeDate !== initialCloseDate) body.dealCloseDate = closeDate;

    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setEditing(false);
        router.refresh();
      } catch (_e) {
        setError('保存に失敗しました');
      }
    });
  };

  const onCancel = () => {
    setTitle(initialTitle);
    setAmount(initialAmount != null ? String(initialAmount) : '');
    setCloseDate(initialCloseDate ?? '');
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-col">
          <span className="kicker">金額</span>
          <span className="display tabular text-base font-semibold tracking-crisp">
            {initialAmount != null && initialAmount > 0
              ? new Intl.NumberFormat('ja-JP', {
                  style: 'currency',
                  currency: 'JPY',
                  maximumFractionDigits: 0,
                }).format(initialAmount)
              : '—'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="kicker">クロージング日</span>
          <span className="tabular text-sm text-foreground/85">{initialCloseDate ?? '—'}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          disabled={disabled}
          aria-label="基本情報を編集"
          className="ml-auto"
        >
          <Pencil aria-hidden strokeWidth={1.6} className="size-4" />
          編集
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      aria-label="商談基本情報の編集"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`title-${meetingId}`}>タイトル</Label>
        <Input
          id={`title-${meetingId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`amount-${meetingId}`}>金額 (円)</Label>
          <Input
            id={`amount-${meetingId}`}
            preset="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例: 4800000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`close-${meetingId}`}>クロージング日</Label>
          <Input
            id={`close-${meetingId}`}
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button type="submit" variant="cinnabar" size="sm" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}
