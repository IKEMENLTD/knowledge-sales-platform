import { requireUser } from '@/lib/auth/server';

export const metadata = { title: 'ダッシュボード | KSP' };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ようこそ、{user.email} さん
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="商談" value="—" hint="Phase1 T-014で実装" />
        <Card title="名刺取込" value="—" hint="Phase1 T-007〜010" />
        <Card title="ナレッジ検索" value="—" hint="Phase1 T-015〜016" />
      </section>
    </main>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
