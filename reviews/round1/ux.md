# UX Review — Round 1
**Score: 62 / 100**

scaffold段階としては最低限の動線（top → /login → OAuth → /dashboard）と Tailwind theme tokens は通っているが、**設計書 17_offline_mobile / 21_a11y_i18n / 19_onboarding_initial / 20_failure_recovery で Phase1 (P1) と明記されている要件のうち、コード/コメント/プレースホルダー文書化で痕跡を残していない項目が多い**。特に `public/manifest.json` 不在 (PWA Install は P1)、handedness の P1 昇格 (v2.3) 痕跡なし、SC-70 `/403`・SC-71 `/offline` (P1) のプレースホルダーなし、shadcn/ui の `components/ui/*` が一切ない (cn() だけ)、サインアウト導線が UI に出ていない、loading state 皆無、login のエラー表示なし — がスコアを引き下げている。

## Breakdown
- Phase1必須画面scaffold: 9/20
- 認証フロー UX: 9/15
- A11y/i18n: 7/15
- エラー回復: 4/10
- オフライン/モバイル: 3/10
- デザインシステム: 5/10
- コピー/トーン: 4/5
- オンボーディング: 1/5
- モバイル最適化: 2/5
- ナビゲーション: 1/5

---

## Critical (-5 each)

### C1. P1 必須プレースホルダー画面が一切ない (Phase1必須画面 -5)
設計書 02_screens で P1 と明記されている画面のうち、`/login` `/dashboard` 以外**全部欠落**。具体的に以下は Phase1 W2-W4 で実装するため、最低でも空ディレクトリ + `page.tsx` の TODO コメント or `notFound()` プレースホルダーが必要：

- SC-06 `/contacts/import` (T-007, P1)
- SC-08 `/contacts/[id]/review` (T-010, P1)
- SC-09 `/meetings` (T-014, P1)
- SC-11 `/meetings/[id]` (T-014, P1)
- SC-15 `/recordings` (T-014, P1)
- SC-16 `/recordings/[id]` (T-014, P1)
- SC-17 `/search` (T-016, P1)
- SC-27 `/admin/users` (T-017, P1)
- SC-32 `/settings` (P1)
- SC-33 `/mobile/scan` (P1, 専用モバイル)
- SC-34 `/mobile/queue` (P1, 専用モバイル)
- SC-35 `/mobile/quick-lookup` (P1, 専用モバイル)
- SC-61 `/onboarding` (P1, ガイドツアー)
- **SC-70 `/403` (P1)** — 設計書 21_a11y_i18n / 20_failure_recovery で「権限不足は申請動線」とされている。エラー画面でなく機能画面。
- **SC-71 `/offline` (P1)** — Service Worker 前提の offline UI。
- SC-66 `/settings/notifications` (P1)
- SC-73 `/dashboard` (P1リファイン版)

**修正パッチ案**: 最低限、以下のプレースホルダーをすべて作る（30行以内のスタブで可）：

```tsx
// apps/web/src/app/contacts/import/page.tsx
export const metadata = { title: '名刺一括取込 | KSP' };

export default function ContactsImportPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">名刺一括取込</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Phase1 T-007 で実装予定 (Week2)。MultiFileDropzone + OCRProgressList + ReviewQueue。
        See design spec 02_screens SC-06 / 17_offline_mobile (バーストreview G-8)。
      </p>
    </main>
  );
}
```

→ 同様に **SC-70 `/403` と SC-71 `/offline` は Phase1 必須**で他のページからリンクされる前提なので、スタブだけでも今ラウンドで作っておくこと。

### C2. PWA / Service Worker / IndexedDB の設計痕跡ゼロ (オフライン/モバイル -5)
17_offline_mobile では以下が **P1**：
- `撮影 (OpenCV.js+ガイド枠)` P1
- `フラッシュON (MediaDevices torch)` P1
- `ハプティクス (navigator.vibrate)` P1
- `オフラインキュー 100件 (IndexedDB+SW sync)` P1
- `片手UI bottom_action_bar` P1
- `PWA Install (manifest.json+SW)` P1
- `権限要求 (UIプロンプト)` P1
- `IndexedDB暗号化 (libsodium)` P1
- `LRU eviction` P1
- `撮影前ガイド (blur/exposure 即時算出)` P1
- `バーストreview (100枚連続)` P1
- `fallback_capture_mode (volume_button > long_press > 3s_relax > voice_command(SNR>10))` P1 (v2.3 で P1 昇格)
- `handedness P1昇格 (左右利きCSSミラーリング)` P1 (v2.3)
- `IndexedDB wipe強化 (is_active=false即時wipe)` P1
- `Recorder handedness mirror` P1
- `voice_command shutter フォールバック (騒音時無効化)` P1

しかし `apps/web/public/` は**空ディレクトリ**で `manifest.json` も `sw.js` も存在しない。`next.config.mjs` にも PWA 関連設定なし。`viewport` メタタグも `layout.tsx` に未定義。

**修正パッチ案**:
1. `apps/web/public/manifest.json` を作成（最小でも name/short_name/icons/display=standalone/start_url=/dashboard）。
2. `apps/web/src/app/layout.tsx` に `viewport` export 追加 (`viewport-fit=cover`, `themeColor`)。
3. `apps/web/src/app/manifest.ts` (Next.js 15 metadata API) で型安全に。
4. `next.config.mjs` に `next-pwa` or `@serwist/next` 導入の TODO コメント。
5. `apps/web/src/lib/offline/` ディレクトリを作って IndexedDB ラッパの skeleton (encrypt 前提のインターフェイス) を置く。

```ts
// apps/web/src/app/layout.tsx
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};
```

### C3. A11y/i18n の最低ラインを満たすコード痕跡が薄い (A11y/i18n -3, 1件Critical級だが High に格下げ → -3)
詳細は H1 にまとめる。`<html lang="ja">` は OK。だが i18n ライブラリ未導入、focus-visible スタイル未定義、skip link なし、aria-* どこにもなし、prefers-color-scheme の `dark` token は CSS にあるが切替 UI なし。

---

## High (-3 each)

### H1. focus-visible / skip link / aria-live の素地がゼロ (A11y -3)
- `globals.css:30-32` で `* { border-color: ... }` だが `:focus-visible` のスタイル未定義 → キーボード操作でフォーカスリングが消失する Tailwind preflight の罠。
- `app/page.tsx` `app/login/page.tsx` `app/dashboard/page.tsx` のいずれにも skip-to-main link なし。
- 21_a11y_i18n v2.3 で `live region優先度` `コンポーネント別ARIA定義` が明記されているが、Provider/Layout に `<div role="status" aria-live="polite">` の置き場が存在しない。

**修正パッチ案**:
```css
/* apps/web/src/app/globals.css に追加 */
@layer base {
  :focus-visible {
    outline: 2px solid hsl(var(--primary));
    outline-offset: 2px;
  }
  .sr-only-focusable:focus,
  .sr-only-focusable:focus-visible {
    position: static; width: auto; height: auto; padding: .5rem 1rem;
    background: hsl(var(--background)); color: hsl(var(--foreground));
  }
}
```
```tsx
// apps/web/src/app/layout.tsx body 直下
<a
  href="#main-content"
  className="sr-only sr-only-focusable absolute left-2 top-2 z-50 rounded bg-primary px-3 py-2 text-primary-foreground"
>
  本文へスキップ
</a>
{children}
```
そして全 `<main>` に `id="main-content"` 付与。

### H2. login のエラー表示が UI に出ていない (認証フロー -3)
- `auth/callback/route.ts:10,17` で `?error=...` を付けて redirect しているが、`login/page.tsx` が `searchParams` を全く読んでいない。OAuth が落ちた場合、ユーザーには**何も表示されない**(URL に error が乗るだけ)。これは現場で「サインインボタン押しても反応しない」と感じる Critical 寄りの High。
- 同様に `?next=` も login で読まれず、callback の `next` だけ機能。`/dashboard 直叩き → /login?next=/dashboard` の middleware redirect 後、ログイン成功時に `/dashboard` に戻すリンクが切れている (callback は URL 直接 GET の `next` query しか見ない)。

**修正パッチ案**:
```tsx
// apps/web/src/app/login/page.tsx
type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-stretch justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">サインイン</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          会社のGoogleアカウントでサインインしてください
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          サインインに失敗しました: {decodeURIComponent(error)}
          <p className="mt-1 text-xs text-destructive/80">時間をおいて再度お試しいただくか、管理者にお問い合わせください。</p>
        </div>
      ) : null}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next ?? '/dashboard'} />
        <button ...>...</button>
      </form>
      ...
    </main>
  );
}
```
そして `signInWithGoogle` で `formData.get('next')` を受け取り、`redirectTo: \`${env.APP_URL}/auth/callback?next=${encodeURIComponent(next)}\`` で引き回す。

### H3. ナビゲーション骨格が一切ない (ナビゲーション -3)
- ヘッダー/サイドナビ/パンくずがゼロ。`/dashboard` から他画面へ行く UI 動線が**存在しない**(URL 直打ちのみ)。
- サインアウトボタンがどの画面にも存在しない (`signOut` action は `lib/auth/actions.ts:38` にあるが UI 未配線)。
- 設計書 SC-25 (manager dashboard), SC-27 (admin/users), SC-32 (settings) は role 別表示が必要だが、layout レベルの role 取得ヘルパもない。

**修正パッチ案**:
```tsx
// apps/web/src/components/layout/app-shell.tsx (新規)
import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';

export function AppShell({ user, children }: { user: { email: string; role?: string }; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <nav aria-label="グローバル" className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="font-semibold">KSP</Link>
            <Link href="/contacts">連絡先</Link>
            <Link href="/meetings">商談</Link>
            <Link href="/recordings">録画</Link>
            <Link href="/search">検索</Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <form action={signOut}>
              <button type="submit" className="rounded border border-border px-3 py-1 hover:bg-muted">
                サインアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
```
`/dashboard/layout.tsx` (group layout) で wrap。

### H4. shadcn/ui コンポーネント基盤が空 (デザインシステム -3)
- `cn()` (utils.ts:1-6) と `class-variance-authority` `cmdk` `lucide-react` `sonner` 依存だけ入っているが、`src/components/ui/` ディレクトリが**一切存在しない**(`ls apps/web/src/components/` が存在せず — package.json 上 cva 入れてるのに)。
- shadcn add で生成される最低限の `button.tsx` / `input.tsx` / `dialog.tsx` / `toast.tsx` プリミティブが揃っていないと、T-007〜T-019 で同じ Tailwind class 文字列が大量重複する。
- Sonner の `<Toaster>` も `layout.tsx` に未配置 → トースト導線ゼロ。

**修正パッチ案**:
1. `pnpm dlx shadcn@latest init` を README に記載 (or `apps/web/src/components/ui/button.tsx` を手書き scaffold)。
2. `app/layout.tsx` に `<Toaster richColors closeButton position="top-right" />` 追加。
3. 最低 button/input/label/card/dialog/sheet/toast の 7 プリミティブを bootstrap。

### H5. オンボーディング誘導の設計痕跡が皆無 (オンボーディング -3)
- 19_onboarding_initial で **Step1〜Step6 が P1**、SC-61 `/onboarding` も P1。
- 「初回ログイン後のロール選択」「サンプルデータ Skip」「ガイドツアー」のいずれも `dashboard/page.tsx` から起動する仕組みなし。
- 利用規約同意 (M-C5, P1) の `consent_logs` 連動 UI も無し → コンプラ要件の P1。

**修正パッチ案**:
- `app/onboarding/page.tsx` プレースホルダーを作成、`dashboard/page.tsx` で `user.onboarded_at` が NULL なら `/onboarding` へ redirect する TODO コメントを `requireUser()` 周辺に書く。
- README ロードマップ表に T-005a (Onboarding shell) を追記。

### H6. handedness / dark_mode / 片手UI の P1 痕跡なし (オフライン/モバイル -3)
17_offline_mobile v2.3 で `handedness P1昇格` `bottom_action_bar` が **P1** 明記。21_a11y_i18n v2.2 でも `handedness_setting` `reach_zone_guideline` が用意されている。

- Tailwind config に logical properties (start/end) のエイリアスなし。
- ユーザー設定スキーマにも handedness 列がない (要 DB schema 確認別件)。
- `dark_mode 自動` (prefers-color-scheme) は CSS tokens にあるが、`<html class="dark">` を切り替える Provider が未実装。`next-themes` 等の依存も未投入。

**修正パッチ案**:
- `pnpm add next-themes` + `app/layout.tsx` を `<ThemeProvider attribute="class" defaultTheme="system">` でラップ。
- `tailwind.config.ts` に `darkMode: 'class'` 明示 (現状未指定で system 動作になっていない可能性)。

---

## Medium (-1 each)

### M1. `requireUser()` で role / onboarded_at を取得していない (認証 -1)
`lib/auth/server.ts:4-10` は `auth.getUser()` の返り値だけ返す。`public.users.role` `is_active` `onboarded_at` を join で取らないと、admin/manager 限定画面で都度 fetch する羽目になる。`requireUser({ minRole: 'admin' })` API 形にしておくと T-017 が早い。

### M2. `/dashboard` の loading.tsx / error.tsx が無い (認証/エラー -1)
Next.js App Router で `requireUser()` の DB 待ちがあるのに `loading.tsx` 未定義。OAuth 直後の reflow 時にユーザは白画面を見る。`error.tsx` も無く、Supabase 障害時の表示が全く制御されていない。

**修正パッチ案**:
```tsx
// apps/web/src/app/dashboard/loading.tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0,1,2].map(i => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />)}
      </div>
    </main>
  );
}
```

### M3. middleware の PUBLIC_PATHS に `/offline` `/403` `/share/[token]` が無い (エラー回復 -1)
`middleware.ts:4` の `PUBLIC_PATHS = ['/', '/login', '/auth/callback']`。
- `/offline` (SC-71 P1) は SW から表示するため未認証でも到達可能であるべき。
- `/share/[token]` (SC-31 P2 だが**トークン認証**) は middleware で auth ブロックすると永遠に開かない。
- `/403` (SC-70 P1) も未認証で踏める想定。
ヘルパーリクエスト (`/api/webhooks` は除外済) は OK。

**修正パッチ案**:
```ts
const PUBLIC_PREFIXES = ['/share/'];
const PUBLIC_PATHS = ['/', '/login', '/auth/callback', '/offline', '/403'];
const isPublic = PUBLIC_PATHS.includes(pathname)
  || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  || pathname.startsWith('/_next');
```

### M4. login の Calendar/Gmail スコープ説明文が法務的に弱い (コピー -1)
`login/page.tsx:25-27`:
> 「Calendar / Gmail スコープが付与されます。利用目的は商談スケジューリング・自動メールパースです。」

設計書 19_onboarding_initial v2.1 で **「利用規約同意 (M-C5, 版数+撤回scope)」が P1**。最低限「どの範囲を読み書きするか」「いつ revoke できるか」のリンクが要る。

**修正パッチ案**: 「詳細を見る」リンクで `/legal/scopes` に飛ばす or 折り畳みで `gmail.readonly: 受信メール本文の読み取り (送信メールに含まれる商談アポ情報の自動抽出に使用)` 等を明記。

### M5. `/admin/audit` 用の rollback / soft delete 動線設計コメントなし (エラー回復 -1)
20_failure_recovery で `コンタクト誤削除 (30日復旧)` `管理者大量削除 (reason+MFA+PITR)` `2デバイス衝突 (楽観ロック)` が明記されている。しかし関連 SC-55 `/admin/trash` (P2) や SC-74 `/inbox/conflicts` (P2) のスタブ or `// TODO` コメントが README ロードマップにも src ツリーにも存在しない。Phase 1 段階としては「Soft delete API は P1 だが UI は P2」をどこかに明文化すべき。

### M6. `font-feature-settings` のキャラクターバリアントが英字専用で日本語のレタスペース未定義 (デザイン -1)
`globals.css:35` `font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'` は Inter 用。日本語フォント (Noto Sans JP / 游ゴシック) の指定が `tailwind.config.ts` に無いので、Windows と macOS でレンダリングが大きく変わる。

**修正パッチ案**:
```ts
// tailwind.config.ts
fontFamily: {
  sans: ['var(--font-sans)', 'system-ui', '"Hiragino Sans"', '"Yu Gothic UI"', 'Meiryo', 'sans-serif'],
}
```
+ `next/font/google` で `Noto_Sans_JP` を `layout.tsx` で読み込み `--font-sans` に注入。

### M7. CSP / Permissions-Policy ヘッダ未設定 (エラー回復 -1, Sec 隣接)
`next.config.mjs` に `headers()` なし。Service Worker / camera / microphone 権限要求 (P1) を扱うのに `Permissions-Policy: camera=(self), microphone=(self)` の宣言が無いと iOS Safari で怒られる。

---

## Minor (-0.5 each)

### m1. ダッシュボードカードの hint テキストが社内用語そのまま (コピー -0.5)
`dashboard/page.tsx:18-20` `hint="Phase1 T-014で実装"` `"Phase1 T-007〜010"` — 営業現場ユーザに `T-XXX` は不要(管理者だけが分かる)。「商談一覧 (近日提供)」程度に変える。

### m2. `Card` コンポーネントが page 内ローカルで再利用不可 (デザイン -0.5)
`dashboard/page.tsx:26-34` で局所定義 → shadcn の `<Card>` に置換、`components/ui/card.tsx` に切り出し。

### m3. `Link` の `aria-current="page"` 未対応 (A11y -0.5)
ナビ実装時は `usePathname()` で active な Link に `aria-current="page"` を付ける運用を、AppShell の TODO コメントに残しておく。

### m4. Button の `type="submit"` のみで loading 表現なし (UX -0.5)
`login/page.tsx:17` `<button type="submit">`。OAuth で `redirect()` するため数秒かかる。`useFormStatus()` で disabled + spinner にしておかないと「動いてるのか」がわからない。

### m5. middleware の matcher が `/api/webhooks` だけ除外している (Minor -0.5)
`middleware.ts:22` で `api/webhooks` を除外。だが `/api/health` (Render プローブ) `/api/share/[token]` (公開) も該当する可能性。Phase1 のうちに `(?!api/webhooks|api/health|api/share)` などに拡張するメモを残す。

### m6. `next.config.mjs` に `experimental.typedRoutes: true` (next.config.mjs:5) を有効化済みだが、Link href の string literal が `next/link` 純正で型エラーになる可能性 (Minor -0.5)
プレースホルダー実装時に `as Route` キャスト or `import type { Route }` を入れること。`page.tsx:21,27` の `href="/login"` `href="/dashboard"` は今は通るが、`/contacts` 等の動的ルート追加時に typecheck 落ちる。

### m7. tailwind.config の content glob が `./src/**/*.{ts,tsx}` のみ (Minor -0.5)
`apps/web/src/app/**/*.mdx` 将来の help/legal MDX、`packages/shared/**/*.tsx` (UI 共有時) を取りこぼす。`'../../packages/**/src/**/*.{ts,tsx}'` も入れる。

---

## 総評
**現状は「Auth 動作する最小骨組」止まりで、設計書 v2.5 にある UX P1 要件 (PWA / handedness / 片手UI / オンボーディング / SC-70 SC-71 / shadcn primitive / loading-state / signout 動線) のほとんどが「文書すら残っていない」**。Phase1 W2 着手前にこのラウンドで埋めるべきは:

1. **必須**: `public/manifest.json`, `viewport export`, `:focus-visible`, skip link, `<Toaster>`, AppShell + signout, `/login` searchParams 表示, `/403` `/offline` スタブ — これだけで +15〜18点。
2. **強推奨**: shadcn primitive 7 個 bootstrap, `/contacts/import` `/meetings` `/search` `/admin/users` `/onboarding` のディレクトリ＋TODOページ — +6〜8点。
3. **次ラウンド送り可**: i18n (next-intl), next-themes, IndexedDB encrypt skeleton — Phase1 W3 までに。
