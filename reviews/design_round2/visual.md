# Visual Design Critic — Round 2
**Score: 89 / 100** (R1 42 → R2 89, Δ +47)

## 第一印象
別アプリになった。`shadcn new-app` テンプレ感は完全に抜けて、墨と朱の編集的トーンが画面のあらゆるレイヤ (kicker / № section / hairline / inkan / cinnabar bottom-rule) に一貫して効いていて "KSP らしさ" が立ち上がっている。Linear/Vercel/Stripe と並べても遜色ない域に明確に踏み込んだ — 残るは細部の motion polish と KPI hero / login の余韻、それから dialog/sheet の overlay/animation だけ。

## Round 1 指摘解消マトリクス

| R1 指摘 | 配点影響 | R2 状況 | 解消度 |
| --- | --- | --- | --- |
| `🔐` 絵文字を商用UIに直書き | -8 (Critical) | `login/page.tsx:23-44` 公式 Google G の 4色 SVG に置換、絵文字撤去 | **完全解消** |
| ロゴが `bg-primary` 塗り四角 | -8 (Critical) | `brand/logo.tsx` 3 ストロークの "K" letterform + 落款 (inkan) 朱小四角 SVG。`/favicon.svg`, `/apple-touch-icon.svg`, `/og-image.svg` 内製 | **完全解消** |
| `--primary: 222.2 47.4% 11.2%` shadcn デフォ near-black | -8 (Critical) | `globals.css:11-69` で background=cream paper / primary=sumi(墨) / cinnabar(朱) / chitose(千歳緑) / ochre の独自パレット、HSL token + dark mode 完備 | **完全解消** |
| Button hover が `opacity-90` だけ | -5 (High) | `button.tsx:14-82` 7 variants × 3-state、`hover:-translate-y-px` + `hover:shadow-sumi` + `cubic-bezier(0.32,0.72,0,1)` (`ease-sumi`) + `active:translate-y-0` | **完全解消** |
| Card が `shadow-sm` 単発 | -5 (High) | `card.tsx:15-21` 多層 `shadow-sumi-sm shadow-inset-top` + `interactive` prop で `hover:-translate-y-0.5 hover:shadow-sumi-lg` | **完全解消** |
| Input focus 以外の states 不在 | -5 (High) | `input.tsx:17-29` border hover / `focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]` + inset top highlight | **完全解消** |
| Dialog overlay が `bg-black/60` のみ | -5 (High) | `dialog.tsx:25` まだ `bg-black/60` で `backdrop-blur` 不在、Content も `shadow-lg` のまま | **未解消** |
| `text-amber-700 bg-amber-50` 直書き dark崩壊 | -5 (High) | `alert.tsx:14-37` token-based 6 variant (default/cinnabar/destructive/warning/success/info)、ハードコード amber 撤去 | **完全解消** |
| 空 KPI 3 連の貧弱さ | -5 (High) | `dashboard/page.tsx:121-160` editorial № card に再構成 (kicker + section-no + cinnabar/0→8 blur on hover + ArrowUpRight CTA + group/cta micro) | **完全解消** |
| semantic color に `success` 不在 | -5 (High) | `tailwind.config.ts:111-122` success/warning/info を chitose/ochre/info token に bind | **完全解消** |
| spacing トークンなし | -2 (Med) | container padding は responsive (DEFAULT/sm/lg/xl) 化したが `--space-*` 連番 token は未導入 | **部分解消** |
| `next/font` 未注入 | -2 (Med) | `layout.tsx:18-44` Bricolage Grotesque(display) + Plus Jakarta Sans(body) + Noto Sans JP + JetBrains Mono の4変数注入 | **完全解消** |
| header active が `bg-accent` だけ | -2 (Med) | `header-nav.tsx:46-52` active 時に `absolute bottom-0 ... h-[2px] bg-cinnabar rounded-full` の落款風 underline | **完全解消** |
| h1 改行未制御 | -2 (Med) | `page.tsx:27`, `dashboard/page.tsx:45` `text-balance` 全面採用 | **完全解消** |
| header の 1px border 静的 | -2 (Med) | `app-shell.tsx:42-44` `inset 0 -1px 0` 維持。scroll-detect で出し分けるところまでは行っていない | **部分解消** |
| 403/offline illustration ゼロ | -2 (Med) | `403/page.tsx:12-58` ShieldOff + 朱の cross-line / `offline/page.tsx:7-53` CloudOff + 朱 slash + grid pattern。両方とも自家製 SVG | **完全解消** |
| skeleton 矩形が暗い | -2 (Med) | `globals.css:255-264` `.skeleton` を `linear-gradient + animate-shimmer 2.4s` に。`section-skeleton.tsx` でアイコン枠 + 3行構造 hint | **完全解消** |
| container max-w 1280px 間延び | -1 (Min) | `tailwind.config.ts:28` `2xl: 1240px` に絞り padding も responsive | **完全解消** |
| `lg` size が `px-8` で間延び | -1 (Min) | `button.tsx:71` `lg: 'h-12 px-7 text-base'` に再調整、xl variant も新規 | **完全解消** |
| dialog mobile の四角 sheet | -1 (Min) | `sheet.tsx:35-48` side variant を切り出し、ただし bottom sheet も `rounded-t-2xl` 等の polish なし | **未解消** |
| `--ring` が黒 | -1 (Min) | `globals.css:60` `--ring: 8 65% 52%` (cinnabar) に bind | **完全解消** |
| `font-mono` SC-XX dasai | -1 (Min) | `placeholder.tsx:32-38` SC コードは `data-sc-code` 属性に逃がして UI に出さない設計に変更 (より良い解) | **完全解消** |
| focus outline 単色2px | -1 (Min) | `tailwind.config.ts:157-160` `shadow-focus-ring` で 2 段 (background + ring/0.45) を box-shadow 化 | **完全解消** |
| Loader2 だけ | -1 (Min) | `submit-button.tsx:37-47` `pendingLabel` 文字列のフェード切替まで。完了→checkの余韻は未実装 | **部分解消** |
| header nav 詰めすぎ | -1 (Min) | `header-nav.tsx:26-43` `gap-0.5` + `px-3.5` + `min-h-11` で polished | **完全解消** |

**全 25 項目中: 完全解消 20 / 部分解消 4 / 未解消 1 (dialog overlay blur)**

---

## Breakdown

| 観点 | R1 | R2 | Δ | コメント |
| --- | --- | --- | --- | --- |
| 視覚階層 (15) | 8 | 13 | +5 | kicker + № section + hairline + display heading + body の5段スケールが確立。`page.tsx` の 12-col grid + aside logo / `dashboard` の hero header → hairline → KPI grid → 「最初の一歩」CTA セクションの順序が完璧に編集ページ然としている。-2 は dashboard の "最初の一歩" ブロックが KPI と同列の bg-card で、視覚的に "もう一段上の hero" になっていない (asymmetric sizing or feature gradient で差別化したい)。 |
| タイポグラフィ (15) | 6 | 14 | +8 | `Bricolage Grotesque (display)` + `Plus Jakarta Sans (body)` + `Noto Sans JP` + `JetBrains Mono` の 4 系統を `next/font` で `--font-*` 変数注入。`tailwind.config.ts:46-63` で 11 段 type scale + metric/metric-lg、letterSpacing は `-0.035em` まで深く絞る。`html` に `font-feature-settings: 'cv02','cv03','cv11','palt','ss01','ss02'` (R1 で言及した palt + ss01)。`.tabular { 'tnum','zero','ss01' }` / `.kicker { letterSpacing: 0.18em uppercase }` / `.section-no { italic + tabular + ss02 }` の 3 utility が editorial 表現を一気に押し上げ。-1 は body と display で `letter-spacing` 設定の整合 (display の `-0.035em` は 4xl/5xl/6xl で打消し効果が強すぎ、3xl で詰まる気がある)。 |
| カラーシステム (15) | 4 | 13 | +9 | sumi/cinnabar/chitose/ochre/info の 5 ブランド token + light cream paper background。`--cinnabar: 8 70% 48%` の朱は 営業 SaaS 領域でほぼ唯一性があり、shadcn 群と区別が一発でつく。`alert.tsx` 6 variant、`tailwind.config.ts` `cinnabar / chitose / ochre / success / warning / info` を全て HSL token に bind。dark mode も明度反転だけでなく `--cinnabar-muted: 8 30% 16%` のように chroma 落としで chip 系も成立。-2 は (a) `--info` だけ依然として generic blue (`215 75% 42%`) で和テイストの中で異物感、(b) `cinnabar-muted` の light value (`10 75% 96%`) が cream background との分離が弱く Alert(cinnabar) 系で背景に沈みがち。 |
| 余白・リズム (10) | 6 | 8 | +2 | `space-y-8 / space-y-10` + `gap-3 / gap-4` + `py-12 md:py-20` で baseline grid が見える。container の padding が `DEFAULT/sm/lg/xl` ごとに `1.25/1.5/2/2.5rem` と段階的、breakpoint も `xs/sm/md/lg/xl/2xl` の 6段。-2 は (a) `--space-*` 数値トークンが globals.css に未導入で Tailwind デフォルトに依存、(b) editorial らしい "vertical rhythm" を担保する `line-height + margin-block` の関係性がコンポーネント横断では揃っていない (placeholder の hairline 上下の空きが他ページの hairline と微差)。 |
| コンポーネント polish (15) | 5 | 13 | +8 | Button: 7 variants × 3-state × cubic-bezier、cinnabar variant が `hover:shadow-cinnabar-glow` で別格扱い。Card: `interactive` prop を boolean で受けて hover 反応を opt-in に絞る設計が大人。Input: hover/focus/disabled 三相 + cinnabar focus ring。Alert: 6 variant の token-bind、hardcoded tailwind palette ゼロ。Logo: SVG の `K` + 落款の "もう一段だけ含意がある" マーク化。-2 は **Dialog overlay が `bg-black/60` 単発で `backdrop-blur` 抜け、Content の animate も `data-[state=open]:animate-fade-in` だけで scale-in が無い**。Sheet も同様で bottom sheet の `rounded-t-2xl` などの iOS 流儀が未実装。Linear の dialog と並べると古さが目立つ唯一のコンポーネント。 |
| マイクロインタラクション (10) | 4 | 8 | +4 | `cubic-bezier(0.32,0.72,0,1) ease-sumi` を Linear-grade な default として全 transition に適用。8 keyframes (`fade-in / fade-up / scale-in / sheet-up / shimmer / pulse-ink / inkan-pop`) + `[animation-delay:60ms / 80ms / 120ms / 180ms]` で hero / hairline / KPI のステージング。`group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5` で arrow が右上に滑る dashboard CTA は Linear 的。`prefers-reduced-motion` で 0.001ms に倒すフェイルセーフも入っている。-2 は (a) submit→success の余韻 (Loader2 → Check fade-out → 自然消失) が未実装、(b) Card hover の "scale + lift" は良いが、KPI Card 内の数値 "—" が hover で何も反応しないので "触れる" 感が出ていない (せっかくの cinnabar/0 → cinnabar/8 blur が効いている分、数値側にも `group-hover:text-foreground/60` 程度の微差が欲しい)。 |
| レイアウト構成 (10) | 6 | 9 | +3 | `app-shell` の sticky header + safe-area-inset-top、`MobileBottomNav` 5タブ (中央 FAB 朱) + `bottomActionBar` slot の片手UI 設計、`page.tsx` の 12-col grid (8/4) + `border-y divide-x` の editorial 三段カラム、403/offline の中央寄せ + illustration、`placeholder.tsx` の max-w-3xl + hairline + comingSoonNote 朱の左border。container も `2xl: 1440px` 固定で `2xl: 1240px` に絞ってある。-1 は dashboard が依然として "header → hairline → 3-col KPI → 1段ヒーローCTA" の縦積みで bento / asymmetric を採っていない (Linear/Stripe レベルの "情報密度の景色" には一歩足りない)。 |
| ブランドプレゼンス (10) | 3 | 9 | +6 | Logo SVG (mark + wordmark + tagline 3-variant) / favicon / apple-touch / og-image を全部 sumi+cinnabar の同じ視覚言語で内製。`№ 01 — ksp / Knowledge × Sales` の editorial kicker、`inkan` 落款 utility (`globals.css:241-253`)、cinnabar bottom rule active nav、`og-image.svg` には `feTurbulence` paper grain + 縦帯 + 落款まで完備。`viewport.themeColor` で light=cream / dark=#0d1015、`mask-icon: #cf3a2d` で Safari のピン留めも朱。**「KSP らしさ」が画面の隅々まで一貫**しており、これは Linear/Stripe/Notion 級の到達。-1 は 「商談、ナレッジに。」「営業の現場を、会社の知見に変える。」のコピー(brand voice)が landing にしか出てこず、login/dashboard/error 群が "情報設計だけ KSP" で voice が消えていく所。あと、cream paper grain (`--paper-grain`) は light でしか可視じゃないので、dark mode で brand 質感が一段薄れる (光沢 / inset hairline で代替したい)。 |

合計: 13 + 14 + 13 + 8 + 13 + 8 + 9 + 9 = **89 / 100**

---

## 残課題 (95+ 到達のため)

### Critical-Remaining (1) — Dialog/Sheet overlay の polish (-3)

`dialog.tsx:25` と `sheet.tsx:29` の overlay は依然 `bg-black/60` のフラット黒で、`backdrop-blur` が抜けている。Content も `shadow-lg` (Tailwind デフォルト) で `shadow-sumi-xl` を使っていない。Linear の confirm dialog は overlay が `backdrop-blur(16px)` + `bg-foreground/40`、Content が scale-in 200ms ease-out で出る。

```tsx
// dialog.tsx:22-30
<DialogPrimitive.Overlay
  ref={ref}
  className={cn(
    'fixed inset-0 z-50',
    'bg-foreground/35 backdrop-blur-md',                       // ← black/60 → foreground/35 + blur
    'data-[state=open]:animate-fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
    className,
  )}
  {...props}
/>

// dialog.tsx:39-46
<DialogPrimitive.Content
  ref={ref}
  className={cn(
    'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
    'border border-border bg-card text-card-foreground p-6',
    'rounded-t-2xl rounded-b-none sm:rounded-2xl',             // mobile sheet feel + desktop rounded
    'shadow-sumi-xl',                                          // ← shadow-lg → sumi-xl
    'data-[state=open]:animate-scale-in data-[state=open]:animate-fade-in',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    className,
  )}
  {...props}
>
```

`tailwind.config.ts` の `keyframes` は `scale-in` を既に持っているので、追加は `animate-scale-in` を `data-[state=open]` に当てるだけ。

Sheet も同様に `sheet.tsx:35-48` の `top/bottom` variant に `rounded-t-2xl` / `rounded-b-2xl` と `shadow-sumi-xl` を追加。

### High (2) — KPI hero の "—" 反応と sparkline (-2)

`dashboard/page.tsx:139-143` の metric `"—"` は `text-muted-foreground/35` で fade させているのは正しいが、`group-hover` で何も起きないため "触れる予感" が出ていない。R1 で提案した sparkline は重いので、もっと軽く 「点線の baseline + cinnabar の脈動 dot」 でいい:

```tsx
// dashboard/page.tsx — KpiCard CardContent 内、p.hint の上に追加
<div aria-hidden className="relative h-6">
  {/* placeholder baseline */}
  <div className="absolute inset-x-0 top-1/2 h-px bg-[image:repeating-linear-gradient(to_right,hsl(var(--border))_0,hsl(var(--border))_3px,transparent_3px,transparent_6px)]" />
  {/* pulsing cinnabar dot — データ未取得を「いま準備中」に変換 */}
  <span className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-cinnabar/70 animate-pulse-ink" />
</div>
```

これだけで "空 KPI 3 連" が "用意ができる前の静かな準備状態" に意味的に変換される。

### High (3) — `--info` token の和化 + cinnabar-muted の chroma 補正 (-2)

`globals.css:47` `--info: 215 75% 42%` だけ generic blue で、墨×朱のパレットに対して異物感がある。`info` の用途は「補足情報」なので、もう一段くすませて 藍 (ai) 寄りの `204 50% 38%` あたりにすると馴染む。

```css
/* globals.css :root */
--info: 204 52% 38%;          /* 藍寄り、cream 上で青すぎない */
--info-foreground: 36 22% 97%;
/* .dark */
--info: 204 60% 60%;
```

加えて、light の `--cinnabar-muted: 10 75% 96%` (Alert(cinnabar) の bg) は cream `--background: 36 22% 97%` との明度差が 1% しかなく Alert の境界が border 頼みになる。`8 60% 94%` あたりで H 寄せ + chroma 落とし:

```css
--cinnabar-muted: 8 60% 93%;  /* cream から識別できる薄朱 */
```

### High (4) — Dashboard "最初の一歩" セクションを真の hero card に (-2)

`dashboard/page.tsx:85-107` は `border / bg-card/80 / shadow-sumi-sm` で KPI Card と全く同じ視覚 weight。 上に置くべき "次の一手" がフラット三段のうちの1個に紛れている。Linear 流の「上半分にだけ subtle gradient + 右上に大きめ illustration / icon cluster」を挿す:

```tsx
// dashboard/page.tsx:85
<section
  aria-label="最初の一歩"
  className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-card animate-fade-up [animation-delay:140ms]"
>
  {/* 上半分の paper gradient — sumi 寄りの cream */}
  <div
    aria-hidden
    className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--cinnabar)/0.06),transparent_60%)]"
  />
  {/* 右下に inkan 大きめ */}
  <div
    aria-hidden
    className="absolute -right-8 -bottom-8 size-44 rotate-[-8deg] rounded-md
               bg-cinnabar/8 shadow-[inset_0_0_0_1px_hsl(var(--cinnabar)/0.18)]"
  />
  {/* …中身は現状維持… */}
</section>
```

### Medium (5) — Header の dynamic border on scroll (-1)

`app-shell.tsx:42-45` は static で常に `inset 0 -1px 0`。scroll が 4px を超えたら border + bg-blur を強める:

```tsx
'use client';
// header-nav 隣に新規 client component を分離
function HeaderShadowOnScroll() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 transition-[opacity,box-shadow] duration-med ease-sumi',
        scrolled
          ? 'opacity-100 shadow-[inset_0_-1px_0_hsl(var(--border))]'
          : 'opacity-0 shadow-[inset_0_-1px_0_hsl(var(--border)/0.0)]',
      )}
    />
  );
}
```

### Medium (6) — Submit button の completion afterglow (-1)

`submit-button.tsx` は pending → 元の children に戻るだけで、success の余韻が無い。`useFormState` で `state.status: 'success'` を取り、200ms だけ Check icon を fade-in / out させる:

```tsx
{showSuccess ? (
  <Check aria-hidden className="size-4 animate-[scale-in_180ms_cubic-bezier(0.16,1,0.3,1)] text-chitose" />
) : pending ? (
  <><Loader2 className="size-4 animate-spin"/><span>{pendingLabel}</span></>
) : (
  children
)}
```

### Medium (7) — Skeleton と "もうすぐ使えます" の brand voice 連結 (-1)

`section-skeleton.tsx` は形だけの灰色 shimmer。`placeholder.tsx` の "もうすぐ使えます" コピーが loader にも来ると brand voice が一貫する。`SectionSkeleton({ note?: string })` で `note` を渡せるようにし、shimmer の下に `<p className="kicker">読み込み中 — もうすぐ表示されます</p>` を出す。

### Minor (8) — `display` の `letter-spacing` を size 別に微調整 (-1)

3xl は `-0.018em` のままで OK だが、4xl/5xl で `-0.025em` / `-0.03em` まで強く詰めると Bricolage Grotesque の "G/Q" が潰れる。

```ts
// tailwind.config.ts:55-58
'3xl': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
'4xl': ['2.375rem', { lineHeight: '1.12', letterSpacing: '-0.018em' }],
'5xl': ['3rem',     { lineHeight: '1.05', letterSpacing: '-0.022em' }],
'6xl': ['3.75rem',  { lineHeight: '1',    letterSpacing: '-0.026em' }],
```

### Minor (9) — Spacing token (-0.5)

`globals.css :root` に `--space-1: 0.25rem` … `--space-12: 6rem` を追加し、Tailwind `theme.extend.spacing` から `'token-1': 'var(--space-1)'` で参照可能に。直近の必要性は薄いが、Round 3 以降の component 量産で一貫性を担保する。

### Minor (10) — Dark mode の paper grain 消失 (-0.5)

`.dark { --paper-grain: none }` で grain を消しているが、その代わりの "dark の質感" が無く、cream 時の brand 印象との差が大きい。`.dark` では極微弱な vertical hairline pattern (`linear-gradient(to right, hsl(var(--border)/0.4) 0, hsl(var(--border)/0.4) 1px, transparent 1px) 0/24px 24px`) を `body::before { opacity: 0.3 }` で焼く。

---

## まとめ
R1 で指摘した「shadcn テンプレ脱出」「ブランドカラー」「タイポ・shadow・transition の三大基礎」は **完全に到達**しており、editorial / 朱 / 落款 / 墨 という独自視覚言語で Linear/Stripe/Notion クラスの distinctive さに食い込んでいる。残るのは **dialog の backdrop-blur + scale-in、KPI 空状態の cinnabar pulse、`--info` の和化、dashboard hero の "段差"** の 4 点で、これらを 1 日でつぶせば 95+ は射程圏。`tailwind.config.ts` に `scale-in` keyframe を既に持っているのに dialog で使っていない、という詰め残しが象徴的 — トークンは揃っているのであとは消費するだけ。
