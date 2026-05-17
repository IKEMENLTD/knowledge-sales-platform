# Brand Consistency Round 1 Review

レビュー対象: `apps/web/src/**/*.{tsx,ts,css}` 全件 + `tailwind.config.ts` + `globals.css`
美学基準: "Sumi & Cinnabar Editorial" (墨 / 朱 / 千歳緑 / 黄土 / 藍)
レビュー観点: 色トークン / 絵文字 / № ナンバリング / 落款 (inkan) / フォントクラス /
アプリ名 / SVG strokeWidth / animation token / `<img>` vs `next/image` / dark mode

## スコア: 87 / 100

ブランド トークン化はおおむね徹底されており、generic Tailwind カラー (sky/emerald/violet/rose/indigo 等)
や絵文字は **完全 0 件**。`@layer components` の `.inkan` クラス、Bricolage Grotesque +
Noto Sans JP の display スタック、`tracking-kicker` (0.18em) と `section-no` の italic tabular nums
など、編集メディア感は high quality に組まれている。

ただし以下 4 領域で局所的な drift が残っている:

1. Lucide `strokeWidth` が 1.4 / 1.5 / 1.6 / 1.8 / 2 と 5 段階で揺れている
2. kicker letter-spacing が `tracking-kicker` (0.18em) と `tracking-[0.16em]` の 2 系混在
3. 詳細以外のエッジページ (login / 403 / offline / contacts review / admin) に落款 accent が無い
4. dark mode インフラ (`next-themes` + `darkMode: 'class'`) は揃っているが切替 UI が一切ない

---

## 強み

- **generic Tailwind カラー 0 件**: `(sky|emerald|violet|rose|indigo|teal|orange|pink|fuchsia|cyan|lime|yellow|green|red|blue|purple)-N` ヒット ゼロ。例外 amber (status warning) のみ 14 hit で全て `dark:` variant 付き
- **絵文字 0 件**: `[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{27BF}]` ヒット ゼロ。`feedback_no_emoji_svg_only.md` 完全遵守
- **ブランド トークン使用**: `text-cinnabar|chitose|ochre|info|foreground|muted-foreground` 363 hit / 66 files。 brand-named class が drift せず使われている
- **`ease-sumi` + `duration-fast/med/slow`** が `transitionTimingFunction` と `transitionDuration` の token として正しく Tailwind に登録、43 callsite で一貫使用
- **落款アクセントの実装**: `.inkan` クラスが `globals.css:254` に component layer として定義、`box-shadow: inset 0 0 0 1px hsl(var(--cinnabar)/0.4)` で篆刻風の縁付き。`/page.tsx`, `/dashboard`, `/onboarding/step-done`, `/meetings/[id]`, `/recordings/[id]` に signature として配置
- **編集的 type scale + tabular nums**: `tabular`, `display`, `kicker`, `section-no` の 4 つの semantic class を `globals.css` に厳密定義、KPI / 数値箇所で `font-variant-numeric: tabular-nums slashed-zero` を強制
- **HSL CSS変数ベース**: `:root` と `.dark` で full token set 提供。`hsl(var(--cinnabar))` パターン徹底で dark mode が自動追従
- **PWA / OG metadata 整合**: manifest theme_color `#cf3a2d` と light / dark themeColor、`layout.tsx` の `applicationName: 'Knowledge Sales Platform'` で表記は KSP brand 系統で統一

---

## 改善余地

### HIGH (要修正)

**HIGH-B-01**: `kicker` の letter-spacing が 2 系混在
- 違反箇所: `apps/web/src/app/recordings/_components/recording-card.tsx:30,44,52,69` および
  `recording-skeleton.tsx:41,44,51,81,130,133,139,144` に `text-[10px] uppercase tracking-[0.16em]` が 14 箇所
- 正準値: `tracking-kicker` (= 0.18em)。`recording-card.tsx:39` 自身で `tracking-kicker` も使っているため card 内部で混在
- 推奨修正: `tracking-[0.16em]` → `tracking-kicker` に一括置換 (14 箇所)

**HIGH-B-02**: Lucide `strokeWidth` が 5 段階に分散 (Phase 1 確立値 = 1.6)
- 1.4: `dashboard/page.tsx:155`, `meetings/page.tsx:524`, `step-sample.tsx:29`, `step-calendar.tsx:47`, `image-pane.tsx:117` (KPI hero / empty illust)
- 1.5: `offline/page.tsx:116`, `sentiment-chart.tsx:159`
- 1.8: `recording-skeleton.tsx` × 4, `recording-card.tsx:45,63`, `admin/users/page.tsx:225,227,243`, `confidence-badge.tsx:65`, `contacts/page.tsx:250`, `result-list.tsx:128`, `commitments-panel.tsx:152,222`, `recording-player.tsx:324,363,365`, `transcript-pane.tsx:356,366`, `upload-queue.tsx:226,233,242,249`, `upload-drop-zone.tsx:189,202`, `upload-result.tsx:40,78` (status badges)
- 2 / 2.25 / 2.5: `offline:94`, `mobile-bottom-nav.tsx:75`, `stepper.tsx:45,47`, `step-done.tsx:91,93`, `meeting-card.tsx:209`
- 推奨修正: ルール明示 — (a) 通常 UI icon = 1.6 / (b) ステッパー / nav active = 2.0+ / (c) 半透明 outline illust = 1.4。 上記のうち status badge 系の 1.8 (~25 箇所) は 1.6 へ統一を推奨

**HIGH-B-03**: 詳細ページの落款アクセント不在
- 落款がある: `/` (page.tsx:24), `/dashboard` (page.tsx:102), `/onboarding/step-done` (step-done.tsx:49), `/meetings/[id]` (page.tsx:137), `/recordings/[id]` (page.tsx:470)
- **無い**: `/contacts/[id]/review`, `/login`, `/403`, `/offline`, `/admin/users`, `/search`, `/settings/privacy`, `/contacts/import`, `/onboarding` (top), `/meetings` (list), `/recordings` (list), `/contacts` (list)
- 課題: 「詳細ページに 1 つだけ控えめに置く」のがブランド ルールであれば、`/contacts/[id]/review` (これは詳細) は揃えるべき。それ以外の list / system page は落款省略 = 妥当だが design system doc 化されていないため drift しがち
- 推奨修正: `/contacts/[id]/review` 右下 footer 付近に `<span aria-hidden title="落款" className="inkan size-6 rounded opacity-50" />` を追加。残りはルール明文化のみ (落款 = 詳細ページ専用 signature accent)

---

### MID

**MID-B-04**: `login` / `403` / `offline` の top kicker bar に `№` ナンバリングが無い
- `app/login/page.tsx:66`: `<span className="kicker">SIGN IN</span>` (左は logo)
- `app/403/page.tsx:81-82`: `<p className="kicker">アクセス制限</p> / <p className="kicker">403</p>`
- `app/offline/page.tsx:74-75`: `<p className="kicker">通信状態</p> / <p className="kicker">オフライン</p>`
- 他ページ (`/dashboard:30`, `/meetings:406`, `/contacts/[id]/review:169`, `/onboarding`, `/recordings/[id]:397`) は全て `№ 01 — ラベル` の編集的形式
- 課題: system page は意図的に番号を外しているが、ルールがコード上 / ドキュメント上に明文化されておらず drift しやすい
- 推奨修正: いずれかに揃える。a) system page も `№ — SIGN IN` 形式 b) コメントで明示 (`// system page は №採番から除外`)

**MID-B-05**: animation-delay の段階が 40 / 60 / 80 / 90 / 120 / 140 / 180 の 7 段階に分散
- 設計意図 (60/120/180/240 ladder) に対し以下が外れ値:
  - 40ms: `recordings/page.tsx:103`
  - 80ms: `page.tsx:60`, `dashboard:54`, `contacts/page.tsx:87`, `admin/users:81`, `recordings/page.tsx:135`, `upload-queue.tsx:135`, `duplicate-panel.tsx:116`
  - 90ms: `meetings/page.tsx:451`
  - 140ms: `dashboard/page.tsx:90`
- 推奨修正: 60ms 倍数 (60/120/180/240) に正規化。40ms → 60ms / 80ms → 60ms or 120ms / 90ms → 120ms / 140ms → 120ms or 180ms

**MID-B-06**: dark mode 切替 UI 不在
- `darkMode: 'class'` + `next-themes` ThemeProvider (`layout.tsx:109` `defaultTheme="system" enableSystem`) で OS 追従はする
- しかしユーザが明示切替する UI (`useTheme`) が `useTheme|setTheme` ヒット 0 件
- 課題: 業務 SaaS で OS 追従だけは仕様 として妥当だが、暗所での明示切替ニーズはある。`app-shell` の右ペイン / `/settings` に toggle 追加を検討
- 推奨修正: `components/layout/theme-toggle.tsx` を新設 + `header-nav.tsx` に icon button 追加 (Phase 3 候補)

**MID-B-07**: アプリ名表記揺れ (3 形式が混在)
- `'Knowledge Sales Platform'` (formal): `layout.tsx:54,59,79`, `manifest.ts:9`, `app-shell.tsx:49 aria-label`, `logo.tsx:27,73`
- `'ksp'` (informal): `layout.tsx:55,75`, `manifest.ts:10`, `page.tsx:17,90`, `login:62,64,117,122`, `onboarding:109`, `step-calendar:57`, `logo.tsx:75`
- `'KSP'` (大文字, comment / package のみ): `manifest.ts:4`, `logo.tsx:4`
- `@ksp/shared` (package 名)
- 課題: 文中は `ksp` 小文字、systems は `Knowledge Sales Platform`、Brand mark / comment は `KSP` という slot ルールは妥当だが、design system doc に明記すべき
- 推奨修正: `docs/brand/naming.md` を新設 — formal=Knowledge Sales Platform / wordmark=ksp / package=@ksp/* / 文中=ksp / 絶対に使わない=`Ksp` `KsP` 等

---

### LOW

**LOW-B-08**: `offline/page.tsx:116` `strokeWidth={1.5}` (1.6 が正準)
- 1 箇所のみの outlier。1.6 に修正

**LOW-B-09**: `dashboard/page.tsx:155` KPI hero icon `strokeWidth={1.4}`
- 意図的に控えめにしている可能性あり (KPI hero icon = thin = 紙感) → 仕様化して固定するかコメント追加

**LOW-B-10**: 落款のサイズ ばらつき
- `/` page.tsx:24: `size-9 rounded text-base`
- `/dashboard` page.tsx:102: `size-16 rotate-[-8deg] rounded text-2xl`
- `/onboarding/step-done`:49: `size-14 rotate-3 text-2xl`
- `/meetings/[id]` / `/recordings/[id]`: `size-6 rounded opacity-60` 程度の控えめ角丸 (詳細ページ末尾)
- 推奨: 「signature accent (size-6, opacity-50, 詳細ページ末)」と「hero accent (size-14-16, rotate, dashboard hero)」の 2 種に整理してコメント明示

**LOW-B-11**: `recording-skeleton.tsx:39` / `recording-card.tsx:28` の dark variant
- `dark:from-foreground/20 dark:to-foreground/10` を直書きしている。`foreground/85→65` の単純トーン落としだが、本来 surface トークン (`surface-raised` 等) で表現すべき。dark で foreground は cream tone なので「白濃 → 白薄」のグラデになり想定外
- 推奨: `bg-gradient-to-br from-foreground/85 to-foreground/65 dark:from-foreground/15 dark:to-foreground/8` に微調整、または `dark:from-card dark:to-surface-inset` に。

**LOW-B-12**: `text-[10px] tracking-wide` (kicker でない一般 small caps) が `recording-card.tsx:122`, `search-form.tsx:183` で混在
- これ自体は kicker でなく secondary kbd / micro label として OK だが、`tracking-wide` (0.025em) はトークン化されていない素値。`globals.css` に `.micro-label` を切り出すか / Tailwind config の letterSpacing に `micro: '0.025em'` を追加すると意図が明確化

---

## 各 grep 結果サマリ

| 検査項目 | hit 数 | 評価 |
|---|---|---|
| generic Tailwind 色 (`(sky\|emerald\|...)-N`) | **0** | 完璧 |
| 絵文字 (`U+1F300-1F9FF` / `U+2600-27BF`) | **0** | 完璧 (feedback_no_emoji_svg_only.md 遵守) |
| `text-amber` 系 (status warning) | 14 / 10 files | 仕様内 (要件: amber は status のみ可) |
| brand token (`text-cinnabar\|chitose\|ochre\|info`) 使用 | 363 / 66 files | 高密度に使用 |
| `cinnabar/N` (alpha) 派生 | 104 / 35 files | 5 / 8 / 12 / 14 / 15 / 20 / 35 / 40 / 45 / 50 / 55 等 11 段階で揺れあり → MID-B-13 として要正規化 |
| `tracking-kicker` 使用 | 4 (kicker badge のみ) | 専用 utility として使われている |
| `tracking-[0.16em]` (kicker と競合) | 14 | **HIGH-B-01** |
| `№` (numero sign) | 28 / 14 files | list / detail で `№ 01 — ラベル` 形式 |
| `inkan` クラス使用 | 6 (page / dashboard / step-done / meetings[id] / recordings[id] / globals.css) | 落款 accent は detail / hero のみ |
| `font-display` 使用 | 4 | 主に inkan 内 letter |
| `ease-sumi` 使用 | 43 | 全 transition で token 化済 |
| `animate-fade-up` / `animate-fade-in` | 約 60 | header / section level で広く適用 |
| `animation-delay:N ms` の段階 | 40/60/80/90/120/140/180 = 7段 | **MID-B-05** |
| `strokeWidth` 段階 | 1.4 / 1.5 / 1.6 / 1.8 / 2 / 2.25 / 2.5 = 7段 | **HIGH-B-02** |
| `<img>` 直書き | 0 (next/image ヒットも 0) | `image-pane.tsx` は `<img>` を avoid して `<Image>` も避けて Canvas / `<picture>` 系で処理。問題なし |
| dark mode tokens | 完全な `.dark` palette + `next-themes` | 切替 UI は **MID-B-06** で不在 |
| 落款不在の詳細ページ | `/contacts/[id]/review` (1 箇所) | **HIGH-B-03** |

---

## 改善コード提案

### 提案 1: `tracking-[0.16em]` を `tracking-kicker` に統一 (HIGH-B-01)

```diff
- // apps/web/src/app/recordings/_components/recording-card.tsx:30
- <span className="tabular text-[10px] uppercase tracking-[0.16em] text-background/65">
+ <span className="tabular text-[10px] uppercase tracking-kicker text-background/65">
```

同様に `recording-card.tsx:44,52,69` と `recording-skeleton.tsx:41,44,51,81,130,133,139,144` (合計 14 箇所) を `tracking-[0.16em]` → `tracking-kicker` で sed 一括置換。

### 提案 2: 落款 signature を `/contacts/[id]/review` に追加 (HIGH-B-03)

```diff
  // apps/web/src/app/contacts/[id]/review/page.tsx 末尾、</main> の直前
+ {/* 落款 (inkan accent) — 編集媒体の締めとして cinnabar の薄い角丸方形 */}
+ <div className="flex justify-end mt-8" aria-hidden>
+   <span
+     title="落款"
+     className="inkan size-6 rounded opacity-50"
+   />
+ </div>
```

`/meetings/[id]/page.tsx:137-143` の既存実装をそのまま流用するのが安全。

### 提案 3: `strokeWidth` 正規化 (HIGH-B-02 partial)

`status badge` 系の `1.8` を `1.6` に統一する一括例:

```diff
- // apps/web/src/app/contacts/import/_components/upload-queue.tsx:226
- <AlertTriangle aria-hidden strokeWidth={1.8} className="size-3.5" />
+ <AlertTriangle aria-hidden strokeWidth={1.6} className="size-3.5" />
```

合計 25+ 箇所だが mechanical な置換で済む。例外として `stepper.tsx`, `mobile-bottom-nav.tsx`, `recording-player.tsx` の play / pause は太め (2.0-2.25) を維持 (タップターゲットとして強調)。

### 提案 4: animation-delay ladder 正規化 (MID-B-05)

```diff
- // apps/web/src/app/dashboard/page.tsx:90
- className="... animate-fade-up [animation-delay:140ms]"
+ className="... animate-fade-up [animation-delay:180ms]"

- // apps/web/src/app/meetings/page.tsx:451
- className="... animate-fade-up [animation-delay:90ms] space-y-3"
+ className="... animate-fade-up [animation-delay:120ms] space-y-3"

- // apps/web/src/app/recordings/page.tsx:103
- className="... animate-fade-up [animation-delay:40ms]"
+ className="... animate-fade-up [animation-delay:60ms]"
```

合計 9 箇所を 60ms 倍数に揃える。

### 提案 5: `letterSpacing.kicker-tight` token を Tailwind config に追加 (HIGH-B-01 補強)

もし「`0.16em` という値が実は意図的」だったケースに備え、token 化して可視化:

```diff
  // apps/web/tailwind.config.ts:223-227
  letterSpacing: {
    'crisp': '-0.018em',
    'editorial': '0.06em',
+   'kicker-tight': '0.16em',
    'kicker': '0.18em',
  },
```

その上で `tracking-kicker-tight` を使うか、不要なら値ごと削除して `tracking-kicker` に統一する判断を design owner に投げる。

### 提案 6: dark mode toggle UI (MID-B-06)

```tsx
// apps/web/src/components/layout/theme-toggle.tsx (新規)
'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`${next === 'dark' ? '夜間モード' : '昼間モード'}に切替`}
      onClick={() => setTheme(next)}
      className="inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-fast ease-sumi focus-visible:outline-none focus-visible:shadow-focus-ring"
    >
      {resolvedTheme === 'dark'
        ? <Sun aria-hidden strokeWidth={1.6} className="size-4" />
        : <Moon aria-hidden strokeWidth={1.6} className="size-4" />}
    </button>
  );
}
```

`components/layout/app-shell.tsx` の header 右側に配置。

---

## 結論

ブランドの **基幹** は強固 (generic 色 0 / 絵文字 0 / brand token 365 hit / `.inkan` / `.kicker` / `.section-no`
class 設計 / dark palette 完備)。主たる drift は **kicker letter-spacing 14 箇所** と **strokeWidth 30+ 箇所**
の "近似値の混在" で、いずれも mechanical な一括置換で 1 PR にまとまる。落款不在は実害 1 箇所のみ。
dark toggle UI は Phase 3 候補で問題なし。

R1 → R2 で **95+ 到達** は HIGH-B-01 / HIGH-B-02 partial / HIGH-B-03 の 3 件を片付ければ達成見込み。
