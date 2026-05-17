import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { withdrawConsent } from '@/lib/auth/onboarding';
import { requireUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { AlertTriangle } from 'lucide-react';

export const metadata = { title: 'プライバシー / 同意の管理' };
export const dynamic = 'force-dynamic';

type SearchParams = { status?: string; error?: string };

type ConsentRow = {
  consent_type: string;
  version: string;
  accepted_at: string;
  withdrawn_at: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  terms_of_service: '利用規約',
  privacy_policy: 'プライバシーポリシー',
  data_processing: 'データ処理',
  marketing_communications: 'マーケティング通信',
  recording_consent: '録画同意',
};

export default async function PrivacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const supabase = await createServerClient();

  const { data: rows } = await supabase
    .from('consent_logs')
    .select('consent_type, version, accepted_at, withdrawn_at')
    .eq('user_id', user.id)
    .order('accepted_at', { ascending: false });

  const consents = (rows ?? []) as ConsentRow[];
  const active = consents.filter((c) => !c.withdrawn_at);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-2xl px-6 pt-10 md:pt-16 pb-12 outline-none flex flex-col"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 mb-8 animate-fade-in">
        <p className="kicker">設定 / プライバシー</p>
        <p className="kicker">同意の管理</p>
      </div>

      <header className="space-y-2 mb-8 animate-fade-up">
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          同意した内容と、撤回の操作。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          いつでも同意を撤回できます。撤回すると本サービスの一部または全部が利用できなくなる場合があります。撤回後の再利用には、再度同意フローが必要です。
        </p>
      </header>

      {params.status === 'withdrawn' ? (
        <Alert variant="success" role="status" aria-live="polite" className="mb-6 animate-fade-up">
          <AlertTitle>同意を撤回しました</AlertTitle>
          <AlertDescription>
            撤回の事実は append-only
            で記録されます。再利用するときは「ホーム」から再度同意フローを進めてください。
          </AlertDescription>
        </Alert>
      ) : null}

      {params.error ? (
        <Alert
          variant="destructive"
          role="alert"
          aria-live="assertive"
          className="mb-6 animate-fade-up"
        >
          <AlertTitle>撤回処理に失敗しました</AlertTitle>
          <AlertDescription>時間をおいて再度お試しください。</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-4 animate-fade-up [animation-delay:60ms]">
        {consents.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              まだ同意の記録がありません。
            </CardContent>
          </Card>
        ) : null}

        {consents.map((c) => {
          const isWithdrawn = !!c.withdrawn_at;
          const isWithdrawable = ['terms_of_service', 'privacy_policy'].includes(c.consent_type);

          return (
            <Card key={`${c.consent_type}-${c.version}`}>
              <CardHeader className="flex-row items-baseline justify-between gap-3">
                <CardTitle>{TYPE_LABEL[c.consent_type] ?? c.consent_type}</CardTitle>
                <span className="kicker">v{c.version}</span>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid gap-1 [grid-template-columns:auto_1fr] gap-x-3 text-sm">
                  <dt className="text-muted-foreground">同意日時</dt>
                  <dd className="tabular">{new Date(c.accepted_at).toLocaleString('ja-JP')}</dd>
                  {isWithdrawn ? (
                    <>
                      <dt className="text-muted-foreground">撤回日時</dt>
                      <dd className="tabular text-destructive">
                        {new Date(c.withdrawn_at as string).toLocaleString('ja-JP')}
                      </dd>
                    </>
                  ) : null}
                </dl>

                {!isWithdrawn && isWithdrawable ? (
                  <form
                    action={withdrawConsent}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/60"
                  >
                    <input type="hidden" name="consent_type" value={c.consent_type} />
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <AlertTriangle
                        aria-hidden
                        strokeWidth={1.6}
                        className="size-4 shrink-0 text-ochre"
                      />
                      撤回すると、再ログイン時に再同意フローに戻ります。
                    </p>
                    <SubmitButton variant="outline" size="sm" pendingLabel="撤回中…">
                      同意を撤回する
                    </SubmitButton>
                  </form>
                ) : isWithdrawn ? (
                  <p className="text-xs text-muted-foreground border-l-2 border-destructive/60 pl-3 py-1">
                    この同意は撤回済みです。
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <p className="mt-8 text-xs text-muted-foreground border-t border-border/60 pt-4">
        本記録は append-only で audit 用に最長 7 年保持されます。同意撤回は本人 (auth.uid)
        のみが行えます。
      </p>
    </main>
  );
}
