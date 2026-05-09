import { signInWithGoogle } from '@/lib/auth/actions';

export const metadata = { title: 'サインイン | KSP' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-stretch justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">サインイン</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          会社のGoogleアカウントでサインインしてください
        </p>
      </div>

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          <span aria-hidden>🔐</span>
          Googleでサインイン
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Calendar / Gmail スコープが付与されます。利用目的は商談スケジューリング・自動メールパースです。
      </p>
    </main>
  );
}
