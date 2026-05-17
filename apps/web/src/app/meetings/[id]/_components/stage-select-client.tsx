'use client';

import { cn } from '@/lib/utils';
import { type MeetingStage, meetingStageValues } from '@ksp/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const STAGE_LABEL_JP: Record<MeetingStage, string> = {
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

export function StageSelectClient({
  meetingId,
  initialStage,
  disabled,
}: {
  meetingId: string;
  initialStage: MeetingStage | null;
  disabled?: boolean;
}) {
  const [stage, setStage] = useState<MeetingStage | ''>(initialStage ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onChange = (next: MeetingStage) => {
    const prev = stage;
    setStage(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/stage`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toStage: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 履歴セクションを更新するため refresh。
        router.refresh();
      } catch (_e) {
        setStage(prev);
        setError('ステージを更新できませんでした');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="sr-only" htmlFor={`stage-select-${meetingId}`}>
        ステージ
      </label>
      <select
        id={`stage-select-${meetingId}`}
        value={stage}
        disabled={disabled || pending}
        onChange={(e) => onChange(e.target.value as MeetingStage)}
        className={cn(
          'h-10 rounded-md border border-border bg-card px-3 text-sm font-medium leading-none',
          'shadow-sumi-sm',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-sumi',
          'hover:border-foreground/30 focus-visible:outline-none focus-visible:shadow-focus-ring',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
        aria-label="ステージ"
      >
        <option value="" disabled>
          ステージを選択
        </option>
        {meetingStageValues.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL_JP[s]}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
