# Visual Design Critic — Round 1
**Score: 42 / 100**

## 第一印象 3行
login画面は「shadcn/ui の new-app テンプレートそのもの」で、Card のドロップシャドウ・border-radius・spacing すべてがデフォルト値。`🔐` の絵文字がボタンに刺さっている時点でデザイナーのレビューを通っていないことが伝わる。dashboard は KPI カード3枚が `value="—"` で並ぶだけ、空の box が3つ並ぶことに対する視覚的処理 (illustration / empty state / accent gradient) が一切ない。神デザイン (Linear / Vercel / Notion) からは **およそ55-60点ぶん** 距離がある — ブランドカラーゼロ、shadow polish ゼロ、タイポ scale が貧弱、アニメ表現 0.2s `ease-out` 一種類のみ、ロゴが `<span className="bg-primary h-6 w-6 rounded">` という塗り四角。

## Breakdown
| 観点 | 配点 | 取得 | コメント |
| --- | --- | --- | --- |
| 視覚階層 / Information Hierarchy | 15 | 8 | h1→muted p の二段は機能するが、login の Card 内はタイトル/説明/CTA/権限ブロック/フッタリンクが全部同じ間隔・同じウェイトで「並列に並べただけ」。dashboard の KPI も density 同一でアイホンが定まらない |
| タイポグラフィ | 15 | 6 | scale が `text-sm / text-base / text-lg / text-2xl / text-3xl / text-4xl` の 6段だが、weight は `font-medium` と `font-semibold` の 2 種だけ。`tracking-tight` が h1/h3 にだけ。日本語見出しに `palt` を入れているのは加点だが、英字混在 (KSP / Knowledge Sales Platform / SC-09) でフォント切替指定なし。font-display の Inter / Geist 等の sans 指定が無く `var(--font-sans)` が空 |
| カラーシステム | 15 | 4 | shadcn 完全デフォルト。`--primary: 222.2 47.4% 11.2%` (ほぼ黒) で **ブランドカラー不在**。アクセントが `--accent === --secondary === --muted` で全部同じグレーに潰れている。dark mode は明度反転のみで質感ゼロ。semantic color が destructive/warning/info の 3つだけ、success が無い。`text-amber-700 bg-amber-50` をハードコードしていてダークモード非対応 |
| 余白・リズム | 10 | 6 | `space-y-6 / gap-3 / py-6 md:py-8` などおおむね 8px グリッドだが、`space-y-1.5` (6px) が CardHeader 内に混入。container padding が `px-4` 固定でブレイクポイント連動なし。垂直リズムを定める `--space-*` トークンが無い |
| コンポーネント polish | 15 | 5 | Button hover が `hover:opacity-90` のみ — translate / shadow / brightness 連動なし。Card は `shadow-sm` (= `0 1 2 0 rgba(0,0,0,0.05)`) でデフォルト。Input は focus ring のみで hover state ゼロ、border が `border-input` (グレー) で active 状態の差分なし。Dialog overlay が `bg-black/60` (ぺったり)、`backdrop-blur` 不在。disabled は `opacity-50` 一律 |
| マイクロインタラクション | 10 | 4 | tailwind keyframes 2 個 (`fade-in 0.2s ease-out` / `slide-in-from-bottom 0.3s ease-out`) のみ。**cubic-bezier カーブ** 不使用 (Linear 流の `cubic-bezier(0.4, 0, 0.2, 1)` ない)。`transition-colors` のみで `transition-all` / `duration-200` / `will-change` 設計が無い。SubmitButton の loader はあるが pending → success の余韻表現なし |
| レイアウト構成 | 10 | 6 | AppShell の sticky header + container はオーソドックスで合格点。ただし `container` が `max-w-screen-2xl: 1280px` で 大画面で間延び、sidebar nav が無く全部 top nav に押し込み。`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` のような直線的グリッドのみで bento / asymmetric layout 不採用 |
| ブランドプレゼンス | 10 | 3 | ロゴが `<span className="inline-block h-6 w-6 rounded bg-primary" />` の塗り四角 + "KSP" 文字。SVG マーク不在。ブランドカラー不在。ファビコンがデフォルト (`/favicon.ico`)。illustration / pattern / hero gradient / noise texture すべて無し。login 画面が「Vercel のテンプレを起動した直後の画面」と見分けがつかない |

合計: 8 + 6 + 4 + 6 + 5 + 4 + 6 + 3 = **42 / 100**

---

## 神デザインから足りない要素 Top 5

### 1. ブランドカラー / グラデーション不在 (Critical, -8)
`globals.css:13` の `--primary: 222.2 47.4% 11.2%` は shadcn の何百万のサイトと同じ "near-black"。営業 SaaS なら信頼感のある blue-violet 系 + warm accent の 2-tone を提案。

```css
/* globals.css */
:root {
  /* Brand: Indigo 600 base, primary CTA */
  --brand: 238 75% 60%;             /* #5B5BE8 */
  --brand-fg: 0 0% 100%;
  --brand-muted: 238 70% 96%;       /* CTA hover/glow base */
  --brand-ring: 238 80% 65%;
  /* Accent: warm gold for premium / KPI highlight */
  --accent-warm: 38 92% 56%;        /* #F5A524 */
  /* Semantic */
  --success: 152 60% 42%;
  --success-fg: 0 0% 100%;
  --warning: 38 92% 50%;
  --info: 211 92% 56%;
  --primary: var(--brand);          /* primary を brand に再束縛 */
  --primary-foreground: var(--brand-fg);
}
.dark {
  --brand: 238 80% 70%;             /* dark でも視認性確保 */
  --brand-muted: 238 30% 18%;
  --accent-warm: 38 95% 65%;
}
```
ロゴも単色四角ではなく、グラデーション + 内側 inset shadow で立体感を:
```tsx
// app-shell.tsx:46
<span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg
  bg-gradient-to-br from-[hsl(238_85%_65%)] to-[hsl(265_75%_55%)]
  shadow-[0_4px_12px_-2px_hsl(238_85%_60%/0.4),inset_0_1px_0_hsl(0_0%_100%/0.2)]
  text-white text-xs font-bold tracking-tight">K</span>
```

### 2. Shadow / depth system が `shadow-sm` 一発 (High, -5)
Linear / Notion はカードに **multi-layer shadow** + 1px のうっすいハイライトを必ず重ねる。Tailwind 標準だと粗いので CSS var 化推奨。

```css
:root {
  --shadow-sm: 0 1px 2px hsl(220 40% 10% / 0.04), 0 1px 1px hsl(220 40% 10% / 0.03);
  --shadow-md: 0 4px 12px -2px hsl(220 40% 10% / 0.08), 0 2px 4px hsl(220 40% 10% / 0.04);
  --shadow-lg: 0 12px 32px -8px hsl(220 40% 10% / 0.12), 0 4px 8px hsl(220 40% 10% / 0.06);
  --shadow-glow: 0 0 0 1px hsl(238 75% 60% / 0.1), 0 8px 24px -8px hsl(238 75% 60% / 0.3);
}
.dark {
  --shadow-sm: 0 1px 2px hsl(0 0% 0% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.04);
  --shadow-md: 0 4px 16px hsl(0 0% 0% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.05);
}
```
```tsx
// card.tsx:9 — shadow-sm を捨て multi-layer に
'rounded-xl border border-border/60 bg-card text-card-foreground
 shadow-[var(--shadow-sm)] transition-shadow duration-200
 hover:shadow-[var(--shadow-md)]'
```

### 3. Button hover が opacity だけ (High, -5)
`hover:opacity-90` (`button.tsx:11`) は最低ライン。Stripe / Linear は背景色変化 + 1px translate + glow を組合わせる。

```tsx
// button.tsx:6 — buttonVariants を全面書換
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ' +
  'transition-[transform,box-shadow,background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-sm)] ' +
          'hover:bg-primary/95 hover:shadow-[var(--shadow-glow)] hover:-translate-y-px',
        outline:
          'border border-border bg-background/50 backdrop-blur-sm ' +
          'hover:bg-accent hover:border-border/80 hover:-translate-y-px',
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        // ...
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
  },
);
```

### 4. login の `🔐` 絵文字 + dashboard 空 KPI = テンプレ感最大化 (Critical, -8)
`login/page.tsx:60` の絵文字をやめて Google G ロゴ (公式 SVG) を入れる。dashboard の "—" KPI は **趣のある empty state** にする。

```tsx
// login/page.tsx:53-63 を以下に置換
<SubmitButton className="w-full gap-3" size="lg" pendingLabel="サインイン中…">
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.45l3-3C17.3 1.7 14.9.7 12 .7 7.4.7 3.4 3.3 1.4 7l3.5 2.7C5.9 6.9 8.7 5 12 5z"/>
    <path fill="#4285F4" d="M23.5 12.3c0-.85-.07-1.65-.2-2.4H12v4.55h6.5c-.3 1.5-1.15 2.75-2.45 3.6l3.55 2.75c2.05-1.9 3.2-4.7 3.2-8z"/>
    <path fill="#FBBC05" d="M5 14.3c-.25-.7-.4-1.5-.4-2.3 0-.8.15-1.6.4-2.3L1.4 7C.5 8.5 0 10.2 0 12c0 1.8.5 3.5 1.4 5l3.6-2.7z"/>
    <path fill="#34A853" d="M12 23.3c3.25 0 6-1.05 8-2.9l-3.55-2.75c-1 .65-2.25 1.05-4.45 1.05-3.3 0-6.1-1.9-7.1-4.7L1.4 17c2 3.7 6 6.3 10.6 6.3z"/>
  </svg>
  <span>Google でサインイン</span>
</SubmitButton>
```

```tsx
// dashboard/page.tsx:47 — KpiCard を sparkline + 質感ある "—" に
function KpiCard({ title, value, hint, icon: Icon }: {...}) {
  return (
    <Card className="relative overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 blur-2xl
                      opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardDescription className="text-[11px] uppercase tracking-[0.12em] font-medium">{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight
                              [font-feature-settings:'ss01','tnum']">
          {value === '—' ? <span className="text-muted-foreground/40">—</span> : value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500/70 animate-pulse" />
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}
```

### 5. タイポ scale & weight が 2bit (High, -5)
font weight が `font-medium (500)` と `font-semibold (600)` の 2種のみ。display 用に 700/800、body 用に 400 を使い分ける。日本語/英字の `font-feature-settings` を utility 化。

```css
/* globals.css */
:root {
  --font-sans: 'Inter', 'Geist', system-ui, sans-serif;
  --font-display: 'Inter Display', 'Geist', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Geist Mono', monospace;
  --font-jp: 'Noto Sans JP', 'Hiragino Sans', sans-serif;
}
html {
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'palt', 'ss01';
  font-variation-settings: 'opsz' 32;  /* Inter Variable opsz */
}
.font-display {
  font-family: var(--font-display);
  letter-spacing: -0.02em;
  font-feature-settings: 'ss01', 'cv11';
}
.font-numeric { font-feature-settings: 'tnum', 'zero'; font-variant-numeric: tabular-nums; }
```
```tsx
// dashboard/page.tsx:21 — h1 を display フォントに
<h1 className="font-display text-3xl md:text-[2.25rem] font-semibold tracking-[-0.025em]">
  ダッシュボード
</h1>
```

---

## Critical / High / Medium / Minor

### Critical
- **`globals.css:13` ブランドカラー不在 (-8)**: `--primary: 222.2 47.4% 11.2%` (黒系) を `--primary: 238 75% 60%` (indigo) に。上記Top1の全パレット差分を適用。
- **`login/page.tsx:60` 絵文字 `🔐` を商用UIに入れている (-8)**: 上記 Top4 の Google SVG 差替。
- **`app-shell.tsx:46` ロゴが塗り四角 (-8)**: 上記Top1の gradient + inset shadow に置換。SVG ロゴマーク化推奨 (`/public/logo.svg`)。

### High
- **`button.tsx:11` `hover:opacity-90` だけ (-5)**: Top3のパッチ全適用。`active:scale-[0.98]` と `cubic-bezier(0.4,0,0.2,1)` を全 transition に。
- **`card.tsx:9` `shadow-sm` 単発 (-5)**: Top2 の multi-layer shadow + hover 昇格に。`rounded-lg → rounded-xl` で polish。
- **`input.tsx:12` focus 以外の states 不在 (-5)**: 以下に置換。
  ```tsx
  'flex h-10 w-full rounded-lg border border-input bg-background/50 px-3.5 py-2 text-sm ' +
  'shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ' +
  'hover:border-border hover:bg-background ' +
  'focus-visible:outline-none focus-visible:border-ring focus-visible:bg-background ' +
  'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.15)] ' +
  'placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50'
  ```
- **`dialog.tsx:25` overlay が `bg-black/60` のみ (-5)**: `backdrop-blur-sm` を加え、Content に scale-in アニメ。
  ```tsx
  // overlay: 'fixed inset-0 z-50 bg-background/40 backdrop-blur-md ...'
  // content: '... data-[state=open]:animate-[fade-in_0.2s,scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)]'
  ```
  keyframes に `scale-in: from { transform: translate(-50%,-50%) scale(0.96); opacity: 0 }` を追加。
- **`tailwind.config.ts:30-64` semantic color に `success` 不在 (-5)**: `success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-fg))' }` 追加。
- **`alert.tsx:13-14` `text-amber-700 bg-amber-50` 直書き (-5)**: dark mode 崩壊。`bg-warning/10 text-warning border-warning/30` のように token 化。
- **`dashboard/page.tsx:38-42` 空 KPI 3 連 (-5)**: Top4 の sparkline / pulse dot / gradient hover ある empty state に。

### Medium
- **`globals.css` spacing トークンなし (-2)**: `--space-1: 4px ... --space-12: 96px` を CSS var で導入し、Tailwind `theme.extend.spacing` にマッピング。
- **`layout.tsx` font 設定が `var(--font-sans)` だけで未注入 (-2)**: `next/font` の Inter / Noto Sans JP 二重設定がない。
  ```tsx
  import { Inter, Noto_Sans_JP } from 'next/font/google';
  const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
  const notoJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-jp', weight: ['400','500','700'] });
  // <html className={`${inter.variable} ${notoJP.variable}`}>
  ```
- **`header-nav.tsx:33` active state が `bg-accent` だけ (-2)**: 下に 2px の brand ライン + text を foreground にすると Vercel 風。
  ```tsx
  isActive
    ? 'text-foreground bg-accent/40 shadow-[inset_0_-2px_0_hsl(var(--brand))]'
    : 'text-muted-foreground hover:text-foreground'
  ```
- **`page.tsx:18` トップの h1 `text-4xl` で改行が制御されてない (-2)**: `text-balance` (Tailwind 3.4+) と `max-w-[18ch]` を h1 に。
- **`app-shell.tsx:38` header の 1px border のみ (-2)**: scroll 時にだけ border が出るパターン (`useScroll() > 4 ? 'border-b' : ''`) に。
- **`offline/page.tsx`, `403/page.tsx` Hero illustration ゼロ (-2)**: `<svg>` で 200x140 程度の outline-style illustration (オフライン雲 / 鍵)。
- **`section-skeleton.tsx:32` `bg-muted` 矩形が暗くなりすぎ (-2)**: shimmer グラデーションに。
  ```tsx
  'h-16 rounded-lg bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%] animate-[shimmer_1.6s_infinite]'
  ```

### Minor
- **`tailwind.config.ts:13` container max-width が `2xl: 1280px` (-1)**: 大画面で間延び。`max-w-[1240px]` 程度 + asymmetric layout 検討。
- **`card.tsx:18` CardHeader が `p-6` 固定 (-1)**: dashboard の compact KPI には `p-5` が欲しい。`size` variant 化推奨。
- **`button.tsx:21` `lg` size が `px-8` (-1)**: padding が大きい割に高さ44pxのみ。`h-12 px-6` に。
- **`dialog.tsx:42` `sm:rounded-lg` のみで mobile sheet が四角 (-1)**: `rounded-t-2xl rounded-b-none sm:rounded-lg` でiOS sheet風に。
- **`globals.css:25` `--ring: 222.2 84% 4.9%` (黒) (-1)**: brand ring に。`--ring: var(--brand-ring)`。
- **`placeholder.tsx:26` `font-mono` のSC-XXがダサい (-1)**: badge component化して subtle bg 付与。
  ```tsx
  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px]
                   font-mono font-medium tracking-wider text-muted-foreground">
    {scCode}
  </span>
  ```
- **`globals.css:75-79` focus outline が単色 2px (-1)**: 内側に1px white を挟むと dark 上で抜ける。`outline: 2px solid hsl(var(--ring))` + `box-shadow: 0 0 0 4px hsl(var(--ring)/0.2)` の二段。
- **`submit-button.tsx:39` Loader2 がただ回るだけ (-1)**: 完了時に check icon → fade-out のリアクションが欲しい (FormState で実装可)。
- **`header-nav.tsx:21` `gap-1` で nav item 詰めすぎ (-1)**: `gap-1` → 各 item の左右 padding を `px-3` から `px-3.5`、もしくは gap を `gap-0.5` でそろえつつ item 内余白を増やす。

---

## まとめ
現状は **shadcn/ui の "Hello world" + Next.js テンプレ** 段階。視覚言語ゼロ、ブランド在不在、`opacity / shadow-sm / bg-accent` の3点でしか UI が変化しない、という典型的な「動くが伝わらない」フロント。営業現場 SaaS は Notion / Linear ほどの遊びは要らないが、**信頼感を伝える primary brand color + 多層 shadow + microinteraction** の 3 点だけでも導入すれば一気に 70点台に乗る。

**100点に到達するための作業 (約 3-5 日, 1 人)**:
1. **CSS Token 全面再設計 (0.5日)**: `globals.css` に brand/success/shadow/space/font-display CSS var を導入、Tailwind config 連携。
2. **next/font + 日英ハイブリッド typography (0.5日)**: Inter Variable + Noto Sans JP、display/body/mono/jp 4系統、`font-feature-settings` ユーティリティ化。
3. **ロゴ SVG + ファビコン作成 (0.5日)**: KSP の "K" + 商談アイコン的グリフ。`/public/logo.svg`, `/public/icon-*.png` 整備。
4. **Button / Card / Input / Dialog / Alert を全面 polish (1日)**: 上記 Critical/High パッチ全適用、`active:scale` + multi-layer shadow + cubic-bezier transition。
5. **dashboard を gradient hero + sparkline KPI に再設計 (0.5日)**: 空でも美しい empty state、 sparkline は `recharts` か pure SVG。
6. **login を 2-column hero (左: 製品プロモ, 右: フォーム) + brand gradient 背景 (0.5日)**: Linear ログインを参考に。
7. **error / offline / 403 に SVG illustration 追加 (0.5日)**: 自家製 outline icon (Phosphor / Lucide Bold) 流用可。
8. **Storybook (or `/_design`) に component gallery 設置 (0.5日)**: Round2 以降のレビューで再現性担保。

これで 90+ 圏内、特に手書き illustration と loading の余韻まで詰めれば 95+ に乗る。Round 1 の今は **タイポ・ブランドカラー・shadow** の "三大基礎" を最優先で詰めること。
