# Knowledge Sales Platform — Design System

> **"Sumi & Cinnabar Editorial"** — 編集的で骨太な業務美学。
> ナレッジHD 営業現場向け B2B SaaS の、信頼感と distinctive な存在感を両立する美学。

---

## 設計思想

### 三本柱
1. **編集的 (Editorial)** — magazine-grade typography、numbered metadata (№ 01)、hairline rules、column dividers
2. **業務 SaaS の信頼感** — 抑制された motion、controlled density、shadcn 越えの polish
3. **日本らしさ** — 墨 (sumi) と朱 (cinnabar)、落款 (inkan) accent、紙の質感 (paper grain)

### Inspiration
- Linear / Vercel / Stripe / Granola — distinctive B2B
- 日本の編集的書籍 (NUMBER / Brutus / 新潮)
- Sumi-e 水墨画の控制された余白
- 工業的データシート (Specsavers, manufacturing tools)

### 避けたもの
- Inter / Roboto / system font の generic タイポ
- purple gradient on white
- shadcn デフォルト shadow / spacing / color
- Space Grotesk (B2B AI 業界で over-used)

---

## カラーシステム

### Brand palette (HSL CSS Variables)

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--background` | 36 22% 97% (`#fafaf6`) | 220 25% 6% (`#0d1015`) | paper cream / graphite |
| `--foreground` | 220 35% 9% | 32 18% 92% | 主要テキスト |
| `--primary` | 220 38% 12% (sumi 墨) | 32 22% 92% (inverse cream) | 主要 CTA |
| `--cinnabar` | 8 70% 48% (`#cf3a2d`) | 8 78% 60% | 朱、brand active accent |
| `--cinnabar-muted` | 8 60% 93% | 8 30% 16% | Alert(cinnabar) 背景 |
| `--chitose` | 156 32% 32% (`#386b54`) | 156 38% 55% | 千歳緑、success |
| `--ochre` | 32 78% 46% (`#cf8520`) | 38 80% 60% | warning |
| `--info` | 204 52% 38% (藍 ai) | 204 60% 60% | info |
| `--destructive` | 0 70% 46% | 0 65% 56% | エラー (cinnabar より lower chroma) |
| `--ring` | 8 65% 52% (cinnabar tinted) | 8 75% 60% | focus ring |

### Surfaces

| Token | 役割 |
|---|---|
| `--surface` | bg より少し沈んだサーフェス |
| `--surface-raised` | カード等の elevated 面 |
| `--surface-inset` | input wells (凹) |
| `--surface-highlight` | inset-top の 1px highlight |

### Paper grain
- Light: `feTurbulence` baseNoise の SVG data URI を tile (240×240)
- Dark: vertical hairline pattern (32px tile) で graphite に質感

---

## タイポグラフィ

### Font stack

| Role | Font | Source |
|---|---|---|
| Display | **Bricolage Grotesque** | next/font/google, variable opsz |
| Body | **Plus Jakarta Sans** | next/font/google |
| Japanese | **Noto Sans JP** | next/font/google, weights 400/500/700 |
| Mono | **JetBrains Mono** | next/font/google, weights 400/500 |

CSS Variables: `--font-display`, `--font-body`, `--font-jp`, `--font-mono`

### Type scale (custom)

```
2xs   0.6875rem   line 1rem    letter 0.04em
xs    0.75rem     line 1.125   letter 0.01em
sm    0.875rem    line 1.375
base  0.9375rem   line 1.55
lg    1.0625rem   line 1.5
xl    1.25rem     line 1.4     letter -0.005em
2xl   1.5rem      line 1.3     letter -0.01em
3xl   1.875rem    line 1.2     letter -0.015em
4xl   2.375rem    line 1.12    letter -0.018em
5xl   3rem        line 1.05    letter -0.022em
6xl   3.75rem     line 1       letter -0.026em

# Numeric display (KPI heroes)
metric-sm   1.875rem   letter -0.02em
metric      2.625rem   letter -0.025em
metric-lg   3.5rem     letter -0.035em
```

### Custom utilities

| Class | 用途 |
|---|---|
| `.display` | Display フォント + tracking -0.018em + `ss01, cv11` features |
| `.kicker` | uppercase 0.6875rem + tracking 0.18em (editorial label) |
| `.section-no` | italic tabular + `ss01, ss02` (numbered metadata "№ 01") |
| `.tabular` | tabular-nums + slashed-zero + `tnum, zero, ss01` |
| `.inkan` | 朱の落款方塊 utility (内側 inset shadow + 外側 drop) |

### Letter-spacing
- `tracking-crisp` = `-0.018em` (heading)
- `tracking-editorial` = `0.06em` (small label)
- `tracking-kicker` = `0.18em` (uppercase kicker)

---

## Spacing & Layout

### Container
```ts
container: {
  center: true,
  padding: { DEFAULT: '1.25rem', sm: '1.5rem', lg: '2rem', xl: '2.5rem' },
  screens: { '2xl': '1240px' },
}
```

### Breakpoints (custom)
- xs `375px` — iPhone SE bucket
- sm `640px`
- md `768px`
- lg `1024px`
- xl `1280px`
- 2xl `1440px`

### Safe-area-inset
全方向を CSS 変数化 (`--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right`)。
ユーティリティ: `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, `pb-nav` (bottom nav 高さ + safe-bottom)。

### Borders & radii
```
xs    0.25rem
DEF   0.375rem (rounded)
md    0.5rem
lg    0.625rem
xl    0.875rem
2xl   1.125rem  ← Card, Dialog
3xl   1.5rem
```

---

## Shadows (multi-layer)

shadcn の単発 `shadow-sm` を捨て、CSS 変数で多層化。

| Token | 効果 |
|---|---|
| `shadow-sumi-sm` | 1px ハイライト + 2px subtle drop |
| `shadow-sumi` | 1px + 12px ambient + 2px sharp |
| `shadow-sumi-lg` | 12px wide + 4px sharp + ハイライト |
| `shadow-sumi-xl` | 24px wide + 8px sharp (Dialog 等) |
| `shadow-cinnabar-glow` | 朱の brand glow (cinnabar variant button hover) |
| `shadow-focus-ring` | 2 段 (background + ring/0.45) |
| `shadow-focus-ring-cinnabar` | 同上 cinnabar tinted |
| `shadow-rule` / `shadow-edge` | 罫線 / inset 罫線 |

---

## Motion

### Easing
- `ease-sumi` = `cubic-bezier(0.32, 0.72, 0, 1)` — Linear-grade, default
- `ease-sumi-out` = `cubic-bezier(0.16, 1, 0.3, 1)` — out-only (reveals)
- `ease-sumi-in` = `cubic-bezier(0.36, 0, 0.66, 1)` — in-only (exits)

### Duration
- `duration-fast` = 160ms (hover, focus, button press)
- `duration-med` = 240ms (card lift, color transitions)
- `duration-slow` = 360ms (page reveals, KPI hover glow)

### Keyframes
- `fade-in` (240ms)
- `fade-up` (360ms with translate-y 8px)
- `scale-in` (200ms with scale 0.96→1)
- `sheet-up` (280ms slide from bottom)
- `shimmer` (2.4s linear infinite, skeleton)
- `pulse-ink` (2.4s opacity pulse 0.7↔1, empty KPI)
- `inkan-pop` (360ms rotate + scale, 落款 reveal)

### Reveal staging
- 初期ロード時 `[animation-delay:60ms]` / `[animation-delay:140ms]` でカスケード reveal
- `prefers-reduced-motion` 時は 0.001ms に倒すフェイルセーフ

---

## Components

### UI primitives (`apps/web/src/components/ui/`)
| Component | 特徴 |
|---|---|
| `button.tsx` | 7 variants × 4+ sizes, 3-state hover/active, 44px+ tap targets, cinnabar variant with brand glow |
| `card.tsx` | multi-layer shadow, `interactive` prop で hover lift |
| `input.tsx` | 8 preset (default/email/tel/search/numeric/url/name-jp/password), text-base mobile (iOS ズーム防止), cinnabar focus ring |
| `dialog.tsx` | backdrop-blur-md, scale-in, [overscroll-behavior:contain], close 44px |
| `sheet.tsx` | 4 side variants + drag handle (bottom), safe-area inset, [overscroll-behavior:contain] |
| `alert.tsx` | 6 token-based variants (default/cinnabar/destructive/warning/success/info) |
| `submit-button.tsx` | useFormStatus + Loader2 spinner + aria-busy + aria-live |
| `label.tsx` | Radix label primitive ラッパ |

### Layout (`apps/web/src/components/layout/`)
| Component | 役割 |
|---|---|
| `app-shell.tsx` | sticky header + safe-area + MobileBottomNav 常設 + bottomActionBar slot |
| `header-nav.tsx` | usePathname active state, cinnabar inset rule active, 44px+ tap |
| `mobile-bottom-nav.tsx` | 5 tabs + center cinnabar FAB + 落款風 active mark |
| `theme-provider.tsx` | next-themes ラッパ |
| `signout-button.tsx` | useFormStatus 対応 |
| `protected-shell.tsx` | role gate + AppShell wrap |
| `placeholder.tsx` | editorial № + kicker + hairline + brand voice |
| `section-skeleton.tsx` | shimmer + content shape hint |
| `section-error.tsx` | Sentry capture + reset() ボタン |

### Brand (`apps/web/src/components/brand/`)
| Component | 役割 |
|---|---|
| `logo.tsx` | `LogoMark` (SVG K + 落款) + `Logo` (Mark + wordmark) |

---

## Iconography

- 全 lucide-react を `strokeWidth={1.4-1.75}` で繊細に
- ナビゲーション・主要 CTA に表情 (Calendar / IdCard / Sparkles / ScanLine 等)
- 自家製 SVG illustration: `/403` 鍵 + 朱 cross-out / `/offline` cloud + 朱 slash

### ロゴ
- `LogoMark`: SVG 32×32 内に K (3 stroke) + 朱の落款方塊 (6×6 inkan)
- `favicon.svg` / `apple-touch-icon.svg` (180×180) / `og-image.svg` (1200×630)
- ファビコンの cream 背景は light/dark どちらでも視認

---

## Tone & Voice

### コピー原則
- **敬体ベース** (「〜してください」「〜します」)
- 句読点は全角統一 (「、」「。」)
- 英数字混入時は半角スペース挟む ("Google でサインイン")
- 内部識別子 (T-XXX / SC-XX / Phase1 / RLS / audit_logs) は **絶対 UI に出さない**
- 営業マンの読み手前提で平易語に翻訳
  - 例: "OCR" → "文字認識" / "incremental authorization" → "機能をはじめて使うときに改めて伺います"

### マイクロコピー例
- empty state: 「— + baseline + 脈動 dot + 次の一手 CTA」 (single placeholder string ではなく動的)
- error: 「ネットワークが不安定だった可能性があります。もう一度試して、それでも続くようでしたら管理者へお知らせください。」
- coming soon: 「もうすぐ使えます」 + 「準備中」 kicker (「Phase1 進行中・近日公開予定」ではない)
- 時間帯あいさつ: dashboard で hour-of-day → 「おはようございます」「こんにちは」「おつかれさまです」

---

## Editorial Numbering

主要セクションには **№ NN** ナンバリングを付ける。

- `№ 01` — Home / ksp / Knowledge × Sales
- `№ 02` — Visual highlights (名刺を、その場で)
- `№ 03` — Visual highlights (録画を、要約に)
- `№ 04` — Visual highlights (社の知見を、横断検索)
- `№ 05` — Dashboard "最初の一歩" hero
- 各 placeholder は `№ NN — 部門 / 機能` (SC-XX から digit 抽出)

italic tabular `ss01` で「商用ナンバリング」ではなく「雑誌の№」の質感。

---

## 落款 (Inkan) Accent

朱の小四角を「signature 感」として配置:

- ロゴ右下 (favicon, apple-touch, og-image)
- Dashboard "最初の一歩" hero の右下 (rotated -8deg)
- Login top のロゴ右肩 (small)
- Top page hero の左下 (`size-9` で "K" を含む inkan)

CSS utility: `.inkan { bg-cinnabar / inset 1px highlight / drop shadow }`

---

## Light vs Dark

### Light (default)
- cream paper background + paper grain SVG overlay
- 墨 ink primary、cinnabar 朱 accent
- multi-layer shadow (subtle)

### Dark
- graphite background + vertical hairline pattern (32px tile)
- cream inverse primary、cinnabar bright (lifted chroma)
- shadow は黒のまま厚く

next-themes で `attribute="class"` 切替、`prefers-color-scheme: system` default。

---

## Files

```
apps/web/
├── src/
│   ├── app/
│   │   ├── globals.css            ← トークン定義 (HSL CSS variables)
│   │   ├── layout.tsx              ← next/font 4 系統注入、metadata
│   │   └── manifest.ts             ← PWA (icons / shortcuts)
│   ├── components/
│   │   ├── ui/                     ← 8 primitives
│   │   ├── layout/                 ← 9 layout components
│   │   └── brand/                  ← logo.tsx
├── tailwind.config.ts              ← screens / fonts / shadows / easing / animations
├── public/
│   ├── favicon.svg                 ← K + 落款 (32×32)
│   ├── apple-touch-icon.svg        ← K + 落款 (180×180)
│   ├── og-image.svg                ← Editorial composition (1200×630)
│   └── sw.js                       ← navigation fallback
```

---

## Phase 2 で追加予定

- 利き手切替 UI (`data-handedness="left|right"`) → bottom action bar の左右反転
- ダークモードトグル UI (Sun / Moon icon header right)
- ブランドガイドライン PDF (印刷物・名刺・封筒)
- ロゴ規定書 (clear space / minimum size / co-branding rules)
- カラーパレットの cubicChroma 拡張 (Phase 2 で chart / pattern 用)

---

© 2026 IKEMENLTD / Knowledge Holdings
