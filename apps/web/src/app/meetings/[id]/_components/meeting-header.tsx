import { Card } from '@/components/ui/card';
import type { MeetingStage } from '@ksp/shared';
import { Calendar, ExternalLink, Video } from 'lucide-react';
import Link from 'next/link';
import { HeaderEditFieldsClient } from './header-edit-fields-client';
import { StageSelectClient } from './stage-select-client';

/**
 * 商談ヘッダー。会社/担当/日時/外部リンク/ステージ select + タイトル・金額・クロージング日 inline 編集。
 *
 * - 表示専用部分は Server Component で固定し、
 *   操作が必要な箇所のみ "use client" の子 (Stage select / inline 編集) に隔離。
 * - PATCH は /api/meetings/[id] と /api/meetings/[id]/stage。API 未配備時は子側で
 *   silent fail (optimistic 戻し) するので、レンダリングは常に成功する。
 */
export type MeetingHeaderProps = {
  meetingId: string;
  title: string;
  companyName: string;
  ownerName: string | null;
  ownerInitials: string | null;
  scheduledAt: string | null;
  durationMin: number | null;
  zoomJoinUrl: string | null;
  calendarUrl: string | null;
  stage: MeetingStage | null;
  /** dealAmount は zod 上 integer (JPY 円単位)。null 許容。 */
  dealAmount: number | null;
  /** ISO date (YYYY-MM-DD) */
  dealCloseDate: string | null;
  /** API が未配備で fixture 駆動の場合 true。書込ボタンを disabled にする。 */
  isSample: boolean;
};

function formatScheduledAt(iso: string | null): string {
  if (!iso) return '日時未定';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export function MeetingHeader(props: MeetingHeaderProps) {
  const {
    meetingId,
    title,
    companyName,
    ownerName,
    ownerInitials,
    scheduledAt,
    durationMin,
    zoomJoinUrl,
    calendarUrl,
    stage,
    dealAmount,
    dealCloseDate,
    isSample,
  } = props;

  return (
    <Card className="p-6 space-y-5" aria-labelledby="meeting-header-title">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="kicker">{companyName}</p>
          <h1
            id="meeting-header-title"
            className="display text-2xl md:text-[1.75rem] font-semibold tracking-crisp leading-tight text-balance"
          >
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StageSelectClient meetingId={meetingId} initialStage={stage} disabled={isSample} />
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <Calendar
            aria-hidden
            strokeWidth={1.6}
            className="size-4 mt-0.5 shrink-0 text-muted-foreground/80"
          />
          <div className="min-w-0">
            <dt className="kicker">日時</dt>
            <dd className="tabular text-foreground/85 truncate">
              {formatScheduledAt(scheduledAt)}
              {durationMin ? ` ・ ${durationMin} 分` : ''}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center size-5 mt-0.5 rounded-full bg-accent text-[10px] font-semibold tracking-tight shrink-0"
          >
            {ownerInitials ?? '—'}
          </span>
          <div className="min-w-0">
            <dt className="kicker">担当</dt>
            <dd className="text-foreground/85 truncate">{ownerName ?? '未設定'}</dd>
          </div>
        </div>

        {zoomJoinUrl ? (
          <div className="flex items-start gap-2">
            <Video
              aria-hidden
              strokeWidth={1.6}
              className="size-4 mt-0.5 shrink-0 text-muted-foreground/80"
            />
            <div className="min-w-0">
              <dt className="kicker">Zoom</dt>
              <dd className="truncate">
                <Link
                  href={zoomJoinUrl as never}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-cinnabar decoration-[1.5px] underline-offset-[4px] hover:text-cinnabar"
                >
                  会議に参加
                  <ExternalLink aria-hidden strokeWidth={1.6} className="size-3.5" />
                </Link>
              </dd>
            </div>
          </div>
        ) : null}

        {calendarUrl ? (
          <div className="flex items-start gap-2">
            <Calendar
              aria-hidden
              strokeWidth={1.6}
              className="size-4 mt-0.5 shrink-0 text-muted-foreground/80"
            />
            <div className="min-w-0">
              <dt className="kicker">カレンダー</dt>
              <dd className="truncate">
                <Link
                  href={calendarUrl as never}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-cinnabar decoration-[1.5px] underline-offset-[4px] hover:text-cinnabar"
                >
                  予定を開く
                  <ExternalLink aria-hidden strokeWidth={1.6} className="size-3.5" />
                </Link>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>

      <div className="hairline" aria-hidden />

      <HeaderEditFieldsClient
        meetingId={meetingId}
        initialTitle={title}
        initialAmount={dealAmount}
        initialCloseDate={dealCloseDate}
        disabled={isSample}
      />
    </Card>
  );
}
