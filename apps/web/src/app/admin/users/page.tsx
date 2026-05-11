import { Crown, MailPlus, MoreHorizontal, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DEMO_MEMBERS,
  type DemoMember,
  type DemoRole,
  ROLE_LABELS,
  relativeDayJp,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';

export const metadata = { title: 'メンバー' };

const NOW = new Date('2026-05-11T09:00:00+09:00');

const ROLE_TONE: Record<DemoRole, string> = {
  admin: 'border-cinnabar/45 bg-cinnabar/8 text-cinnabar',
  manager: 'border-chitose/45 bg-chitose-muted/30 text-chitose',
  member: 'border-foreground/20 bg-card text-foreground',
};

const STATUS_TONE: Record<DemoMember['status'], { label: string; className: string; Icon: typeof UserCheck }> = {
  active: {
    label: '稼働中',
    className: 'border-chitose/45 bg-chitose-muted/30 text-chitose',
    Icon: UserCheck,
  },
  invited: {
    label: '招待中',
    className: 'border-amber-500/45 bg-amber-500/8 text-amber-700 dark:text-amber-300',
    Icon: MailPlus,
  },
  suspended: {
    label: '停止',
    className: 'border-foreground/20 bg-muted text-muted-foreground',
    Icon: UserX,
  },
};

export default function AdminUsersPage() {
  const total = DEMO_MEMBERS.length;
  const active = DEMO_MEMBERS.filter((m) => m.status === 'active').length;
  const invited = DEMO_MEMBERS.filter((m) => m.status === 'invited').length;

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — メンバー</p>
        <span className="kicker tabular">
          全 {total} 名 ・ 稼働 {active} 名 ・ 招待中 {invited} 名
        </span>
      </div>

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-up">
        <div className="space-y-2 max-w-2xl">
          <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
            使う人を、管理する。
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            招待・役割の変更・退職時の引き継ぎまでを一つの画面で。停止すると保有データは指定した次の担当者へ移行されます。重要操作はすべて監査ログに記録されます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="default"
            disabled
            title="Phase 2 で実装予定"
          >
            <ShieldCheck aria-hidden className="size-4" />
            役割を見る
          </Button>
          <Button variant="cinnabar" size="default">
            <MailPlus aria-hidden className="size-4" />
            メンバーを招待
          </Button>
        </div>
      </header>

      <div className="hairline" aria-hidden />

      <section
        aria-label="メンバー一覧"
        className="animate-fade-up [animation-delay:80ms]"
      >
        <Card className="overflow-hidden p-0">
          {/* desktop: table */}
          <table className="hidden md:table w-full text-sm">
            <caption className="sr-only">組織メンバーの一覧と役割・稼働状態</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground border-b border-border/60">
                <th scope="col" className="py-3 pl-5 pr-3 font-medium">メンバー</th>
                <th scope="col" className="py-3 px-3 font-medium">部署</th>
                <th scope="col" className="py-3 px-3 font-medium">役割</th>
                <th scope="col" className="py-3 px-3 font-medium">状態</th>
                <th scope="col" className="py-3 px-3 font-medium">最終ログイン</th>
                <th scope="col" className="py-3 pr-5 pl-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_MEMBERS.map((m) => (
                <tr
                  key={m.id}
                  className={cn(
                    'border-b border-border/40 last:border-b-0',
                    'transition-colors duration-fast ease-sumi focus-within:bg-accent/40',
                  )}
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                      <Avatar member={m} />
                      <div className="min-w-0">
                        <p className="display text-sm font-semibold tracking-crisp truncate">
                          {m.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-foreground/85">{m.department}</td>
                  <td className="py-3 px-3">
                    <RoleBadge role={m.role} />
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="py-3 px-3 text-xs text-muted-foreground tabular">
                    {relativeDayJp(m.lastSeenAt, NOW)}
                  </td>
                  <td className="py-3 pr-5 pl-3 text-right">
                    <button
                      type="button"
                      aria-label={`${m.fullName} の操作メニュー (招待再送・役割変更・停止)`}
                      title="招待再送 / 役割変更 / 停止"
                      className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-fast ease-sumi focus-visible:outline-none focus-visible:shadow-focus-ring"
                    >
                      <MoreHorizontal aria-hidden className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-border/40">
            {DEMO_MEMBERS.map((m) => (
              <li key={m.id} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar member={m} />
                  <div className="min-w-0 flex-1">
                    <p className="display text-sm font-semibold tracking-crisp truncate">
                      {m.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${m.fullName} の操作メニュー`}
                    className="inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <RoleBadge role={m.role} />
                  <StatusBadge status={m.status} />
                  <span className="text-muted-foreground">{m.department}</span>
                </div>
                <p className="text-[11px] text-muted-foreground tabular">
                  最終ログイン {relativeDayJp(m.lastSeenAt, NOW)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section
        aria-label="ヘルプ"
        className="rounded-xl border border-dashed border-border/60 bg-card/50 p-5 animate-fade-up [animation-delay:120ms]"
      >
        <p className="kicker mb-2">引き継ぎポリシー</p>
        <p className="text-sm leading-relaxed text-foreground/85 max-w-prose">
          停止扱いにすると、保有する商談・名刺・録画の所有権は指定した次の担当者に移ります。本人がログインを試みた場合は 403 を返し、最後の操作から 60 日後にアカウントは自動削除予定キューへ入ります。
        </p>
      </section>
    </div>
  );
}

function Avatar({ member }: { member: DemoMember }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center size-9 rounded-full shrink-0',
        'bg-gradient-to-br from-foreground to-foreground/70 text-background',
        'text-xs font-semibold tracking-tight shadow-sumi-sm',
      )}
    >
      {member.initials}
    </span>
  );
}

function RoleBadge({ role }: { role: DemoRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-6 text-[10px] font-medium tracking-wide',
        ROLE_TONE[role],
      )}
    >
      {role === 'admin' ? (
        <Crown aria-hidden strokeWidth={1.8} className="size-3" />
      ) : role === 'manager' ? (
        <ShieldCheck aria-hidden strokeWidth={1.8} className="size-3" />
      ) : null}
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ status }: { status: DemoMember['status'] }) {
  const cfg = STATUS_TONE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-6 text-[10px] font-medium tracking-wide',
        cfg.className,
      )}
    >
      <cfg.Icon aria-hidden strokeWidth={1.8} className="size-3" />
      {cfg.label}
    </span>
  );
}
