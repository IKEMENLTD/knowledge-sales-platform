import { Card } from '@/components/ui/card';
import { Play, Video } from 'lucide-react';
import Link from 'next/link';

export type RelatedRecording = {
  id: string;
  title: string;
  recordedAt: string | null;
  durationSec: number | null;
  summary: string | null;
};

/**
 * 商談に紐づく録画リスト。/recordings/[id] へ。
 * 「即再生」ボタンは録画ページの autoplay クエリで自動再生開始する。
 */
export function RelatedRecordings({
  recordings,
}: {
  recordings: RelatedRecording[];
}) {
  return (
    <section aria-labelledby="related-recordings-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <Video aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2
          id="related-recordings-heading"
          className="display text-lg font-semibold tracking-crisp"
        >
          関連する録画
        </h2>
        <span className="kicker tabular">{recordings.length} 件</span>
      </div>

      {recordings.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            この商談に紐づく録画はまだありません。Zoom 録画が完了次第、自動でここに並びます。
          </p>
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="録画一覧">
          {recordings.map((r) => (
            <li key={r.id}>
              <Card interactive className="p-4 flex items-start gap-3">
                <Link
                  href={`/recordings/${r.id}?autoplay=1` as never}
                  className="inline-flex items-center justify-center size-11 rounded-full bg-cinnabar/10 text-cinnabar hover:bg-cinnabar/15 focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar shrink-0"
                  aria-label={`${r.title}を再生`}
                >
                  <Play aria-hidden strokeWidth={1.6} className="size-5 translate-x-px" />
                </Link>
                <Link
                  href={`/recordings/${r.id}` as never}
                  className="flex-1 min-w-0 focus-visible:outline-none"
                >
                  <p className="display text-sm font-semibold leading-snug tracking-crisp line-clamp-2">
                    {r.title}
                  </p>
                  <p className="kicker tabular mt-1">
                    {formatRecordedAt(r.recordedAt)}
                    {r.durationSec != null ? ` ・ ${formatDuration(r.durationSec)}` : ''}
                  </p>
                  {r.summary ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/75 line-clamp-2">
                      {r.summary}
                    </p>
                  ) : null}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRecordedAt(iso: string | null): string {
  if (!iso) return '日時不明';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ja-JP', {
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

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
}
