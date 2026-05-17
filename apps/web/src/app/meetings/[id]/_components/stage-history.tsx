import { Card } from '@/components/ui/card';
import type { MeetingStage } from '@ksp/shared';
import { GitMerge } from 'lucide-react';

export type StageTransition = {
  id: string;
  fromStage: MeetingStage | null;
  toStage: MeetingStage;
  changedAt: string;
  changedByName: string | null;
  reason: string | null;
};

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

/**
 * `meeting_stage_transitions` を timeline 表示。
 * 「誰がいつどこへ動かしたか」を縦に並べる。
 */
export function StageHistory({
  transitions,
}: {
  transitions: StageTransition[];
}) {
  return (
    <section aria-labelledby="stage-history-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <GitMerge aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2 id="stage-history-heading" className="display text-lg font-semibold tracking-crisp">
          ステージの軌跡
        </h2>
        <span className="kicker tabular">{transitions.length} 件</span>
      </div>

      <Card className="p-5">
        {transitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ履歴はありません。最初のステージ移行はここに記録されます。
          </p>
        ) : (
          <ol className="relative pl-5 space-y-4">
            <span aria-hidden className="absolute left-[7px] top-1 bottom-1 w-px bg-border/70" />
            {transitions.map((t) => (
              <li key={t.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-5 top-1 inline-flex size-3 rounded-full bg-cinnabar"
                />
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {t.fromStage ? STAGE_LABEL_JP[t.fromStage] : '未設定'}
                  </span>
                  <span aria-hidden className="text-muted-foreground/60">
                    {' → '}
                  </span>
                  <span className="font-semibold text-foreground">{STAGE_LABEL_JP[t.toStage]}</span>
                </p>
                <p className="kicker tabular mt-0.5">
                  <time dateTime={t.changedAt}>{formatChangedAt(t.changedAt)}</time>
                  {t.changedByName ? ` ・ ${t.changedByName}` : ''}
                </p>
                {t.reason ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/75 border-l-2 border-border/60 pl-2">
                    {t.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}

function formatChangedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}
