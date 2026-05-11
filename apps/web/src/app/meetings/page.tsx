import { Calendar, ChevronRight, Clock, ListChecks, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  DEMO_MEETINGS,
  type DemoMeeting,
  type DemoMeetingStage,
  findContact,
  findMember,
  formatDateJp,
  formatJpy,
  nextUpcomingMeeting,
  STAGE_LABELS,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';

export const metadata = { title: '商談' };

// SSR で値が揺れないよう demo の基準時刻を固定 (production では new Date() に置換)
const NOW = new Date('2026-05-11T09:00:00+09:00');

const STAGE_ORDER: DemoMeetingStage[] = ['scheduled', 'in_progress', 'won', 'lost', 'on_hold'];

const STAGE_TONE: Record<
  DemoMeetingStage,
  { dot: string; badge: string; rail: string }
> = {
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
    badge:
      'border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    rail: 'before:bg-amber-500/55',
  },
};

function groupByStage(meetings: DemoMeeting[]) {
  const map = new Map<DemoMeetingStage, DemoMeeting[]>();
  for (const s of STAGE_ORDER) map.set(s, []);
  for (const m of meetings) map.get(m.stage)?.push(m);
  for (const arr of map.values()) {
    arr.sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  }
  return map;
}

function sectionNo(n: number) {
  return `№ ${n.toString().padStart(2, '0')}`;
}

export default function MeetingsPage() {
  const grouped = groupByStage(DEMO_MEETINGS);
  let totalPipeline = 0;
  let wonTotal = 0;
  for (const m of DEMO_MEETINGS) {
    if (m.stage === 'in_progress' || m.stage === 'scheduled') totalPipeline += m.amountJpy;
    if (m.stage === 'won') wonTotal += m.amountJpy;
  }
  const nextMeeting = nextUpcomingMeeting(NOW);

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">{sectionNo(1)} — 商談</p>
        <span className="kicker tabular">{DEMO_MEETINGS.length} 件</span>
      </div>

      <header className="space-y-2 animate-fade-up max-w-3xl">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          商談を、流れで見渡す。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          ステージ別に並べた現場の全景。要約・約束事項・次の一手まで、各カードから 1 タップで遡れます。
        </p>
      </header>

      <section
        aria-label="パイプライン サマリ"
        className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-up [animation-delay:60ms]"
      >
        <SummaryStat
          kicker="進行中パイプライン"
          metric={formatJpy(totalPipeline)}
          hint="進行中 + 予定の見込み合計"
          Icon={Target}
          no={sectionNo(2)}
        />
        <SummaryStat
          kicker="今月の受注"
          metric={formatJpy(wonTotal)}
          hint="ステージ「受注」の金額合計"
          Icon={ListChecks}
          no={sectionNo(3)}
        />
        <SummaryStat
          kicker="次の商談"
          metric={nextMeeting ? formatDateJp(nextMeeting.scheduledAt, true) : '—'}
          hint={nextMeeting?.companyName ?? '予定された商談はありません'}
          Icon={Calendar}
          no={sectionNo(4)}
        />
      </section>

      <div className="hairline" aria-hidden />

      <section
        aria-label="ステージ別カンバン"
        aria-describedby="kanban-no"
        className="animate-fade-up [animation-delay:120ms] space-y-4"
      >
        <div className="flex items-baseline gap-3">
          <span id="kanban-no" className="section-no text-base">{sectionNo(5)}</span>
          <h2 className="display text-lg font-semibold tracking-crisp">ステージ別カンバン</h2>
          <span className="kicker">スクロールで横スワイプ</span>
        </div>
        <ol
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 overflow-x-auto"
          aria-label="商談ステージ"
        >
          {STAGE_ORDER.map((stage) => {
            const list = grouped.get(stage) ?? [];
            return (
              <li key={stage} className="flex flex-col gap-3 min-w-0">
                <div
                  className={cn(
                    'flex items-center justify-between sticky z-[1] bg-background/85 backdrop-blur py-2',
                    'top-[calc(var(--app-header-h,3.5rem)+env(safe-area-inset-top))]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn('size-2 rounded-full', STAGE_TONE[stage].dot)}
                    />
                    <h3 className="display text-sm font-semibold tracking-crisp">
                      {STAGE_LABELS[stage]}
                    </h3>
                  </div>
                  <span className="kicker tabular">{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <EmptyColumn />
                ) : (
                  list.map((m) => <MeetingCard key={m.id} meeting={m} />)
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: DemoMeeting }) {
  const owner = findMember(meeting.ownerId);
  const attendees = meeting.attendeeIds
    .map((id) => findContact(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const tone = STAGE_TONE[meeting.stage];
  return (
    <Link
      href={`/meetings/${meeting.id}` as never}
      className="block group focus-visible:outline-none"
    >
      <Card
        interactive
        className={cn(
          'relative h-full p-4 space-y-3 focus-visible:shadow-focus-ring',
          'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r',
          tone.rail,
        )}
      >
        <div className="flex items-start justify-between gap-2 pl-2">
          <h4 className="display text-sm font-semibold leading-snug tracking-crisp text-balance line-clamp-2">
            {meeting.title}
          </h4>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 h-5 text-[10px] font-medium tracking-wide whitespace-nowrap shrink-0',
              tone.badge,
            )}
          >
            {STAGE_LABELS[meeting.stage]}
          </span>
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
                strokeWidth={2}
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
            <Users aria-hidden strokeWidth={1.6} className="size-3.5 shrink-0 text-muted-foreground" />
            <span
              className="text-[11px] text-muted-foreground truncate"
              title={attendees.map((a) => a.fullName).join(', ')}
            >
              {attendees[0]?.fullName ?? '未登録'}
              {attendees.length > 1 ? ` +${attendees.length - 1}` : ''}
            </span>
          </div>
          {meeting.amountJpy > 0 ? (
            <span className="display tabular text-xs font-semibold tracking-crisp">
              {formatJpy(meeting.amountJpy)}
            </span>
          ) : null}
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
  );
}

function EmptyColumn() {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
      <p className="text-xs text-muted-foreground">該当なし</p>
    </div>
  );
}

function SummaryStat({
  kicker,
  metric,
  hint,
  Icon,
  no,
}: {
  kicker: string;
  metric: string;
  hint: string;
  Icon: typeof Calendar;
  no: string;
}) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="kicker">{kicker}</p>
        <span className="section-no text-base">{no}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <Icon aria-hidden strokeWidth={1.4} className="size-5 shrink-0 text-muted-foreground/60" />
        <p className="display tabular text-2xl font-semibold leading-none tracking-[-0.022em]">
          {metric}
        </p>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{hint}</p>
    </Card>
  );
}
