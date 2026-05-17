'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { meetingStageValues, meetingStatusValues } from '@ksp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState, useTransition } from 'react';

export type NewMeetingFormContact = {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
};

export type NewMeetingFormProps = {
  contacts: NewMeetingFormContact[];
  initialContactId: string;
};

const STAGE_LABEL_JP: Record<(typeof meetingStageValues)[number], string> = {
  first: '初回',
  second: '2 回目',
  demo: 'デモ',
  proposal: '提案',
  negotiation: '交渉',
  closing: 'クロージング',
  kickoff: 'キックオフ',
  cs_regular: 'CS 定期',
  cs_issue: 'CS 課題',
};

const STATUS_LABEL_JP: Record<(typeof meetingStatusValues)[number], string> = {
  scheduling: '日程調整中',
  scheduled: '予定済み',
  completed: '実施済み',
  cancelled: 'キャンセル',
  no_show: 'no-show',
};

/**
 * 新規商談作成フォーム。
 *
 * - contact id, title が必須
 * - scheduled_at / duration_minutes / status / stage / manual_notes は任意
 * - 送信時に Idempotency-Key (uuid) を付けて POST /api/meetings
 * - 成功で /meetings/{id} に redirect
 */
export function NewMeetingForm({ contacts, initialContactId }: NewMeetingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [contactId, setContactId] = useState(initialContactId);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [status, setStatus] = useState<(typeof meetingStatusValues)[number]>('scheduling');
  const [stage, setStage] = useState<'' | (typeof meetingStageValues)[number]>('');
  const [manualNotes, setManualNotes] = useState('');

  const canSubmit = useMemo(
    () => Boolean(contactId && title.trim().length > 0) && !pending,
    [contactId, title, pending],
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!contactId) {
      setError('相手の名刺を選んでください。');
      return;
    }
    if (title.trim().length === 0) {
      setError('件名を入力してください。');
      return;
    }

    // build payload
    const payload: Record<string, unknown> = {
      contactId,
      title: title.trim(),
      durationMinutes: Math.max(1, Math.min(24 * 60, Number(durationMin) || 60)),
      status,
    };
    if (scheduledAt) {
      // datetime-local は秒なし & TZ なし。JST として送って ISO に正規化。
      const local = new Date(scheduledAt);
      if (!Number.isNaN(local.valueOf())) {
        payload.scheduledAt = local.toISOString();
      }
    }
    if (stage) payload.stage = stage;
    const notesTrim = manualNotes.trim();
    if (notesTrim) payload.manualNotes = notesTrim;

    startTransition(async () => {
      try {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { meetingId?: string };
        if (!json.meetingId) {
          throw new Error('meeting id が返ってきませんでした');
        }
        router.push(`/meetings/${json.meetingId}` as never);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : '通信エラー');
      }
    });
  };

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-6" aria-label="新規商談フォーム">
        {/* Contact */}
        <div className="space-y-2">
          <Label htmlFor="contact_id">
            相手の名刺 <span className="text-cinnabar">*</span>
          </Label>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              名刺が見つかりません。先に「名刺の取り込み」から登録してください。
            </p>
          ) : (
            <select
              id="contact_id"
              required
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className={cn(
                'h-11 w-full rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
                'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
              )}
            >
              <option value="" disabled>
                名刺を選択
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.companyName ? ` ・ ${c.companyName}` : ''}
                  {c.title ? ` (${c.title})` : ''}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">
            社内メンバーは含めません。商談の相手 (社外) を選んでください。
          </p>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">
            件名 <span className="text-cinnabar">*</span>
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 初回ヒアリング / デモのお打ち合わせ"
            maxLength={200}
            required
          />
        </div>

        {/* Scheduled at */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="scheduled_at">日時 (任意)</Label>
            <input
              id="scheduled_at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={cn(
                'h-11 w-full rounded-md border border-border bg-surface-inset/60 px-3 text-sm tabular',
                'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration_min">所要時間 (分)</Label>
            <Input
              id="duration_min"
              type="number"
              inputMode="numeric"
              min={1}
              max={24 * 60}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
          </div>
        </div>

        {/* Status & Stage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">状態</Label>
            <select
              id="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof meetingStatusValues)[number])
              }
              className={cn(
                'h-11 w-full rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
                'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
              )}
            >
              {meetingStatusValues.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL_JP[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage">ステージ (任意)</Label>
            <select
              id="stage"
              value={stage}
              onChange={(e) =>
                setStage(e.target.value as '' | (typeof meetingStageValues)[number])
              }
              className={cn(
                'h-11 w-full rounded-md border border-border bg-surface-inset/60 px-3 text-sm',
                'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
              )}
            >
              <option value="">— 未設定 —</option>
              {meetingStageValues.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL_JP[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Manual notes */}
        <div className="space-y-2">
          <Label htmlFor="manual_notes">メモ (任意)</Label>
          <textarea
            id="manual_notes"
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
            maxLength={20_000}
            rows={4}
            placeholder="商談の背景、事前情報、確認したい論点などを書き留めておけます。"
            className={cn(
              'w-full rounded-md border border-border bg-surface-inset/60 px-3 py-2 text-sm leading-relaxed',
              'hover:border-foreground/25 focus-visible:outline-none focus-visible:border-ring',
            )}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive border-l-2 border-destructive pl-3">
            作成に失敗しました — {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={pending}
          >
            キャンセル
          </Button>
          <Button type="submit" variant="cinnabar" disabled={!canSubmit}>
            {pending ? '作成中…' : '商談を作成'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
