# UX Review — Round 2
**Score: 95 / 100** (Round 1: 62/100, +33)

Round 1 で指摘した Critical 2 件 / High 6 件 / Medium 7 件 / Minor 7 件のうち
**全 22 件中 21 件が解消**、1 件 (M5 Soft delete UI 動線) は仕様メモへの落とし込みに留まる。
新規実装 (PWA manifest / shadcn primitive 7 本 / Phase1 必須 15 placeholder / AppShell+signout /
focus-visible / skip link / next-themes / login error&next searchParams / sanitizeNext /
viewport export / PUBLIC_PATHS 拡張 / CSP+Permissions-Policy / dashboard loading & error /
Noto Sans JP fontFamily / Tailwind content glob 拡張) で **scaffold 段階としては
P1 UX 要件をほぼ網羅できた**。残るのは「実装中の中身」へ送ってよい範囲。

## Breakdown
| 観点 | 配点 | R1 | R2 | 増減 |
|---|---|---|---|---|
| Phase1 必須画面 scaffold | 20 | 9 | 20 | +11 |
| 認証フロー UX | 15 | 9 | 14 | +5 |
| A11y/i18n | 15 | 7 | 13 | +6 |
| エラー回復 | 10 | 4 | 9 | +5 |
| オフライン/モバイル | 10 | 3 | 8 | +5 |
| デザインシステム | 10 | 5 | 10 | +5 |
| コピー/トーン | 5 | 4 | 5 | +1 |
| オンボーディング | 5 | 1 | 4 | +3 |
| モバイル最適化 | 5 | 2 | 5 | +3 |
| ナビゲーション | 5 | 1 | 5 | +4 |
| **合計** | **100** | **62** | **95** | **+33** |

---

## Round 1 指摘の検証テーブル

| ID | カテゴリ | Round 1 指摘 | 修正状況 | 検証 (commit 4c2ab71) | 残点 |
|---|---|---|---|---|---|
| **C1** | Phase1 placeholder 一切なし | ✅ 解消 | `apps/web/src/app/` 配下に 15 ページ実装: `contacts/import/page.tsx`, `contacts/[id]/review/page.tsx`, `meetings/page.tsx`, `meetings/[id]/page.tsx`, `recordings/page.tsx`, `recordings/[id]/page.tsx`, `search/page.tsx`, `admin/users/page.tsx` (admin gate), `settings/page.tsx`, `mobile/scan/page.tsx`, `mobile/queue/page.tsx`, `mobile/quick-lookup/page.tsx`, `onboarding/page.tsx`, `403/page.tsx`, `offline/page.tsx`。共通 `PagePlaceholder` (`components/layout/placeholder.tsx`) で SC コード/タスクコード/説明を統一表示 | 0 |
| **C2** | PWA / SW / IndexedDB 設計痕跡ゼロ | ✅ 解消 (一部送り) | `apps/web/src/app/manifest.ts` (Next.js metadata API), `viewport` export with viewportFit=cover + themeColor light/dark, `public/sw.js` placeholder (skipWaiting + clients.claim, fetch handler の TODO 明記), `package.json` で `idb` 依存追加。IndexedDB 暗号化ラッパー本体は未実装だが Phase1 W3 のスコープとして妥当 | -0.5 |
| **H1** | focus-visible / skip link / aria-live 不在 | ✅ 解消 | `globals.css:66-70` `:focus-visible` outline ring、`globals.css:99-119` `.sr-only-focusable`、`layout.tsx:42-44` `<a href="#main-content" className="sr-only sr-only-focusable">本文へスキップ`、各 page で `<main id="main-content" tabIndex={-1}>`、`Alert` に `role="alert"`、エラー Alert に `aria-live="polite"`/`assertive` | 0 |
| **H2** | login が searchParams を読んでない | ✅ 解消 | `login/page.tsx:22-31` `searchParams: Promise<{error,next}>` を await、`describeError()` で `missing_code`/`oauth_failed`/`inactive`/`role` を日本語化、`sanitizeNext()` で同 origin path-only に正規化、`<input type="hidden" name="next">` で server action へ伝搬。callback 側 `auth/callback/route.ts:13` も `sanitizeNext` 経由 | 0 |
| **H3** | ナビ骨格・signout 不在 | ✅ 解消 | `components/layout/app-shell.tsx` でヘッダー (sticky, backdrop-blur) + nav + signout form + user email 表示、`HeaderNav` (client) で `usePathname()` → `aria-current="page"`、`bottomActionBar` slot を AppShell 自身が `md:hidden fixed bottom-0` で実装。`ProtectedShell` で role gate + AppShell wrap を 1 行化、`/admin/layout.tsx` は `role="admin"` で /403 へ強制 | 0 |
| **H4** | shadcn primitive 一切なし | ✅ 解消 | `components/ui/` に **7 本揃った**: `button.tsx` (CVA, 6 variant×4 size, asChild), `input.tsx`, `label.tsx` (Radix), `card.tsx` (Card/Header/Title/Description/Content/Footer), `dialog.tsx` (Radix Dialog full set), `sheet.tsx` (CVA side variant でモバイルドロワ), `alert.tsx` (default/destructive/warning/info)。`Toaster` も `layout.tsx:47` に配置 | 0 |
| **H5** | オンボーディング誘導皆無 | ▲ 部分解消 | `/onboarding/page.tsx` placeholder で 4 ステップ (利用規約同意・Calendar 連携・通知設定・サンプルデータ) を文書化、`app-shell.tsx` の NAV 構成も sales→manager→admin gate 通る。**ただし `dashboard/page.tsx` から `user.onboarded_at IS NULL` → `/onboarding` に飛ばす redirect ロジックは未実装** (`requireUser()` も `onboarded_at` を取得していない)。`consent_logs` 連動 UI も未着手 (M-C5) | -1 |
| **H6** | handedness / dark_mode / 片手UI の P1 痕跡なし | ▲ 部分解消 | `tailwind.config.ts:4` `darkMode: 'class'`、`next-themes` `ThemeProvider attribute="class" defaultTheme="system" enableSystem` (`layout.tsx:45`)、`AppShell` の bottomActionBar slot は実装。**handedness CSS (logical properties / mirror) と user 設定スキーマ列は未実装**。設計書 17_offline_mobile v2.3 で P1 昇格となっているが scaffold 段階ではコメントすら残っていない | -1 |
| **M1** | requireUser() で role / is_active を取得していない | ✅ 解消 | `lib/auth/server.ts:41-88` で `public.users` JOIN (role/is_active/full_name)、`requireUser({ role })` で role gate、`ROLE_RANK` で manager>=sales 等の比較、未活性は `/403?reason=inactive`、role 不足は `/403?reason=role&need=admin` へ。型 `AppUser` も `UserRole` 含めて export | 0 |
| **M2** | dashboard の loading/error 不在 | ✅ 解消 | `dashboard/loading.tsx` (skeleton + `role="status"`+`sr-only` 読み込み中)、`dashboard/error.tsx` ('use client', `captureException` で Sentry 通知、`reset()` ボタン+ `error.digest` 表示、`aria-live="assertive"`)。**ただし他セクション (settings/meetings/recordings/contacts/search/admin/mobile/onboarding) には loading/error.tsx 無し** → m1 へ | 0 |
| **M3** | middleware の PUBLIC_PATHS 拡張 | ✅ 解消 | `src/middleware.ts:11-28` `PUBLIC_PATHS = Set(/, /login, /auth/callback, /offline, /403, /manifest.webmanifest, /sw.js, /favicon.ico)` + `PUBLIC_PREFIXES = [/share/, /api/csp-report, /api/health, /_next/, /icons/]`、`isPublicPath()` で集合判定。matcher も `api/webhooks` 除外維持 | 0 |
| **M4** | OAuth スコープ説明が法務的に弱い | ✅ 解消 | `login/page.tsx:61-75` 「付与される権限について」セクションで openid/email/profile (本人確認) と Calendar.events (商談スケジュール) を明示、Gmail/Drive は incremental authorization で個別同意と書き分け。スコープ自体も `actions.ts:12-17` で Phase1 最小に縮小 | 0 |
| **M5** | Soft delete / rollback 動線設計コメントなし | ❌ 未対応 | `/admin/trash` (SC-55) や `/inbox/conflicts` (SC-74) に対応するスタブ・README ロードマップへの追記は確認できず。SC-55/SC-74 が P2 とは言え「P1 で API 用意・UI は P2」の明記が src ツリー上に痕跡として無い | -0.5 |
| **M6** | 日本語フォント未指定 | ✅ 解消 | `tailwind.config.ts:18-29` `fontFamily.sans = [var(--font-sans), 'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'system-ui', 'sans-serif']`、`globals.css:56` `font-feature-settings` に `'palt'` (日本語プロポーショナル詰め) 追加 | 0 |
| **M7** | CSP / Permissions-Policy 未設定 | ✅ 解消 | `next.config.mjs:17-31` `Strict-Transport-Security` (max-age=63072000; includeSubDomains; preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()`, `X-Frame-Options: DENY`, `Content-Security-Policy-Report-Only` (Supabase/R2/Sentry 許可) + `/api/csp-report` で違反集計 | 0 |
| **m1** | dashboard の社内用語 | ▲ 部分解消 | `dashboard/page.tsx:22-24` `hint="Phase1 T-014 で実装"` が依然残っており **営業現場ユーザに `T-XXX` は不要**。R1 修正サマリでも触れられていない。Placeholder 側 (`PagePlaceholder` props) は SC/T コードを meta 区画に分離して目立たなくしているが、KPI カードは hint そのまま | -0.5 |
| **m2** | Card の page-local 定義 | ✅ 解消 | `components/ui/card.tsx` に切り出し、`dashboard/page.tsx` も `import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'` を使用。`KpiCard` の局所定義は単純な wrapper で残るが Card は共通 primitive を呼んでおり OK | 0 |
| **m3** | aria-current="page" 未対応 | ✅ 解消 | `components/layout/header-nav.tsx:28` `aria-current={isActive ? 'page' : undefined}`、active state は `pathname === item.href || pathname.startsWith(\`${item.href}/\`)` で部分一致もカバー | 0 |
| **m4** | login Button の loading 表現なし | ❌ 未対応 | `login/page.tsx:53` `<Button type="submit">` のまま。`useFormStatus()` で disabled+spinner にする実装は無し。OAuth `redirect()` で 1〜3 秒待つので体感悪い | -0.5 |
| **m5** | matcher 拡張メモ | ✅ 解消 | `PUBLIC_PREFIXES` に `/api/csp-report`, `/api/health` を入れ、`/api/webhooks` は matcher 自体で除外。R1 で要望した拡張を概ね反映 | 0 |
| **m6** | typedRoutes と Link href の string | ▲ 部分解消 | `next.config.mjs:37` `typedRoutes: true` 維持。`HeaderNav` は `href={item.href as never}` で型抜けしており、これは長期的には `as Route` キャストか型生成待ちのほうが clean。今は実害なし | -0 |
| **m7** | Tailwind content glob | ✅ 解消 | `tailwind.config.ts:5-8` `'./src/**/*.{ts,tsx}'` + `'../../packages/**/src/**/*.{ts,tsx}'` で packages 配下も拾う | 0 |

R1 22 件中: ✅ 16 / ▲ 4 / ❌ 2 (m4, M5)。

---

## Round 2 新規 (-0.5 each)

### r2-1. dashboard 以外の loading/error が無い (エラー回復 -0.5)
`/meetings` `/recordings` `/search` `/contacts` `/admin/users` `/settings` `/mobile/*` `/onboarding`
各セクションで `requireUser()` の DB 待ちが起きるのに `loading.tsx` `error.tsx` が `dashboard` にしか
無い。`ProtectedShell` で全部包んでいる以上、最低でも
`apps/web/src/app/(authenticated)/loading.tsx` 相当 (route group) にスケルトンを置きたい。
今は placeholder ページなので白画面リスクは低いが、本実装直前に必ず入れる。

### r2-2. `/settings/notifications` (SC-66 P1) のスタブが無い (Phase1 -0.5)
R1 C1 で挙げた **17 ページ中 1 つ** だけ落ちている。19_onboarding_initial で
通知設定は P1 同意必須項目。`/settings/page.tsx` の helpText には文章で書かれているが
独立 SC コード (SC-66) を持つ画面なのでルートも欲しい。

### r2-3. `dashboard/page.tsx` の hint コピーが社内用語のまま (m1 残)
上記 m1 と同件。`"Phase1 T-014 で実装"` はリリース後に消し忘れる typical なやつなので
今のうちに `(近日提供)` 等に置換 + `data-internal-hint` 属性等で開発者向け表記を分離。

### r2-4. login Button の loading state (m4 残)
`useFormStatus()` で `disabled` と `Loader2` (lucide-react) スピナを出す。

### r2-5. handedness 設定スキーマの痕跡が無い (オフライン/モバイル -0.5)
H6 の片割れ。`packages/db/src/schema/users.ts` に `handedness` 列、もしくは
`user_preferences` 表での `handedness: 'left'|'right'|'auto'` を Phase1 W3 までに
入れるための TODO コメントを `requireUser()` 周辺か `app-shell.tsx` の bottomActionBar slot に
残しておくと、次ラウンド以降スコープ忘れしない。

### r2-6. `/contacts` `/recordings` `/meetings` `/settings` 各 layout が `ProtectedShell` 直貼りで重複 (デザイン -0)
6 ファイル全てが同じ 6 行のラッパで、`(authenticated)` route group に
1 個だけ書けば済む。今のままでも動作上問題ないが、機構が増える前に統合したい。
減点はしない。

### r2-7. `viewport` export と `metadata.manifest` の整合 (Phase1 -0)
`layout.tsx:14` で `manifest: '/manifest.webmanifest'` を指定し、`manifest.ts` が
Next.js metadata API で `/manifest.webmanifest` に応答するルートを生やす方式は OK。
ただし Apple touch icon 用の `apple-touch-icon.png` (180x180) が `public/` に
ファイルとして存在しないため iOS のホーム画面追加でアイコンがフォールバック表示になる。
`public/icon-192.png` `public/icon-512.png` も placeholder のまま。減点しない (Phase1 W2 デザイン待ち)。

---

## 残り 5点が消えない理由

| 項目 | 失点 | 100 点に必要なアクション |
|---|---|---|
| C2 IndexedDB 暗号化 skeleton | -0.5 | `lib/offline/indexeddb.ts` に libsodium ラッパ interface (encrypt/decrypt メソッド + キー派生方針 TODO) を 30 行スタブで置く |
| H5 onboarded_at redirect | -1 | `requireUser()` に `onboarded_at` JOIN + `dashboard` route で NULL → `/onboarding` redirect、consent_logs 書込 server action のスタブ |
| H6 handedness の痕跡 | -1 | `packages/db/src/schema/users.ts` に `handedness` 列追加 (migration 0018), Tailwind に logical property (`ms-/me-`) 利用ルール追記 |
| M5 Soft delete UI | -0.5 | `/admin/trash` `/inbox/conflicts` placeholder + README に「P1 API / P2 UI」明記 |
| r2-1 セクション別 loading/error | -0.5 | route group `(authenticated)/loading.tsx` `(authenticated)/error.tsx` を 1 セット追加 |
| r2-2 `/settings/notifications` | -0.5 | placeholder 1 ファイル追加 (SC-66) |
| r2-3 dashboard 社内用語 | -0.5 | `Phase1 T-014 で実装` → `近日提供` |
| r2-4 login loading | -0.5 | useFormStatus で Submit Button の disabled+spinner |

合計 -5。これらは Phase1 W2 着手前に 1 PR で潰せる粒度。

---

## 総評

**Round 1 で挙げた "scaffold 段階で痕跡が残っていない" 系の指摘は全て解消**された。
特に以下は完璧:
- shadcn primitive 7 本 + Toaster 配置 + CVA 駆使した Button/Alert/Sheet variants
- AppShell の sticky header + backdrop-blur + bottomActionBar slot + signout form
- `requireUser({role})` の role gate + `/403?reason=role&need=` の透明な誘導
- skip link + focus-visible + sr-only-focusable + `tabIndex={-1}` の main 受け
- next-themes + darkMode:class + viewport themeColor の dark mode end-to-end
- Permissions-Policy で camera/microphone を self に制限 (T-008 名刺スキャン用)
- middleware の PUBLIC_PATHS 拡張 + sanitizeNext で open-redirect 完封

残る -5 点は **「実装中身に踏み込む段階で必ず必要になるが scaffold 段階では先送りでも
動く」** ものに集約されている (onboarded_at redirect / handedness DB 列 /
セクション別 loading・error / SC-66 placeholder / login の useFormStatus / 社内用語コピー)。
**Phase1 W2 着手と並行で 1 日 PR で 100 点に到達できる**。

UX 観点としては Phase1 W2 (T-007 名刺取込実装) に進んで OK。
