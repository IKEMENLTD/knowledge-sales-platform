import { Card } from '@/components/ui/card';
import {
  type DemoMeetingStage,
  STAGE_LABELS,
  findContact,
  findMember,
  formatDateJp,
  formatJpy,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
/**
 * 商談カード — kanban の各 li 直下に並ぶ実体。
 *
 * Server / Client 双方から再利用するため、I/O やフックは持たず、props を表示するだけの純表示。
 * DnD ハンドラは親 (kanban-board) が `dragHandleProps` を被せる形で注入する。
 */
import { Calendar, ChevronRight, Clock, GripVertical, Target, Users } from 'lucide-react';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import { formatProbability, normalizeProbability, weightedAmount } from '../_lib/forecast';

export type MeetingCardData = {
  id: string;
  title: string;
  stage: DemoMeetingStage;
  companyName: string;
  scheduledAt: string;
  durationMin: number;
  aiSummary: string;
  nextAction: string | null;
  amountJpy: number;
  ownerId: string | null;
  ownerInitials: string | null;
  ownerFullName: string | null;
  attendeeIds: string[];
  attendeeFullNames: string[];
  /** 0..1 もしくは 0..100。null のときは stage default で扱う。 */
  winProbability: number | null;
  /** demo fixture から来ているかの badge。表示のみ。 */
  isDemo?: boolean;
};

const STAGE_TONE: Record<DemoMeetingStage, { dot: string; badge: string; rail: string }> = {
  scheduled: {
    dot: 'bg-foreground/55',
    badge: 'border-foreground/20 bg-card text-foreground',
    rail: 'before:bg-foreground/35',
  },
  in_progress: {
    dot: 'bg-cinnabar',
    badge: 'border-cinnabar/45 bg-cinnabar/10 text-cinnabar',
    rail: 'before:bg-cinnabar/70',
  },
  won: {
    dot: 'bg-chitose',
    badge: 'border-chitose/45 bg-chitose-muted/40 text-chitose',
    rail: 'before:bg-chitose/70',
  },
  lost: {
    dot: 'bg-foreground/40',
    badge: 'border-foreground/20 bg-muted text-muted-foreground',
    rail: 'before:bg-foreground/25',
  },
  on_hold: {
    dot: 'bg-amber-500',
    badge: 'border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    rail: 'before:bg-amber-500/55',
  },
};

export { STAGE_TONE };

export type MeetingCardProps = {
  meeting: MeetingCardData;
  /** kanban の DnD ハンドル領域に渡す追加 props (draggable / aria など) */
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  /** DnD のキャプチャ視覚 (移動中の半透明など) */
  isDragging?: boolean;
};

/**
 * 確度表記の補助。明示 winProbability が無くても stage default で文字列を返す。
 */
function ProbabilityChip({
  stage,
  winProbability,
  amountJpy,
}: {
  stage: DemoMeetingStage;
  winProbability: number | null;
  amountJpy: number;
}) {
  if (amountJpy <= 0) return null;
  const prob = normalizeProbability(winProbability, stage);
  const weighted = weightedAmount({
    id: '_',
    stage,
    amountJpy,
    winProbability,
  });
  const label = `${formatProbability(winProbability, stage)} × ${formatJpy(amountJpy)} = 加重 ${formatJpy(
    weighted,
  )}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[10px]',
        'border-foreground/15 bg-surface-inset/60 text-muted-foreground tabular',
      )}
    >
      <Target aria-hidden strokeWidth={1.6} className="size-3" />
      <span>{Math.round(prob * 100)}%</span>
    </span>
  );
}

export function MeetingCard({ meeting, dragHandleProps, isDragging }: MeetingCardProps) {
  const owner = meeting.ownerInitials
    ? { initials: meeting.ownerInitials, fullName: meeting.ownerFullName }
    : findMemberFallback(meeting.ownerId);
  const attendeeNames = meeting.attendeeFullNames.length
    ? meeting.attendeeFullNames
    : meeting.attendeeIds
        .map((id) => findContact(id)?.fullName)
        .filter((s): s is string => Boolean(s));
  const tone = STAGE_TONE[meeting.stage];

  return (
    <div className={cn('relative group/card transition-opacity', isDragging && 'opacity-50')}>
      {dragHandleProps ? (
        <button
          type="button"
          {...dragHandleProps}
          className={cn(
            // Round2 UX MID-U-02 fix: touch 領域 44px 確保。
            // 視覚的なハンドルは size-6 のまま、当たり判定のみ size-11 で広げる。
            'absolute -left-1 top-1 z-[2] inline-flex items-center justify-center size-11 rounded-md',
            'text-muted-foreground/60 hover:text-foreground hover:bg-accent/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'cursor-grab active:cursor-grabbing',
            'opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100',
          )}
          aria-label={`${meeting.title} を移動 (Space で掴む、矢印キーで移動、Space で離す)`}
        >
          <GripVertical aria-hidden strokeWidth={1.6} className="size-4" />
        </button>
      ) : null}

      <Link
        href={`/meetings/${meeting.id}` as never}
        className="block focus-visible:outline-none"
        // ドラッグハンドルが押下されている間は Link 遷移しない様
        // pointer-events は親 div が draggable の場合のみ細工する (kanban 側で制御)
      >
        <Card
          interactive
          className={cn(
            'relative h-full p-4 space-y-3 focus-visible:shadow-focus-ring',
            'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r',
            tone.rail,
            dragHandleProps && 'pl-7',
          )}
        >
          <div className="flex items-start justify-between gap-2 pl-2">
            <h4 className="display text-sm font-semibold leading-snug tracking-crisp text-balance line-clamp-2">
              {meeting.title}
            </h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {meeting.isDemo ? (
                // Round2 UX MID-U-01 fix: 統一 SampleBadge 流派 (cinnabar dashed)
                <span
                  aria-label="サンプルデータ"
                  title="DB 未接続のサンプルデータです"
                  className="px-2 h-5 inline-flex items-center rounded-full border border-dashed border-cinnabar/35 bg-cinnabar/5 text-cinnabar text-[10px] tracking-kicker uppercase whitespace-nowrap"
                >
                  サンプル
                </span>
              ) : null}
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 h-5 text-[10px] font-medium tracking-wide whitespace-nowrap',
                  tone.badge,
                )}
              >
                {STAGE_LABELS[meeting.stage]}
              </span>
            </div>
          </div>

          <div className="pl-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock aria-hidden strokeWidth={1.6} className="size-3.5 shrink-0" />
            <time dateTime={meeting.scheduledAt} className="tabular">
              {formatDateJp(meeting.scheduledAt, true)} ・ {meeting.durationMin} 分
            </time>
          </div>

          <p className="pl-2 text-xs leading-relaxed text-foreground/80 line-clamp-3">
            {meeting.aiSummary}
          </p>

          {meeting.nextAction ? (
            <div className="pl-2 space-y-1">
              <p className="kicker">次の一手</p>
              <div className="flex items-start gap-2 text-xs">
                <ChevronRight
                  aria-hidden
                  strokeWidth={1.6}
                  className="size-3.5 shrink-0 mt-0.5 text-cinnabar"
                />
                <span className="font-medium text-foreground line-clamp-2">
                  {meeting.nextAction}
                </span>
              </div>
            </div>
          ) : null}

          <div className="pl-2 flex items-center justify-between gap-2 pt-1 border-t border-border/50">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users
                aria-hidden
                strokeWidth={1.6}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span
                className="text-[11px] text-muted-foreground truncate"
                title={attendeeNames.join(', ')}
              >
                {attendeeNames[0] ?? '未登録'}
                {attendeeNames.length > 1 ? ` +${attendeeNames.length - 1}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ProbabilityChip
                stage={meeting.stage}
                winProbability={meeting.winProbability}
                amountJpy={meeting.amountJpy}
              />
              {meeting.amountJpy > 0 ? (
                <span className="display tabular text-xs font-semibold tracking-crisp">
                  {formatJpy(meeting.amountJpy)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="pl-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              aria-hidden
              className="inline-flex items-center justify-center size-4 rounded-full bg-accent text-[8px] font-semibold tracking-tight"
            >
              {owner?.initials ?? '—'}
            </span>
            <span className="truncate">担当 {owner?.fullName ?? '未設定'}</span>
          </div>
        </Card>
      </Link>

      <span className="sr-only">
        {/* スクリーンリーダー: stage を文字でも伝える (DnD 後に再読み上げの足がかり) */}
        現在のステージ: {STAGE_LABELS[meeting.stage]}
      </span>
      <Calendar aria-hidden className="hidden" />
    </div>
  );
}

/** owner が DB から取れていない (demo 専用) ケースで fixtures を見にいく救済 */
function findMemberFallback(ownerId: string | null) {
  if (!ownerId) return null;
  const m = findMember(ownerId);
  if (!m) return null;
  return { initials: m.initials, fullName: m.fullName };
}
