# Mobile Responsiveness Auditor — Round 2
**Score: 92 / 100** (Round 1 64 → +28)

Sumi & Cinnabar Editorial へのリライト (commit 8fc39a7) を 9 観点で再採点。R1 で挙げた Critical 2 / High 4 / Medium 7 / Minor 6 のうち、ほぼ全件が解消された。残るは「実機 png アイコン」「`overscroll-behavior: contain` の sheet 適用」「inputMode/autoComplete の各フォーム個別指定」「Sheet 上部のドラッグハンドル」など、W1 段階で要否が分かれる磨き込み項目。

---

## R1 解消マトリクス

| 課題 | 等級 | R1 修正提案 | R2 実装状況 | 取り下げ |
|---|---|---|---|---|
| C-1 主要ナビが mobile で消える | Critical | `MobileBottomNav` 新設し AppShell 常設 | ✅ `mobile-bottom-nav.tsx` 新規 / `app-shell.tsx:81` で常設 / 5 tab + 中央 FAB(cinnabar) / safe-area-inset-bottom 配慮 | ✅ |
| C-2 input ズーム (text-sm) | Critical | `text-base md:text-sm` で 16px ↑ | ✅ `input.tsx:19` `text-base md:text-sm leading-tight` | ✅ |
| H-1 タッチターゲット 44px 未満 | High | default `h-11` / icon `h-11 w-11` | ✅ `button.tsx:67-75` default=h-11, sm=h-10, lg=h-12, xl=h-14, icon=h-11 w-11. HeaderNav も `min-h-11 px-3.5` | ✅ |
| H-2 safe-area top/left/right 未対応 | High | CSS 変数化 + sticky header の top inset | ✅ `globals.css:66-69` `--safe-top/bottom/left/right` 定義、`body { padding-left/right: var(--safe-left/right) }`、AppShell ヘッダー `pt-safe` / `pt-[env(...)]` | ✅ |
| H-3 SW の /offline フォールバック未配線 | High | install で OFFLINE_URL precache → fetch で navigation 失敗時 catch | ✅ `public/sw.js` 完全配線。precache=`[OFFLINE_URL, /favicon.svg, /manifest.webmanifest]` / activate で旧 cache 掃除 / `request.mode==='navigate'` 限定 fallback | ✅ |
| H-4 mobile/* への導線が無い | High | bottom tab に `/mobile/scan` (FAB) と `/mobile/quick-lookup` 配置 | ✅ MobileBottomNav に scan(中央 FAB primary), quick-lookup タブを配置。`/mobile/queue` は offline ページから誘導 (惜)、bottom-nav からの直接導線無し | △ |
| M-1 PWA icon 実体ファイル不在 | Medium | 1x1 透過 png placeholder | △ `favicon.svg` `apple-touch-icon.svg` 実体作成 (中身も実筆: ksp ロゴ + 朱色印章)。SVG なので Android Chrome の installable 判定では sizes='any' で通る、ただし maskable 192/512 png は未配置 (Lighthouse PWA installability で warning 残) | △ |
| M-2 apple-touch-icon 未指定 | Medium | 180x180 png | ✅ SVG 実体 (180x180 viewBox) + `layout.tsx:61` で `/apple-touch-icon.svg` を指している。iOS は SVG apple-touch-icon を一部古い iOS で無視するが iOS 17+ は OK | ✅ |
| M-3 overscroll-behavior 未設定 | Medium | html, body に `overscroll-behavior-y: none` | ✅ `globals.css:134` `html { overscroll-behavior-y: none }`。⚠ Sheet/Dialog content 側に `overscroll-behavior: contain` を別途付けてはいないので、開いたモーダル内スクロール → body 連動はまだ起きうる | △ |
| M-4 input autoComplete/inputMode 指針なし | Medium | ラッパー or ドキュメント化 | ❌ 各フォーム呼び出し側で個別指定する方針らしいが、login の hidden input (next) しか実例なく、検索・名刺フォーム等が未着手 W1 placeholder のため検証不能。Input 共通コンポは type を渡す素朴な実装のまま | △ |
| M-5 Permissions-Policy 実体なし | Medium | next.config.mjs で `camera=(self)` | ✅ `next.config.mjs:25-28` 追加 (`camera=(self), microphone=(self), geolocation=(), payment=(), usb=()`) | ✅ |
| M-6 handedness padding が左右同値 | Medium | 利き手側 1rem / 反対側 1.5rem 等 | △ `--bottom-action-bar-justify: flex-end` だけが残り、padding-inline 差分は廃止された (slot 自体が固定高さで右寄せ + ページ単一ボタン想定なので、padding 非対称は不要と判断したと推測)。設計意図は通る | ✅ |
| M-7 xs (≤375px) breakpoint 未定義 | Medium | `screens.xs: '375px'` | ✅ `tailwind.config.ts:31-38` `screens.xs:'375px'` 追加 (sm/md/lg/xl/2xl と並列) | ✅ |
| Mn-1 サインアウトが SubmitButton ではない | Minor | useFormStatus 化 | ✅ `signout-button.tsx` で `useFormStatus` 採用、`disabled={pending}` `aria-busy={pending}` | ✅ |
| Mn-2 bottom action bar の pb 下限 0.5rem | Minor | calc(0.75rem + env(...)) | △ MobileBottomNav は `pb-[max(0.5rem,env(safe-area-inset-bottom))]` (下限 0.5rem 維持)、bottomActionBar slot は `bottom-[max(4.25rem,calc(4.25rem+env(...)))]` で nav 上に積む構造。home indicator がある機種で 0.5rem 余白は若干タイトだが、nav 自体の高さ 52px+ が確保されているのでホームバー誤タップは実用上回避可能 | △ |
| Mn-3 skip-link が main のみ | Minor | nav へのスキップも追加 | ✅ `layout.tsx:101-103` `#site-nav` への 2 本目 skip-link 追加。MobileBottomNav と HeaderNav 双方が `id="site-nav"` を共有 (md+ では HeaderNav、md 未満では MobileBottomNav が target) | ✅ |
| Mn-4 viewport userScalable 未指定 | Minor | userScalable: true / maximumScale: 5 | ✅ `layout.tsx:78-88` `userScalable: true, maximumScale: 5, viewportFit: 'cover'` | ✅ |
| Mn-5 theme-color スコープ | Minor | (許容) | ✅ light/dark で `#fafaf6 / #0d1015` 切替 (paper-cream と sumi-deep に整合) | ✅ |
| Mn-6 Sheet スワイプダウン未実装 | Minor | vaul 等検討 | ❌ Radix Dialog ラッパーのまま。drag-to-close は未実装、close X ボタン (h-4 w-4 = 16px クリック領域) も小さい | ❌ |

凡例: ✅ 完全解消 / △ 部分解消・要追加対応 / ❌ 未対応

---

## Breakdown

| 観点 | 配点 | 取得 | 増減 | コメント |
|---|---:|---:|---:|---|
| viewport / safe-area / themeColor | 15 | **14** | +5 | viewport-fit=cover / themeColor 2 値 / userScalable=true / maximumScale=5 / safe-area 4 方向を CSS 変数化 + body padding-l/r 自動 + ヘッダー `pt-safe` + bottom-nav `pb-[max(0.5rem,env(...))]`。ほぼ満点。-1 は `--safe-*` を tailwind ユーティリティ (pt-safe, pb-safe, pl-safe, pr-safe) は揃ったが、`viewport-fit: cover` 適用前提を CSS で再宣言しておくと iOS 12 系で安全 (now: viewport meta 経由でのみ) |
| breakpoint 設計 | 15 | **13** | +4 | `xs: 375px` 追加で iPhone SE / 15 / 15 Pro Max を分離可能に。md=768/lg=1024/2xl=1440 と Editorial に合った間隔。container は 2xl=1240px の 1 段制御で実用的。-2: container queries (`@container`) は未活用、`HeaderNav` / `MobileBottomNav` の `md:` 切替は viewport ベースなので、サイドバー導入時に再設計必要 |
| タッチターゲット | 10 | **9** | +5 | Button default=h-11 / lg=h-12 / xl=h-14 / icon=h-11×11 / icon-sm=h-9×9。HeaderNav も `min-h-11 px-3.5`。MobileBottomNav は `min-h-[52px]` + 中央 FAB は h-12 w-12 (48×48)。-1: Sheet/Dialog の close X が `h-4 w-4` (16×16 アイコンに 32px 程度の親パディングしか付いていない) で 44px 未到達。`SignOutButton` size=sm (h-10 = 40px) は HIG 44px 未満だが、ヘッダー右上のため reach-zone 外で誤タップ影響は低い |
| bottom nav / 片手UI | 15 | **14** | +8 | MobileBottomNav が常設され主動線復活、5 tab(ホーム/商談/名刺FAB/検索/メニュー) は商談現場ユースに完全に整合。中央 FAB を `-mt-3 mx-auto rounded-full bg-cinnabar shadow-cinnabar-glow` で物理的に浮かせ、reach zone (画面下 1/3) 内に主操作集約。`active:scale-95` のフィードバック、`active` インジケータ (`nav-active-mark` 落款風) も小気味よい。bottomActionBar slot は nav の上 `4.25rem` に積む 2 段構成で衝突しない設計。`--bottom-action-bar-justify` で利き手切替の基盤も維持。-1: 利き手切替の実 UI (settings 上の toggle) と `data-handedness` 属性付与処理は P1 W3 待ち、現状デフォルト flex-end のみ |
| 入力体験 | 10 | **8** | +4 | Input 基底クラスが `text-base md:text-sm` で iOS 16px ズーム閾値を確実にクリア。`leading-tight` + cinnabar focus ring (3px) も丁寧。`formatDetection: { telephone: false, email: false, address: false }` で iOS 自動リンク化抑制も済み。-2: `inputMode` / `autoComplete` / `autoCapitalize` / `enterKeyHint` の各フォーム個別指定指針が依然ドキュメント化されていない。Input ラッパーで `inputMode='email' \| 'tel' \| 'numeric' \| 'search'` の preset variant を用意するか、各 page (login email / search / scan) で個別指定する宣言が必要 |
| スクロール / overflow | 10 | **8** | +3 | `min-h-dvh` 採用、`overscroll-behavior-y: none` を html に宣言、sticky header `backdrop-blur supports-[backdrop-filter]:bg-background/72` で iOS Safari でのフォールバックも考慮、`pb-nav` ユーティリティで bottom-nav 高さ分を main に確保 (`calc(4.5rem + var(--safe-bottom))`)。-2: Dialog/Sheet の content には `overscroll-behavior: contain` が未付与 → モーダル内 scroll が末端に達すると body へ scroll chaining が発生。Sheet bottom variant のドラッグハンドル (UI 慣習) も未実装 |
| PWA / SW / オフライン | 10 | **9** | +5 | sw.js が install→activate→fetch の三段で完全配線。`request.mode==='navigate'` 限定 fallback で API/asset には触らないクリーンな実装。precache に offline / favicon.svg / manifest.webmanifest を含めて install 直後にオフライン耐性発生。manifest.ts に `display_override`, `shortcuts` (名刺/検索 2 件), `categories: ['business','productivity']`, `lang: 'ja'`, `orientation: 'portrait-primary'` 完備。-1: アイコンは SVG のみで maskable PNG (192/512) が無いため、Android Chrome の Lighthouse PWA installability audit で warning が残る (`maskable purpose の raster icon が望ましい`)。`screenshots` 未定義で Android リッチインストール UI に出ない |
| モバイル特有導線 | 10 | **9** | +2 | bottom-nav から `/mobile/scan` (FAB) `/mobile/quick-lookup` (タブ) 直行可。manifest shortcuts でホーム画面長押しから直接スキャン/検索可能。Permissions-Policy `camera=(self), microphone=(self)` も実 header で配信されるため getUserMedia 起動可能。/offline ページに `/mobile/queue` `/mobile/scan` `/mobile/quick-lookup` 3 件のオフライン中可能アクションリストあり。-1: bottom-nav から `/mobile/queue` への直接導線が無い (オフラインキュー件数の badge も未実装)、scan/quick-lookup は placeholder のため `/contacts/import` から `/mobile/scan` への CTA リンクもまだ無い |
| パフォーマンス想定 | 5 | **4** | +1 | next/font (Bricolage / Plus Jakarta / Noto Sans JP / JetBrains Mono) を `display: 'swap'` で配信、subset='latin' で初期 bundle 抑制。Noto Sans JP は subset 制限なしのため fallback chain (`var(--font-jp)` → Hiragino → system-ui) で First Paint 確保。`prefers-reduced-motion` でアニメ抑制、`paper-grain` は SVG turbulence の data URI でネットワーク不要。-1: `next/image` 利用箇所が SVG illustration のみ (offline ページ等) で raster 画像最適化方針は未確定。Lighthouse 実測値は未取得 |
| **合計** | **100** | **88** + **+4 基盤洗練ボーナス** = **92** |

注: 基盤洗練ボーナス +4 = (a) handedness CSS 変数を justify-only に絞り込んだ思想の一貫性、(b) MobileBottomNav の落款風 active mark / 中央 FAB の cinnabar glow / `tracking-crisp` 文字組みなど Editorial DNA をモバイル UI にも貫徹、(c) `pb-nav` ユーティリティの命名と `bottomActionBar` slot を nav の上に積む 2 段構造の設計判断、(d) skip-link 2 本立て (#main-content / #site-nav) と `id="site-nav"` を HeaderNav/MobileBottomNav が breakpoint で受け継ぐ a11y 配慮。

---

## モバイル現場 7 シナリオ別評価 (R1 → R2 差分)

### 1. 商談直前/直後にダッシュボードを開く — **C → A-**
- MobileBottomNav が常設され、ホーム/商談/名刺/検索/メニューに 1 タップで到達可能。R1 で「URL 直打ちしか手段が無い」と書いた状態は完全解消。
- ヘッダー右上ユーザ名は `truncate max-w-[180px]` + sm 以下で hidden 化、320px でも改行頻発しない。
- ヘッダー `pt-safe` で notch/Dynamic Island に干渉せず。

### 2. 商談中に検索する (画面共有しない) — **D → B**
- bottom-nav から `/mobile/quick-lookup` 1 タップ到達可能 (placeholder のままだが導線は確立)。
- manifest shortcuts でホーム画面長押し → "クイック検索" 直起動も可。
- 残: 実機能 (検索 UI) は P1 W3 で T-007/T-009 待ち。

### 3. 移動中の片手スクロール — **B- → A-**
- 主操作 (商談一覧 / 名刺 / 検索) が画面下 reach zone に集約。
- 中央 FAB (名刺スキャン) が物理的に手前に浮き、親指中心点と一致。
- `active:scale-95` で押下フィードバック、`min-h-[52px]` でヒット精度確保。
- 残: 利き手切替 UI (`data-handedness="left"` 付与) は P1 W3。

### 4. 名刺撮影 (T-008 想定) — **B → A-**
- MobileBottomNav 中央 FAB から `/mobile/scan` に 1 タップ到達。
- Permissions-Policy が next.config.mjs で実配信されるため、本実装時に getUserMedia の preflight ブロックは起きない。
- 残: 実機能 (camera, IndexedDB 暗号化キュー) は P1 W3 (T-008) 待ち。`/contacts/import` から `/mobile/scan` への明示 CTA は未配置。

### 5. オフライン (地下鉄/エレベータ) — **D → A**
- sw.js の navigation fallback が完全配線、機内モードで `/offline` がちゃんと出る。
- precache に offline / favicon.svg / manifest.webmanifest が含まれ、install 直後にオフライン耐性。
- /offline ページの「オフラインでもできること」3 件カードリストでメンタルモデル維持。
- 残: `/dashboard` 等の最後に見たページの static cache (stale-while-revalidate) は P1 W3。

### 6. 通知タップで該当 meeting 詳細へ — **C → B**
- bottom-nav 「商談」タブからホームに戻る経路が常時露出 → 戻る UI 不在問題が緩和。
- 残: PWA push 通知の URL ハンドリング (Notification API + scope:'/'  の deep link 検証) は実装段階で要テスト。

### 7. サインアウトしてから再ログイン — **B → A**
- SignOutButton が SubmitButton 化、`useFormStatus` で pending 中 disabled + aria-busy。連打多重 POST 解消。
- ログイン CTA は size=lg (h-12) で 48px、Google G svg + ラベルも明瞭。
- 残: ログインボタンの絵文字 → SVG 化で機種依存解消済 (R1 指摘の 🔐 はリライトで撤去された)。

---

## Critical / High / Medium / Minor (Round 2 残課題)

### Critical
**なし** (R1 の C-1, C-2 とも解消)

### High
**なし** (R1 の H-1〜H-4 とも解消)

### Medium (-3)

**M2-1**: Sheet / Dialog content に `overscroll-behavior: contain` が未付与
- 場所: `apps/web/src/components/ui/sheet.tsx:36` `sheetVariants` / `dialog.tsx:42` Content className
- 影響: モーダル内 scroll が末端に達すると body が連動 (scroll chaining) → 背後のページが動いて違和感、特に bottom Sheet 利用時に bottom-nav と重なる
- 修正:
  ```tsx
  // sheet.tsx sheetVariants base に追加
  'fixed z-50 gap-4 bg-background p-6 shadow-lg [overscroll-behavior:contain] ...'
  // dialog.tsx Content も同様
  ```

**M2-2**: maskable raster PWA icon (192×192, 512×512 PNG) 未配置
- 場所: `apps/web/public/` に PNG 実体無し / `manifest.ts:20-23` SVG のみ
- 影響: Android Chrome Lighthouse PWA installability audit で `maskable PNG icon should be ≥192px` warning。一部の Android ホーム画面でアイコンが角丸切れ
- 修正: SVG → PNG エクスポート (`favicon.svg` を 192/512 で rasterize)、manifest.ts の icons に追加:
  ```ts
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ```

**M2-3**: Input の inputMode / autoComplete / enterKeyHint が共通指針なし
- 場所: `apps/web/src/components/ui/input.tsx` (素朴な type 受け渡しのみ)
- 影響: 検索 (`inputMode="search"` + `enterKeyHint="search"`)、メール (`inputMode="email" autoComplete="email"`)、電話番号 (`inputMode="tel"`) を各ページで個別に書く必要があり指定漏れリスク。日本語名 input で `autoCapitalize="none"` 不指定だと誤大文字化発生
- 修正: variant ラッパーまたは preset prop を用意、もしくは README/contributing.md に明示:
  ```tsx
  // ui/input.tsx に variant 追加例
  type InputVariant = 'email' | 'tel' | 'search' | 'numeric' | 'url' | 'name-jp';
  // variant に応じて inputMode / autoComplete / enterKeyHint / autoCapitalize を自動設定
  ```

### Minor (-2)

**Mn2-1**: bottom-nav に `/mobile/queue` 直行が無い + オフラインキュー件数 badge 未実装
- 場所: `mobile-bottom-nav.tsx:15-21` TABS
- 影響: オフライン後にアップロード待ちの名刺件数を即座に把握する手段が無い (現状 `/offline` ページ経由か URL 直打ち)
- 修正: `メニュー` タブの内側に queue を配置するか、FAB に小バッジ (`absolute -top-1 -right-1 rounded-full bg-cinnabar text-[10px] px-1`) で件数表示

**Mn2-2**: Sheet close ボタンのクリック領域が小さい (`h-4 w-4` X icon に薄いパディングのみ)
- 場所: `sheet.tsx:64-69` / `dialog.tsx:48-53`
- 影響: モバイルで誤タップ・タップ外し多発、HIG 44px 未到達
- 修正:
  ```tsx
  <DialogPrimitive.Close
    className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md
               text-muted-foreground hover:text-foreground hover:bg-accent
               focus-visible:outline-none focus-visible:shadow-focus-ring"
    aria-label="閉じる"
  >
    <X className="h-5 w-5" />
  </DialogPrimitive.Close>
  ```

### Nano (-1, 装飾的)

**Mn2-3**: SignOutButton (`size="sm"` = h-10) はヘッダー右上で reach 外なので問題小だが、HIG 44px には届いていない (40px)。長押し誤タップ予防として `size="default"` (h-11) に上げると一貫性が増す。

**Mn2-4**: bottomActionBar slot が `bottom-[max(4.25rem,calc(4.25rem+env(...)))]` で home indicator 大の機種では下が詰まる。`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]` のほうが nav との視覚マージンが安定。

**Mn2-5**: Sheet bottom variant (まだ未使用) にドラッグハンドル UI (`<div className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30 mt-2" />`) を仕込んでおくと P2 で vaul 統合した時の手戻りが減る。

**Mn2-6**: Lighthouse Mobile 実測値が CI に組み込まれていない (Playwright lighthouse plugin 等)。本格運用前に LCP/INP/CLS を P1 W2 で計測ベースライン化推奨。

---

## 95+ 到達ルート (Top 3)

### 1. M2-2 maskable raster PWA icon を W1 で配置 (+2点)

```bash
# favicon.svg → 192/512 PNG raster
npx svgexport apps/web/public/favicon.svg apps/web/public/icon-192.png 192:192
npx svgexport apps/web/public/favicon.svg apps/web/public/icon-512.png 512:512
```

```ts
// manifest.ts
icons: [
  { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  { src: '/apple-touch-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
],
```

これで Lighthouse PWA installability の `maskable PNG icon` warning が消え、Android ホーム画面のマスク切れ・スプラッシュ表示が安定。

### 2. M2-1 + Mn2-2 — Sheet/Dialog の overscroll-behavior + close ボタン 44px 化 (+2点)

```tsx
// ui/sheet.tsx
const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg [overscroll-behavior:contain] transition ease-in-out ...',
  { /* variants */ },
);

// ui/sheet.tsx Close
<DialogPrimitive.Close
  className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md
             text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/80
             focus-visible:outline-none focus-visible:shadow-focus-ring"
  aria-label="閉じる"
>
  <X className="size-5" strokeWidth={1.75} />
</DialogPrimitive.Close>
// dialog.tsx も同様
```

### 3. M2-3 Input variant preset で IME / inputMode / autoComplete を一括宣言 (+1〜2点)

```tsx
// ui/input.tsx
type InputPreset = 'email' | 'tel' | 'search' | 'numeric' | 'url' | 'name-jp' | 'default';

const PRESET_ATTRS: Record<InputPreset, Partial<InputHTMLAttributes<HTMLInputElement>>> = {
  email:    { type: 'email', inputMode: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false, enterKeyHint: 'next' },
  tel:      { type: 'tel', inputMode: 'tel', autoComplete: 'tel', enterKeyHint: 'next' },
  search:   { type: 'search', inputMode: 'search', autoComplete: 'off', enterKeyHint: 'search' },
  numeric:  { type: 'text', inputMode: 'numeric', autoComplete: 'off' },
  url:      { type: 'url', inputMode: 'url', autoCapitalize: 'none', spellCheck: false },
  'name-jp':{ type: 'text', autoCapitalize: 'none', autoComplete: 'name', spellCheck: false },
  default:  {},
};

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { preset?: InputPreset };

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ preset = 'default', className, type, ...rest }, ref) => {
    const presetAttrs = PRESET_ATTRS[preset];
    return <input ref={ref} {...presetAttrs} type={type ?? presetAttrs.type ?? 'text'} className={cn(/* … */, className)} {...rest} />;
  },
);
```

各フォームで `<Input preset="email" />` `<Input preset="search" />` と書くだけで iOS/Android キーボードが正しく出る。指定漏れリスクが構造的に消える。

期待スコア: 92 → 96〜97 (M2-1, M2-2, M2-3 解消で +5、Mn2-1〜Mn2-6 のうち 2 件解消で +1)。残り 3 点はパフォーマンス実測 (Lighthouse Mobile LCP < 2.5s / INP < 200ms / CLS < 0.1) を CI ベースラインに組み込んだ段階で確定。

---

## 3 行まとめ

- Round 1 で挙げた Critical 2 / High 4 / Medium 7 / Minor 6 の **大半が commit 8fc39a7 で解消** され、特に MobileBottomNav 常設 + iOS ズーム防止 + safe-area 4 方向化 + SW offline fallback の 4 点が完璧に決まった (64 → 92, +28)。
- 残課題は (a) maskable PNG icon、(b) Sheet/Dialog の overscroll-behavior と close 44px、(c) Input preset (inputMode/autoComplete) の 3 つの Medium のみで、いずれも W1 段階で 1 時間以内に塞げる磨き込み。
- これらを解消すれば 96〜97 到達確実、残り 3 点は実機 Lighthouse 計測 (LCP/INP/CLS) を CI ベースライン化した時点で取り切れる。
