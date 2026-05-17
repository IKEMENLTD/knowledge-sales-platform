import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  AtSign,
  CheckCheck,
  Clock,
  Inbox as InboxIcon,
  Mic,
  RefreshCcw,
  Reply,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { MarkAllReadForm, MarkReadForm, RetrySyncForm } from './_components/actions';

/**
 * 受信箱 / Inbox (Round2 P1 G-P0-2 部分実装)。
 *
 * 設計:
 *   - Server Component で `notifications` を SELECT。
 *   - 未読 (`read_at IS NULL`) を上、既読は折りたたみリンクで表示。
 *   - notification.type ごとに icon + link を出し分け、Link/再試行 等の動作を切替える。
 *
 * 認可:
 *   - `requireUser()` で sign-in 必須 (role 制約なし、全員アクセス可)。
 *   - RLS (notifications_self) で `user_id = auth.uid()` が強制されるため、
 *     application 層では追加 filter 不要。`createServerClient()` (anon+cookie) 経由。
 *
 * 編集的トーン:
 *   - 「届いていること」を № kicker + display title で受け止める。
 *   - 既読件数は 折りたたみ <details> で「過去 14 日分」を残し、それより古いものは
 *     アーカイブ済み扱い (将来 SC-55 ゴミ箱と連携)。
 */
export const metadata = { title: '受信箱' };

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface NotificationRow {
  id: string;
  type:
    | 'recording_ready'
    | 'reply_received'
    | 'handoff_pending'
    | 'sync_failed'
    | 'mention'
    | 'admin_action';
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const TYPE_META: Record<
  NotificationRow['type'],
  { label: string; Icon: typeof Reply; tone: string }
> = {
  recording_ready: {
    label: '録画',
    Icon: Mic,
    tone: 'border-chitose/45 bg-chitose-muted/30 text-chitose',
  },
  reply_received: {
    label: '返信',
    Icon: Reply,
    tone: 'border-foreground/20 bg-card text-foreground',
  },
  handoff_pending: {
    label: 'ハンドオフ',
    Icon: Clock,
    tone: 'border-amber-500/45 bg-amber-500/8 text-amber-700 dark:text-amber-300',
  },
  sync_failed: {
    label: '同期失敗',
    Icon: AlertTriangle,
    tone: 'border-cinnabar/45 bg-cinnabar/8 text-cinnabar',
  },
  mention: {
    label: 'メンション',
    Icon: AtSign,
    tone: 'border-foreground/20 bg-card text-foreground',
  },
  admin_action: {
    label: '管理者',
    Icon: ShieldCheck,
    tone: 'border-foreground/20 bg-card text-foreground',
  },
};

function jpRelative(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffMin = Math.round((now.getTime() - t) / 60_000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  });
}

export default async function InboxPage() {
  await requireUser();
  const supabase = await createServerClient();
  const now = new Date();
  const fourteenDaysAgoIso = new Date(now.getTime() - FOURTEEN_DAYS_MS).toISOString();

  // RLS が user_id=auth.uid() を強制してくれるので、ここでは org/user フィルタ不要。
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,link_url,is_read,read_at,created_at,metadata')
    .gte('created_at', fourteenDaysAgoIso)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(200);

  // error 時は空配列扱い (テーブル未作成等の早期環境耐性)。
  const rows = (error ? [] : ((data ?? []) as NotificationRow[]));
  const unread = rows.filter((r) => r.read_at === null);
  const read = rows.filter((r) => r.read_at !== null);

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 12 — 受信箱</p>
        <span className="kicker tabular">
          未読 {unread.length} 件 ・ 既読 {read.length} 件
        </span>
      </div>

      <header className="space-y-3 animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          届いたものを、まとめて受け取る。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          ハンドオフ依頼・録画準備完了・同期失敗など、確認が必要なものだけが順に並びます。既読にするとアーカイブされ、14日後に自動で消えます。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      {error ? (
        <Card className="p-6 border-cinnabar/30">
          <p className="text-sm leading-relaxed text-cinnabar">
            通知の取得に失敗しました。少し時間をおいて再読み込みしてください。
          </p>
        </Card>
      ) : null}

      <section
        aria-label="未読の通知"
        className="space-y-3 animate-fade-up [animation-delay:60ms]"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="kicker">未読</h2>
          {unread.length > 0 ? (
            <MarkAllReadForm>
              <Button type="submit" variant="ghost" size="sm">
                <CheckCheck aria-hidden className="size-4" />
                すべて既読にする
              </Button>
            </MarkAllReadForm>
          ) : null}
        </div>

        {unread.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <InboxIcon aria-hidden className="size-6 mx-auto mb-3 opacity-50" />
            未読の通知はありません。
          </Card>
        ) : (
          <ul className="space-y-2">
            {unread.map((n) => (
              <NotificationItem key={n.id} n={n} now={now} />
            ))}
          </ul>
        )}
      </section>

      {read.length > 0 ? (
        <section
          aria-label="既読の通知"
          className="space-y-3 animate-fade-up [animation-delay:120ms]"
        >
          <details className="group">
            <summary
              className={cn(
                'kicker cursor-pointer select-none inline-flex items-center gap-2',
                'rounded-md px-2 py-1 -mx-2 hover:bg-accent/40',
                'focus-visible:outline-none focus-visible:shadow-focus-ring',
              )}
            >
              既読 ({read.length} 件) を表示
            </summary>
            <ul className="mt-3 space-y-2">
              {read.map((n) => (
                <NotificationItem key={n.id} n={n} now={now} dimmed />
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function NotificationItem({
  n,
  now,
  dimmed,
}: {
  n: NotificationRow;
  now: Date;
  dimmed?: boolean;
}) {
  const cfg = TYPE_META[n.type];
  const Icon = cfg.Icon;
  const rel = jpRelative(n.created_at, now);
  const escalatedAt48 =
    typeof n.metadata?.escalated_at_48h === 'string' ? (n.metadata.escalated_at_48h as string) : null;
  const escalatedAt72 =
    typeof n.metadata?.escalated_at_72h === 'string' ? (n.metadata.escalated_at_72h as string) : null;

  return (
    <li>
      <Card
        className={cn(
          'p-4 flex items-start gap-4 transition-colors duration-fast ease-sumi',
          dimmed && 'opacity-70 bg-card/60',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center size-9 shrink-0 rounded-full border',
            cfg.tone,
          )}
        >
          <Icon strokeWidth={1.6} className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-kicker text-muted-foreground">
              {cfg.label}
            </span>
            <span className="text-[10px] text-muted-foreground tabular">{rel}</span>
            {escalatedAt72 ? (
              <span className="text-[10px] text-cinnabar tabular border border-cinnabar/40 rounded-full px-1.5">
                72h 経過 / 管理者通知済
              </span>
            ) : escalatedAt48 ? (
              <span className="text-[10px] text-amber-700 dark:text-amber-300 tabular border border-amber-500/40 rounded-full px-1.5">
                48h 経過 / 上長通知済
              </span>
            ) : null}
          </div>
          <p className="display text-sm md:text-[0.95rem] font-semibold tracking-crisp leading-snug">
            {n.title}
          </p>
          {n.body ? (
            <p className="text-xs md:text-sm text-foreground/80 leading-relaxed line-clamp-3 whitespace-pre-line">
              {n.body}
            </p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            {n.link_url ? (
              <Link
                href={n.link_url as never}
                className={cn(
                  'inline-flex items-center text-xs font-medium text-cinnabar',
                  'underline-offset-2 hover:underline',
                  'focus-visible:outline-none focus-visible:shadow-focus-ring rounded',
                )}
              >
                開く →
              </Link>
            ) : null}
            {n.type === 'sync_failed' ? (
              <RetrySyncForm notificationId={n.id}>
                <Button type="submit" variant="outline" size="sm">
                  <RefreshCcw aria-hidden className="size-3.5" />
                  再試行
                </Button>
              </RetrySyncForm>
            ) : null}
            {!n.is_read ? (
              <MarkReadForm notificationId={n.id}>
                <Button type="submit" variant="ghost" size="sm">
                  既読にする
                </Button>
              </MarkReadForm>
            ) : null}
          </div>
        </div>
      </Card>
    </li>
  );
}
