# Mobile Responsiveness Auditor — Round 1
**Score: 64 / 100**

## 実機シミュレーション (iPhone SE / iPhone 15 / Pixel 7 想定)
- iPhone SE (320px / 375px) で `/dashboard` を開くと、ヘッダーは出るが **メインナビゲーションが完全に消える** (`HeaderNav` が `hidden md:flex`、ハンバーガーも置かれていない)。サインアウトボタンしか押せず、商談・名刺取込・検索への導線が事実上ロスト。Critical。
- iPhone 15 で `/login` → Google ボタンを押した後、フォーム input をタップすると **iOS が自動でズーム** する (`Input` が `text-sm` = 14px、iOS の 16px しきい値を下回る)。ピンチアウトで戻る必要があり営業現場で致命的。
- Pixel 7 でアドレスバー出現/格納時に `min-h-dvh` は追従するが、ヘッダーが `sticky top-0` で **safe-area-inset-top の余白がなく**、スクロール最上部でステータスバー裏に文字が潜る (notch+ display cutout)。

## Breakdown

| 観点 | 配点 | 取得 | コメント |
|---|---:|---:|---|
| viewport / safe-area / themeColor | 15 | 9 | viewport export + viewport-fit=cover + themeColor light/dark は完備。ただし safe-area 対応は bottom action bar の `pb-[max(...,env(safe-area-inset-bottom))]` のみ。`top` (notch)・`left/right` (ランドスケープ・Dynamic Island) 未対応、CSS変数化もされていない。-6 |
| breakpoint 設計 | 15 | 9 | sm/md/lg は標準利用。container は `2xl: 1280px` のみ override で実用的。**xs (320–375px) ブレークポイント未定義**、`tailwind.config.ts` の `screens` 上書きなしで sm 以下は単一バケット。container queries 未活用、grid は `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` で stack はしている。-6 |
| タッチターゲット | 10 | 4 | `Button` default size = `h-10` (40px) で iOS HIG 44px 未満。`size: lg` で 44px 到達するが利用箇所は login のみ。HeaderNav リンクは `py-2 px-3` ≈ 36px。サインアウトボタンは `py-1.5` で 32px 程度。Sheet の close X は `h-4 w-4` クリッカブル領域 16px のみ。Critical。-6 |
| bottom nav / 片手UI | 15 | 6 | handedness CSS var (`--bottom-action-bar-justify`) は基盤として優秀。ただし **bottom navigation 自体が存在しない**。`AppShell` の `bottomActionBar` は「slot」で、各ページが渡さない限り出ない。`/dashboard` `/meetings` `/search` などモバイル主動線で `bottomActionBar` を使っているページがゼロ → モバイル時の主要遷移手段が消滅。reach zone (画面下 1/3) の活用ゼロ。-9 |
| 入力体験 | 10 | 4 | `Input` は `text-sm` (14px) で **iOS Safari ズーム発火**。`type` の使い分け方針 (email/tel/url) や `inputMode`、`autoComplete`、`autoCapitalize` の指針なし。日本語名 input で `autoCapitalize="none"` 不指定だと余計な大文字化が起きる。-6 |
| スクロール / overflow | 10 | 5 | `min-h-dvh` 採用は良い。sticky header + `backdrop-blur` で見栄え可。ただし `overscroll-behavior: contain` 未設定 → モーダル外の body スクロール抜け、bottom action bar から body へのスクロール chaining が発生。`-webkit-overflow-scrolling: touch` は iOS 13+ で標準だが明記すると安全。pull to refresh を妨げない設計上の宣言なし。-5 |
| PWA / SW / オフライン | 10 | 4 | `manifest.ts` は name/short_name/start_url/scope/display/orientation/theme_color/background_color/icons (192/512 maskable) を定義し最低限合格。だが **icon は実体 png なし** (public/ に icon-192.png / icon-512.png 未配置)。`apple-touch-icon` 対応 (180x180) なし、`shortcuts` (商談メモ/名刺スキャン) なし、`screenshots` なし。`sw.js` は no-op で `fetch` ハンドラ空、**`/offline` への navigation fallback が未配線** → 設計書の意図 (offline で SC-71 表示) を達成していない。-6 |
| モバイル特有導線 | 10 | 7 | `/mobile/scan` `/mobile/queue` `/mobile/quick-lookup` の placeholder は scCode/taskCode 紐付けが明確で意図伝達は良。ただし **これらへの導線が AppShell に無い** (NAV_ITEMS にも bottom action bar にも未登場、ハンバーガーメニュー無し) → ユーザは URL 直打ちでしか到達できない。Permissions-Policy `camera=self` の言及はコメントのみで実体なし。-3 |
| パフォーマンス想定 | 5 | 3 | 日本語フォントは Noto Sans JP / Hiragino をシステムフォントスタックで指定 (subset 不要・Web Font 不採用) は賢明。`font-display: swap` 等は Web Font を使ってないので非該当。一方で `next/image` 利用箇所がプレースホルダー段階でゼロ・bundle 計測 / `loading="lazy"` 方針記述なし、Lighthouse 測定の前提条件不明。-2 |
| **合計** | **100** | **51** + **+13 (基盤評価加点)** = **64** |

注: 基盤加点 = handedness CSS var、viewport-fit=cover、min-h-dvh、prefers-reduced-motion 配慮、sticky header backdrop-blur、bottom action bar の safe-area 等の「将来モバイル化を見据えた仕込み」を W1 scaffold 段階の評価として +13 加算。

## モバイル現場 7 シナリオ別評価

### 1. 商談直前/直後にダッシュボードを開く — **C (現場で困る)**
- /dashboard 自体は 1/2/3 col の grid で stack するため数値は読める。
- だが **画面遷移ができない**: 商談一覧へ飛ぶリンクが mobile に出ない (HeaderNav md:flex)。商談直前に「相手の名前」を引きたいが、URL 直打ちか `/dashboard` の中の文言クリックしか手段がない。
- 「ようこそ、{user.fullName ?? user.email} さん」の email がメールアドレスで長い場合、`<header>` 内 `text-2xl` 見出しと干渉して 320px で改行頻発。`max-w-` 制限なし。

### 2. 商談中に検索する (画面共有しない) — **D (実機で破綻)**
- `/mobile/quick-lookup` は placeholder で機能ゼロ (W1 想定通り)。
- AppShell からの導線がない → 商談中に URL 直打ちは不可能。bottom action bar に「クイック検索」を常駐させる設計が現状ない。
- `/search` 画面ヘッダーは ⌘K 言及があるが、モバイルにキーボードショートカットは無効。モバイルファーストで `/` キーや FAB (floating action button) の代替を提示すべき。

### 3. 移動中の片手スクロール — **B-**
- `min-h-dvh` で iOS のアドレスバー伸縮に対応。
- 主要操作 (サインアウト) が **画面右上** にあり親指リーチ外。bottom action bar が空のページが大半なので、reach zone を活かせていない。
- handedness CSS var は優秀だが、利き手切替 UI が無く `data-handedness="left"` を設定する箇所もない。

### 4. 名刺撮影 (T-008 想定) — **B**
- `/mobile/scan` placeholder の helpText は意図 (getUserMedia, 連射, IndexedDB 暗号化キュー) を明文化し W1 段階としては誠実。
- **問題**: ページに到達する手段がない。`/contacts/import` から `/mobile/scan` への CTA リンクなし。Permissions-Policy header (`Permissions-Policy: camera=self`) は **next.config.mjs / middleware で未付与** (コメントだけ)、本実装時に PreflightCheck で詰む。

### 5. オフライン (地下鉄/エレベータ) — **D**
- `/offline` ページ自体は丁寧 (SC-71、CTA 2 つ)。
- だが `sw.js` の `fetch` ハンドラが空関数 → **navigation fail 時の `/offline` フォールバックが配線されていない**。実機で機内モードにすると Chrome / Safari のデフォルトオフライン画面 (恐竜 / 雲) が出るだけ。manifest 記載と実動が乖離。
- `start_url: '/dashboard'` で installed PWA は dashboard を初回起動時に SSR 取得 → オフライン時 PWA 起動で白画面リスク。

### 6. 通知タップで該当 meeting 詳細へ — **C**
- `/meetings/[id]` ルートは存在 (loading.tsx/error.tsx 完備) が、PWA push 通知の URL ハンドリング、`scope: '/'` 内で deep link が機能するかの検証ポイント不明。
- 通知 → 起動 → 該当画面遷移時に「戻る」がない (back button without history)。bottom action bar が空なので「ダッシュボードへ戻る」UI 無し。

### 7. サインアウトしてから再ログイン — **B**
- サインアウトボタンが `<form action={signOut}>` で実装され、SubmitButton ではなく素の button → `useFormStatus` の pending 状態が出ない。連打で多重 sign-out リクエスト発生の可能性。
- 再ログイン /login の card は `max-w-md` で 320px 端末でも収まる。CTA は `size="lg"` (h-11 = 44px) でタッチ OK。
- ただし `🔐` 絵文字は機種依存表示・色付き (Apple Color Emoji は OS 依存)。アクセシブル名は `aria-label` で吸収済みだが視覚一貫性に欠ける。

---

## Critical / High / Medium / Minor

### Critical (-8)

**C-1**: モバイルで主要ナビゲーションが消える
- 場所: `apps/web/src/components/layout/header-nav.tsx:21` `className="hidden md:flex ..."` + `app-shell.tsx:80` (bottomActionBar はオプショナル slot)
- 影響: iPhone でログイン後、ダッシュボード以外の画面に「リンクをクリックして」到達する手段がない。/contacts/import /meetings /recordings /search すべて URL 直打ちでしか開けない。
- 修正:
  ```tsx
  // 1. AppShell に MobileBottomNav を必須レンダリング (slot とは別軸)
  // src/components/layout/mobile-bottom-nav.tsx を新設
  // bottomActionBar は「ページ固有 1〜2 ボタン」用、主ナビゲーションは別の固定 nav に分離
  // 2. NAV_ITEMS から主要 4-5 件 (ダッシュボード / 商談 / 名刺 / 検索 / メニュー) を bottom tab 化
  // 3. <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] grid grid-cols-5">
  ```

**C-2**: iOS Safari でフォーム input がズームする
- 場所: `apps/web/src/components/ui/input.tsx:12` `text-sm`
- 影響: 名刺取込・検索・設定など入力を伴う全画面で発生。営業現場で致命的なストレス。
- 修正: 
  ```tsx
  // base クラスを text-base (16px) に上げ、md 以上で text-sm に下げる
  'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ...'
  // 加えて h-10 → h-11 (44px) でタッチターゲットも同時改善
  ```

### High (-5)

**H-1**: ボタンの最小タッチターゲット未達
- 場所: `apps/web/src/components/ui/button.tsx:20-25` size variants (default `h-10`, sm `h-9`, icon `h-10 w-10`)
- 影響: iOS HIG 44pt / Material 48dp 未満。隣接ボタンの誤タップ多発。
- 修正:
  ```tsx
  size: {
    default: 'h-11 px-4 py-2',          // 44px
    sm:      'h-10 rounded-md px-3',    // 40px (compact only)
    lg:      'h-12 rounded-md px-8',    // 48px
    icon:    'h-11 w-11',               // 44x44
  },
  ```

**H-2**: safe-area 対応が bottom 一箇所のみ
- 場所: `apps/web/src/app/globals.css` (top/left/right の safe-area 変数なし)、`app-shell.tsx:38` sticky header (top inset 未配慮)
- 影響: notch / Dynamic Island 機種でヘッダー文字がステータスバーに潜る。ランドスケープ時に左右の rounded corner にコンテンツが入る。
- 修正:
  ```css
  /* globals.css */
  :root {
    --safe-area-top:    env(safe-area-inset-top);
    --safe-area-bottom: env(safe-area-inset-bottom);
    --safe-area-left:   env(safe-area-inset-left);
    --safe-area-right:  env(safe-area-inset-right);
  }
  body { padding-left: var(--safe-area-left); padding-right: var(--safe-area-right); }
  ```
  ```tsx
  // app-shell.tsx header
  className="sticky top-0 z-40 ... pt-[env(safe-area-inset-top)]"
  ```

**H-3**: Service Worker が `/offline` フォールバックを配線していない
- 場所: `apps/web/public/sw.js:16-18` 空 `fetch` ハンドラ
- 影響: 機内モード時に意図した SC-71 画面が出ない。設計書 17_offline_mobile と乖離。
- 修正 (W1 scaffold としても最低限):
  ```js
  const OFFLINE_URL = '/offline';
  self.addEventListener('install', (e) => {
    e.waitUntil(caches.open('ksp-offline-v1').then((c) => c.addAll([OFFLINE_URL])));
    self.skipWaiting();
  });
  self.addEventListener('fetch', (e) => {
    if (e.request.mode !== 'navigate') return;
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
  });
  ```

**H-4**: モバイル特化ページへの導線がアプリシェルに無い
- 場所: `apps/web/src/components/layout/app-shell.tsx:7-13` NAV_ITEMS に /mobile/* が登場しない
- 影響: `/mobile/scan` `/mobile/queue` `/mobile/quick-lookup` が孤立し、placeholder が UX 上死蔵。
- 修正: bottom nav (C-1) のタブに `/mobile/scan` (中央 FAB) と `/mobile/quick-lookup` (左/右タブ) を組み込み、`/mobile/queue` はサブナビ or バッジでオフラインキュー件数表示。

### Medium (-2)

**M-1**: PWA icon の実体ファイル不在
- 場所: `apps/web/public/` に `icon-192.png` / `icon-512.png` がない (README.md:9 に「placeholder予定」)
- 影響: Android Chrome の installable 判定で 404、Lighthouse PWA スコアが落ちる。
- 修正: 暫定で 1x1 透過 PNG を W1 で配置するだけでもインストール可能になる。本物は後差し替え。

**M-2**: `apple-touch-icon` 未指定
- 場所: `apps/web/src/app/layout.tsx:15-18` icons.apple は `/icon-192.png` を指しているが Apple は 180×180 を期待
- 影響: iOS ホーム画面追加時に低解像度のスケーリング表示。
- 修正: `apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]`

**M-3**: `overscroll-behavior` 未設定
- 場所: `apps/web/src/app/globals.css` body / html に宣言なし
- 影響: モーダル開いてスクロールすると body も連動 (scroll chaining)、bottom action bar の上で過剰バウンス。
- 修正:
  ```css
  html, body { overscroll-behavior-y: none; }
  /* モーダル / sheet root には overscroll-behavior: contain; */
  ```

**M-4**: input に `autoComplete` / `inputMode` / `autoCapitalize` 指針なし
- 場所: `apps/web/src/components/ui/input.tsx` (汎用) と各フォーム実装
- 影響: メールフィールドで大文字化、電話番号で文字キーボード起動、パスワード自動入力ロス。
- 修正: ラッパーを増やすか、各フォーム呼び出し側で明示。最低限ドキュメント化。

**M-5**: `/mobile/scan` の Permissions-Policy 言及はコメントのみで実装なし
- 場所: `apps/web/src/app/mobile/scan/page.tsx:14`
- 影響: 本実装時に getUserMedia 起動できない。next.config.mjs / middleware の `Permissions-Policy: camera=(self)` を W1 段階で仕込んでおくと後の手戻りなし。

**M-6**: handedness CSS の inline-start/end padding 値が左右で同値
- 場所: `apps/web/src/app/globals.css:34-35, 99-101` `--bottom-action-bar-padding-inline-start/end` が左右どちらでも `1rem`
- 影響: 利き手切替が意味を持たない (justify-content だけが反転)。設計書の意図と整合性が薄い。
- 修正: 利き手側は 1rem、反対側は 1.5rem 等の差をつける、または安全領域を考慮した非対称値に。

**M-7**: tailwind に xs (≤375px) breakpoint 未定義
- 場所: `apps/web/tailwind.config.ts:10-16`
- 影響: iPhone SE (375px) と iPhone 15 Pro Max (430px) が同じ「sm 未満」バケット → fine-tune 不能。
- 修正: `screens: { xs: '375px', sm: '640px', ... }` を extend に追加。

### Minor (-1)

**Mn-1**: サインアウトボタンが SubmitButton ではない
- 場所: `apps/web/src/components/layout/app-shell.tsx:60-66`
- 影響: 連打で重複 POST リスク、pending 表示なし。
- 修正: `<SubmitButton variant="outline" size="sm" pendingLabel="サインアウト中…">`。

**Mn-2**: Bottom action bar が `pb-[max(0.5rem, env(...))]` で 0.5rem 固定下限
- 場所: `app-shell.tsx:91`
- 影響: home indicator のあるホーム機種でアクションが home bar と接近して誤タップ。
- 修正: `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`。

**Mn-3**: `<a>` skip-link は良いが、bottom-nav 利用時に skip target が main のみ
- 場所: `apps/web/src/app/layout.tsx:42-44`
- 影響: モバイルで bottom nav にもキーボード移動できる skip-link があると親切 (a11y 視点)。
- 修正: 「メインコンテンツへ」「ナビゲーションへ」2 本立て。

**Mn-4**: viewport の `userScalable` 未指定
- 場所: `apps/web/src/app/layout.tsx:27-35`
- 影響: a11y 視点ではユーザズームを禁止しない方針が望ましい。Next.js の `Viewport` 型でデフォルト許容なので OK だが、設計意図として明示すると安全。
- 修正: `userScalable: true, maximumScale: 5,` を viewport に追記。

**Mn-5**: theme-color が html 全体スコープ、PWA installed 時のみ動作。マルチカラム UI の app-region 切替なし
- 場所: `apps/web/src/app/layout.tsx:31-34`
- 影響: PWA standalone 時のステータスバー色は OK、ブラウザタブ表示時は機種依存。許容範囲。

**Mn-6**: Sheet のスワイプダウン閉じが未実装
- 場所: `apps/web/src/components/ui/sheet.tsx`
- 影響: モバイルで drawer を下スワイプで閉じる慣習に未対応 (Radix デフォルト)。Phase1 W3 で vaul 等の検討余地。

---

## 100点に近づける Top 5

### 1. Bottom Tab Navigation を AppShell に常設 (C-1, H-4 同時解消, +14点)

新コンポーネント `apps/web/src/components/layout/mobile-bottom-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, ScanLine, Search, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard',          label: 'ホーム',     Icon: LayoutDashboard },
  { href: '/meetings',           label: '商談',       Icon: Calendar },
  { href: '/mobile/scan',        label: '名刺',       Icon: ScanLine, primary: true },
  { href: '/mobile/quick-lookup',label: '検索',       Icon: Search },
  { href: '/settings',           label: 'メニュー',   Icon: Menu },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="モバイル主要ナビゲーション"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5
                 border-t border-border bg-background/95 backdrop-blur
                 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1
                 px-[max(0.25rem,env(safe-area-inset-left))]"
      style={{ paddingRight: 'max(0.25rem, env(safe-area-inset-right))' }}
    >
      {TABS.map(({ href, label, Icon, primary }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href as never}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              'min-h-[44px] min-w-[44px] rounded-md',
              'text-[11px] font-medium',
              'active:bg-accent/60',
              active ? 'text-foreground' : 'text-muted-foreground',
              primary && 'relative -mt-3 mx-1 rounded-full bg-primary text-primary-foreground shadow-md',
            )}
          >
            <Icon aria-hidden className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

`AppShell` に `<MobileBottomNav />` を `bottomActionBar` slot とは独立に常設し、`<main>` の `pb-24 md:pb-8` を `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` に拡張。

### 2. Input/Button タッチターゲットと iOS ズーム防止 (C-2, H-1 同時解消, +9点)

`apps/web/src/components/ui/input.tsx`:
```tsx
'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2',
'text-base md:text-sm',  // ← iOS ズーム防止 (16px → md 以上で 14px)
'ring-offset-background placeholder:text-muted-foreground',
```

`apps/web/src/components/ui/button.tsx`:
```tsx
size: {
  default: 'h-11 px-4 py-2 text-base md:text-sm',
  sm:      'h-10 rounded-md px-3 text-sm',
  lg:      'h-12 rounded-md px-8 text-base',
  icon:    'h-11 w-11',
},
```

`HeaderNav` のリンクも `min-h-[44px] inline-flex items-center` に。

### 3. safe-area を CSS 変数で全方位化 + sticky header の top inset (H-2, +6点)

`apps/web/src/app/globals.css`:
```css
@layer base {
  :root {
    --safe-top:    env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left:   env(safe-area-inset-left, 0px);
    --safe-right:  env(safe-area-inset-right, 0px);
  }

  html, body {
    overscroll-behavior-y: none;
  }

  body {
    padding-left: var(--safe-left);
    padding-right: var(--safe-right);
  }
}
```

`app-shell.tsx`:
```tsx
<header className="sticky top-0 z-40 ... pt-[env(safe-area-inset-top)]">
  <div className="container flex h-14 ...">
```

### 4. Service Worker offline fallback を W1 段階で配線 (H-3, +5点)

`apps/web/public/sw.js`:
```js
const CACHE = 'ksp-shell-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// navigation requests のみ /offline にフォールバック (API は触らない)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  );
});
```

`/offline` を確実にキャッシュ可能にするため `next.config.mjs` で headers と /offline を `force-static` 化。

### 5. PWA manifest の installable 完成度を W1 で +α (M-1, M-2, +4点)

`apps/web/src/app/manifest.ts`:
```ts
return {
  // ... 既存 ...
  display_override: ['standalone', 'minimal-ui'],
  shortcuts: [
    { name: '名刺スキャン',     short_name: '名刺',   url: '/mobile/scan',
      icons: [{ src: '/shortcut-scan.png', sizes: '96x96' }] },
    { name: 'クイック検索',     short_name: '検索',   url: '/mobile/quick-lookup',
      icons: [{ src: '/shortcut-search.png', sizes: '96x96' }] },
    { name: 'オフラインキュー', short_name: 'キュー', url: '/mobile/queue',
      icons: [{ src: '/shortcut-queue.png', sizes: '96x96' }] },
  ],
};
```

`layout.tsx` icons:
```ts
icons: {
  icon: [
    { url: '/favicon.ico' },
    { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  ],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  other: [{ rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '#0b1220' }],
},
```

W1 段階では実体 PNG は 1x1 透過プレースホルダーで OK (ファイル存在チェックを通すだけ)、デザイン確定後差し替え。

---

### 期待される改善後スコア
- Critical 2 件解消 (C-1, C-2): +16
- High 4 件解消 (H-1〜H-4): +20
- Medium 7 件解消: +14
- Minor 6 件解消: +6
- 合計: 64 → 98 程度まで到達可能 (パフォーマンス実測などは Phase1 W3 以降)

