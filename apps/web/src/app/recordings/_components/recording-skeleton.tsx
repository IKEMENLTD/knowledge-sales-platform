import { Card } from '@/components/ui/card';
import { formatDateJp } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, Mic, RotateCw } from 'lucide-react';
import Link from 'next/link';
import type { RecordingListItem } from '../_lib/load-recordings';

const STATUS_LABEL: Record<RecordingListItem['processingStatus'], string> = {
  pending: '取り込み待ち',
  downloading: '動画を取得中',
  transcribing: '文字起こし中',
  analyzing: '要約を生成中',
  embedding: '検索 index 化中',
  completed: '完了',
  failed: '失敗',
};

/**
 * 処理中 (downloading / transcribing / analyzing / embedding / pending) 用の card。
 * Cinnabar pulse + 進捗% を表示。クリックは詳細へ。
 */
export function RecordingProcessingCard({
  recording,
  index,
}: {
  recording: RecordingListItem;
  index: number;
}) {
  const label = STATUS_LABEL[recording.processingStatus];
  const pct = recording.progressPct ?? 0;
  return (
    <Link
      href={`/recordings/${recording.id}` as never}
      className="block group focus-visible:outline-none"
      aria-label={`処理中の録画: ${recording.title} (${label})`}
    >
      <Card interactive className="relative overflow-hidden p-0 focus-visible:shadow-focus-ring">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
          <div className="relative bg-gradient-to-br from-foreground/85 to-foreground/65 dark:from-foreground/20 dark:to-foreground/10 p-5 md:p-6 text-background min-h-[160px] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="tabular text-[10px] uppercase tracking-[0.16em] text-background/65">
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-background/75">
                <Mic aria-hidden strokeWidth={1.8} className="size-3" />
                録画
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-background/65">状態</p>
              <p className="display text-sm font-semibold text-background flex items-center gap-2">
                <Loader2
                  aria-hidden
                  strokeWidth={1.8}
                  className="size-4 animate-spin text-cinnabar"
                />
                {label}
                <span className="tabular text-xs text-background/75">{pct}%</span>
              </p>
              <div
                className="h-1 w-full rounded-full bg-background/15 overflow-hidden"
                role="progressbar"
                tabIndex={0}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label} ${pct}%`}
              >
                <div
                  className={cn(
                    'h-full bg-cinnabar rounded-full transition-[width] duration-slow ease-sumi',
                    'animate-pulse',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.16em] text-background/70">
                {formatDateJp(recording.recordedAt, true)}
              </p>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-3">
            <h2 className="display text-lg md:text-xl font-semibold tracking-crisp leading-tight">
              {recording.title}
            </h2>
            {recording.meeting ? (
              <p className="text-xs text-muted-foreground">
                {recording.meeting.companyName ?? '会社未設定'} ・ 担当{' '}
                {recording.meeting.ownerFullName ?? '—'}
              </p>
            ) : null}

            <div className="space-y-2">
              <div className="skeleton h-3 w-3/4 rounded-sm" />
              <div className="skeleton h-3 w-1/2 rounded-sm" />
              <div className="skeleton h-3 w-2/3 rounded-sm" />
            </div>

            <p className="text-[11px] text-muted-foreground pt-1">
              要約と検索 index の準備ができ次第、自動でこの画面に反映されます。
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/**
 * 失敗 (processing_status=failed) 用 card。再実行ボタンつき。
 * 実 endpoint (POST /api/recordings/[id]/reprocess) は別 agent 担当 — ここは form action のみ。
 */
export function RecordingFailedCard({
  recording,
  index,
}: {
  recording: RecordingListItem;
  index: number;
}) {
  return (
    <Card className="relative overflow-hidden p-0 border-cinnabar/30">
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
        <div className="relative bg-gradient-to-br from-cinnabar/70 to-cinnabar/55 p-5 md:p-6 text-cinnabar-foreground min-h-[160px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="tabular text-[10px] uppercase tracking-[0.16em] text-cinnabar-foreground/80">
              {(index + 1).toString().padStart(2, '0')}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-cinnabar-foreground/85">
              <AlertCircle aria-hidden strokeWidth={1.8} className="size-3" />
              失敗
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-cinnabar-foreground/80">
              状態
            </p>
            <p className="display text-base font-semibold">処理に失敗しました</p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-cinnabar-foreground/80">
            {formatDateJp(recording.recordedAt, true)}
          </p>
        </div>

        <div className="p-5 md:p-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="display text-lg md:text-xl font-semibold tracking-crisp leading-tight">
                {recording.title}
              </h2>
              {recording.meeting ? (
                <p className="text-xs text-muted-foreground">
                  {recording.meeting.companyName ?? '会社未設定'} ・ 担当{' '}
                  {recording.meeting.ownerFullName ?? '—'}
                </p>
              ) : null}
            </div>
          </div>

          {recording.processingError ? (
            <div className="border-l-2 border-cinnabar/60 pl-3 space-y-1 text-xs" role="alert">
              <p className="kicker text-cinnabar/90">エラー</p>
              <p className="text-foreground/85 leading-relaxed line-clamp-3 break-words">
                {recording.processingError}
              </p>
            </div>
          ) : null}

          <form action={`/api/recordings/${recording.id}/reprocess`} method="post" className="pt-1">
            <button
              type="submit"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-cinnabar/45 bg-cinnabar/8',
                'px-3 h-8 text-xs font-medium text-cinnabar transition-colors',
                'hover:bg-cinnabar/15 focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
              )}
            >
              <RotateCw aria-hidden strokeWidth={1.8} className="size-3.5" />
              再実行
            </button>
          </form>

          <p className="text-[11px] text-muted-foreground">
            数分待っても改善しない場合は管理者へお知らせください。
          </p>
        </div>
      </div>
    </Card>
  );
}
