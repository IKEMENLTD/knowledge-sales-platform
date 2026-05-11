import { Clock, Mic, Play, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  DEMO_RECORDINGS,
  type DemoRecording,
  findMeeting,
  findMember,
  formatDateJp,
  formatDuration,
  formatTimestamp,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';

export const metadata = { title: '録画' };

export default function RecordingsPage() {
  const totalSec = DEMO_RECORDINGS.reduce((sum, r) => sum + r.durationSec, 0);
  const totalHours = Math.round((totalSec / 3600) * 10) / 10;
  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 録画</p>
        <span className="kicker tabular">
          {DEMO_RECORDINGS.length} 件 ・ 累計 {totalHours} 時間
        </span>
      </div>

      <header className="space-y-2 animate-fade-up max-w-3xl">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          商談の録画を、ナレッジに変える。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          Zoom の録画を自動取り込み。文字起こし・要約・話者ごとの感情の流れ・台詞検索まで、1 件あたり数分で揃います。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <section
        aria-label="録画一覧"
        className="space-y-5 animate-fade-up [animation-delay:80ms]"
      >
        {DEMO_RECORDINGS.map((r, idx) => (
          <RecordingCard key={r.id} recording={r} index={idx} />
        ))}
      </section>
    </div>
  );
}

function RecordingCard({ recording, index }: { recording: DemoRecording; index: number }) {
  const meeting = findMeeting(recording.meetingId);
  const owner = meeting ? findMember(meeting.ownerId) : undefined;

  return (
    <Link
      href={`/recordings/${recording.id}` as never}
      className="block group focus-visible:outline-none"
    >
      <Card
        interactive
        className="relative overflow-hidden p-0 focus-visible:shadow-focus-ring"
      >
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

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.16em] text-background/65">
                感情の流れ
              </p>
              <Sparkline values={recording.sentimentCurve} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span
                aria-hidden
                className="inline-flex items-center justify-center size-10 rounded-full bg-cinnabar shadow-cinnabar-glow text-cinnabar-foreground"
              >
                <Play strokeWidth={1.8} className="size-5 ml-0.5" />
              </span>
              <div className="text-right">
                <p className="display tabular text-base font-semibold text-background">
                  {formatDuration(recording.durationSec)}
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-background/70">
                  {formatDateJp(recording.recordedAt, true)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="display text-lg md:text-xl font-semibold tracking-crisp leading-tight">
                  {recording.title}
                </h2>
                {meeting ? (
                  <p className="text-xs text-muted-foreground">
                    {meeting.companyName} ・ 担当 {owner?.fullName ?? '—'}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="border-l-2 border-cinnabar/40 pl-3 space-y-1">
              <p className="kicker">AI 要約</p>
              <p className="text-sm leading-relaxed text-foreground/85 line-clamp-2">
                {recording.aiSummary}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {recording.speakerSplit.map((s) => (
                <SpeakerChip key={s.name} name={s.name} pct={s.pct} />
              ))}
            </div>

            <div className="space-y-2">
              <p className="kicker">主要ハイライト</p>
              <ul className="space-y-1.5">
                {recording.highlights.slice(0, 3).map((h) => (
                  <li key={h.atSec} className="flex items-baseline gap-2 text-xs">
                    <span className="tabular text-[10px] w-12 shrink-0 text-muted-foreground">
                      {formatTimestamp(h.atSec)}
                    </span>
                    <span className="text-foreground/85 leading-relaxed line-clamp-1">
                      {h.label}
                    </span>
                  </li>
                ))}
                {recording.highlights.length > 3 ? (
                  <li className="text-[10px] tracking-wide text-muted-foreground pl-14">
                    ほか {recording.highlights.length - 3} 件のハイライト
                  </li>
                ) : null}
              </ul>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
              <Clock aria-hidden strokeWidth={1.6} className="size-3.5" />
              <span>文字起こし済</span>
              <span aria-hidden>・</span>
              <span className="inline-flex items-center gap-1">
                <Sparkles aria-hidden strokeWidth={1.6} className="size-3 text-cinnabar/70" />
                台詞まで検索できます
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function SpeakerChip({ name, pct }: { name: string; pct: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/70',
        'bg-card/60 px-2.5 h-6 text-[11px]',
      )}
      title={`${name} の発話比率 ${pct}%`}
    >
      <span className="font-medium tracking-crisp">{name}</span>
      <span className="tabular text-muted-foreground">{pct}%</span>
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 240;
  const height = 56;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // 全値が等しいときは中央水平線になるよう span=1 を維持
  const span = Math.max(1, max - min);
  const stepX = width / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 8) - 4;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const last = values[values.length - 1] ?? 0;
  const lastY = height - ((last - min) / span) * (height - 8) - 4;
  return (
    <svg
      role="img"
      aria-label="感情の流れ (上に向かうほど前向きな会話)"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-12"
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--cinnabar))" stopOpacity="0.45" />
          <stop offset="100%" stopColor="hsl(var(--cinnabar))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${width} ${height} L 0 ${height} Z`}
        fill="url(#spark-grad)"
      />
      <path d={path} stroke="hsl(var(--cinnabar))" strokeWidth="1.5" fill="none" />
      <circle cx={width} cy={lastY} r="3" fill="hsl(var(--cinnabar))" />
    </svg>
  );
}
