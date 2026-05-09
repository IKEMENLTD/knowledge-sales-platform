import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';

export const metadata = { title: 'ダッシュボード' };

export default async function DashboardPage() {
  const user = await requireUser();

  // 19_onboarding_initial: オンボーディング未完了ユーザは /onboarding へ。
  // /onboarding 自体は別 layout なのでループしない (middleware は通過済み)。
  // onboarded_at 列が未マイグレーションの場合は null 固定 → リダイレクト。
  // GROUP A2 が migration を適用するまでは全員が一度 /onboarding を経由する想定。
  if (user.onboardedAt == null) {
    redirect('/onboarding');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ようこそ、{user.fullName ?? user.email} さん。本日の商談・新着ナレッジをここに表示します。
        </p>
      </header>

      <section
        aria-label="主要 KPI"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/*
         * UX/Round2 m1 / r2-3:
         * 内部タスクコード ("Phase1 T-014" 等) はエンドユーザに露出しない。
         * 開発者向けの紐付けはコード側のコメントで保持する。
         */}
        {/* 内部紐付け: SC-09 / T-014 商談一覧 */}
        <KpiCard title="今週の商談" value="—" hint="近日提供" />
        {/* 内部紐付け: SC-04 / T-007〜010 名刺取込 */}
        <KpiCard title="未処理名刺" value="—" hint="近日提供" />
        {/* 内部紐付け: SC-17 / T-015〜016 ナレッジ検索 */}
        <KpiCard title="ナレッジ検索" value="—" hint="近日提供" />
      </section>
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wider">{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
