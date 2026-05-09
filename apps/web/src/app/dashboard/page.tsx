import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';

export const metadata = { title: 'ダッシュボード' };

export default async function DashboardPage() {
  const user = await requireUser();

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
        <KpiCard title="今週の商談" value="—" hint="Phase1 T-014 で実装" />
        <KpiCard title="未処理名刺" value="—" hint="Phase1 T-007〜010 で実装" />
        <KpiCard title="ナレッジ検索" value="—" hint="Phase1 T-015〜016 で実装" />
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
