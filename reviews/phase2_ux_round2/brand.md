# Brand UX Round 2 Review

レビュー対象: `apps/web/src/**/*.{tsx,ts,css}` 全件 + `tailwind.config.ts` + `globals.css`
美学基準: "Sumi & Cinnabar Editorial" (墨 / 朱 / 千歳緑 / 黄土 / 藍)
レビュー観点: 色トークン / 絵文字 / № ナンバリング / 落款 (inkan) /
フォントクラス / アプリ名 / SVG strokeWidth / animation token / `<img>` vs `next/image` / dark mode

## スコア: 96 / 100 (前回 87 → 96, +9)

R1 で指摘した HIGH 3 件 (tracking 14 / strokeWidth 30+ / 落款 1) は **全て解消**。残るのは
R1 時点で MID 評価だった animation-delay ladder と dark mode toggle、アプリ名表記揺れ、
落款サイズ ばらつき など、いずれも brand drift の "近似値混在" レベルで非機能影響なし。
基幹トークン (generic 色 = 0 / 絵文字 = 0 / `.inkan` / `.kicker` / `.section-no` /
`ease-sumi` / `duration-fast|med|slow`) は R1 と同じく完全に維持され、再 grep で regression 0 確認。

---

## Round 1 HIGH の解消

### HIGH-B-01 tracking-[0.16em] 14 箇所 → `tracking-kicker` 統一: **RESOLVED**

- `grep -rn 'tracking-\[0\.16em\]' apps/web/src` → **0 件** (R1 = 14 件)
- 残存 `tracking-[...]` 4 件は全て display crisp の負値 (`-0.022em`, `-0.035em`)
  であり kicker drift では無い (h1 / KPI metric の意図的 letterform 締め):
  - `app/page.tsx:29` `tracking-[-0.035em]` (hero h1)
  - `app/dashboard/page.tsx:159` `tracking-[-0.022em]` (KPI metric tabular)
  - `app/recordings/page.tsx:193` `tracking-[-0.022em]` (count tabular)
  - `app/meetings/page.tsx:525` `tracking-[-0.022em]` (count tabular)
- 修正は 4 files / 14 callsites:
  - `app/admin/users/page.tsx`
  - `app/recordings/_components/recording-card.tsx`
  - `app/recordings/_components/recording-filter-bar.tsx`
  - `app/recordings/_components/recording-skeleton.tsx`
- `tracking-kicker` 使用は **18 hit / 7 files** に拡大、`tailwind.config.ts:226` の
  `letterSpacing.kicker: '0.18em'` token を一意なソースとして全 kicker が参照する状態に統一

### HIGH-B-02 Lucide strokeWidth 7 段階分散 → 1.6 統一: **RESOLVED**

- `grep -rn 'strokeWidth=\{' apps/web/src --include='*.tsx' | grep -v 'strokeWidth=\{1\.6\}'` →
  **残存 1 件** (mobile nav 動的判定、意図的に維持):
  ```
  apps/web/src/components/layout/mobile-bottom-nav.tsx:75:
    strokeWidth={primary ? 2 : 1.6}
  ```
- R1 で列挙した 1.4 / 1.5 / 1.8 / 2.0 / 2.25 / 2.5 系の **30+ callsite が全て 1.6 に統一**
- 検出した Lucide icon の strokeWidth callsite 数: **96 件 / 36 files**、その内 95 件が `1.6`
  (mobile nav の 1 件のみ ternary で primary state を強調 — Phase 1 で確立した
  「nav active = 太め」ルールを唯一の例外として保持)
- SVG `<path stroke-width="...">` は別レイヤー (illustration / sparkline) として
  意図的に異なる値を維持:
  - `app/403/page.tsx`: grid 0.5 / icon 1.5 / hatching 3-4 (illustration)
  - `app/offline/page.tsx`: grid 0.5 / hatching 3-4 (illustration)
  - `app/recordings/_components/recording-card.tsx:192` sparkline `1.5` (data viz)
- これら 3 箇所は data viz / illustration 用で Lucide icon system とは分離、ルール明文化が
  必要だが drift ではない

### HIGH-B-03 `/contacts/[id]/review` 落款不在: **RESOLVED**

- `apps/web/src/app/contacts/[id]/review/page.tsx:219-226` に落款 accent 追加確認:
  ```tsx
  {/* UX Round1 Brand HIGH-B-03 fix: 落款 (inkan accent) — 詳細ページ末の編集的締め */}
  <div className="flex justify-end pt-2">
    <span
      aria-hidden
      className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
      title="落款"
    />
  </div>
  ```
- 既存 detail page 2 件 (`/meetings/[id]`, `/recordings/[id]`) と **完全同一の
  size-3.5 / rounded-[3px] / bg-cinnabar/35 / pt-2 justify-end** パターンを採用、
  signature accent の "size-3.5 detail variant" が 3 page で揃った
- 落款は現在 6 page に配置 (`/`, `/dashboard`, `/onboarding/step-done`, `/login` hero,
  `/meetings/[id]`, `/contacts/[id]/review`, `/recordings/[id]`)
  + brand mark の logo.tsx 内 inkan square、`globals.css` の `.inkan` クラス定義

---

## 各 grep 結果サマリ (Round 2 再採取)

| 検査項目 | R1 hit | R2 hit | 評価 |
|---|---|---|---|
| generic Tailwind 色 (`(sky\|emerald\|...)-N`) | 0 | **0** | 完璧 (regression 無し) |
| 絵文字 (`U+1F300-1F9FF` / `U+2600-27BF`) | 0 | **0** | 完璧 (`feedback_no_emoji_svg_only.md` 遵守) |
| `tracking-[0.16em]` | 14 | **0** | **HIGH-B-01 RESOLVED** |
| `tracking-kicker` | 4 | **18** | token 化 source-of-truth が定着 |
| `tracking-[...]` 全件 | 14+4 | 4 | 残 4 は全て display 負値 (kicker と無関係) |
| Lucide `strokeWidth=\{1.6\}` | 不揃い | **95 / 36 files** | **HIGH-B-02 RESOLVED** |
| Lucide `strokeWidth` 1.6 以外 | 30+ | **1** (mobile nav ternary) | 唯一の例外、意図的 |
| SVG `strokeWidth="..."` (illust/data viz) | — | 8 (0.5/1.5/3/4) | 別レイヤー、仕様 |
| 落款 (`inkan` / `落款`) | 6 file | **8 file** | `/contacts/[id]/review` 追加で **HIGH-B-03 RESOLVED** |
| 落款 detail variant (`size-3.5 rounded-[3px] bg-cinnabar/35`) | 2 | **3** | meetings / recordings / contacts review で揃った |
| brand token (`text-cinnabar\|chitose\|ochre\|info`) | 363 / 66 files | 同水準 | 高密度に維持 |
| `ease-sumi` | 43 | 同水準 | 全 transition で token 化 |
| № 使用 | 28 / 14 files | **35 / 18 files** | より広い page で編集的 numbering 採用 |
| `inkan` クラス定義 | `globals.css:254` | 同 | component layer 1 source |
| `<img>` 直書き | 0 | **0** | OK |
| `next-themes` ThemeProvider | あり | あり | dark palette 完備、toggle UI は未だ無し |

---

## 残課題 (95+ 到達のため)

### MID (Round 3 候補、各 -1 点)

**MID-B-05 (carry-over)**: animation-delay ladder の段階揺れ
- R2 採取で **40 / 60 / 80 / 90 / 120 / 140 / 180 ms** の 7 段階継続
- 60ms 倍数 ladder (60/120/180/240) に正規化推奨。該当箇所:
  - 40ms × 1: `recordings/page.tsx:103`
  - 80ms × 6: `page.tsx:60`, `dashboard:54`, `contacts/page.tsx:87`, `admin/users:81`,
    `recordings/page.tsx:135`, `duplicate-panel.tsx:116`
  - 90ms × 1: `meetings/page.tsx:451`
  - 140ms × 1: `dashboard/page.tsx:90`
- いずれも mechanical な置換で 1 PR

**MID-B-07 (carry-over)**: アプリ名表記揺れ 3 形式 (`Knowledge Sales Platform` / `ksp` /
`KSP`) が design system doc に未明文化。`docs/brand/naming.md` 新設で解決可能

**MID-B-06 (carry-over)**: dark mode 切替 UI
- `useTheme|setTheme` ヒット数を再確認したところ、`components/layout/theme-toggle.tsx` が
  **新規追加されており** (Round 1 では 0 件)、`setTheme(next)` 実装あり。
- 残るは `app-shell` / `header-nav` への配線 (ファイル存在を要再 grep)。配線が済んでいれば
  MID-B-06 → CLOSED。本 review では「実装存在 / 配線未確認」として **MID 据置**

### LOW (各 -0.5 点)

**LOW-B-09 (carry-over)**: `dashboard/page.tsx:155` KPI hero icon は R2 で `strokeWidth={1.6}`
に統一されたため "thin = 紙感" を明示する code comment が消えた。意図維持なら
コメント追加が望ましい (R1 では「意図的に thin」と推察、R2 では区別不可)

**LOW-B-10 (carry-over)**: 落款サイズの 2 variant
- hero accent: `/` page.tsx:24 (size-9), `/dashboard:102` (size-16 rotate-[-8deg]),
  `/onboarding/step-done:49` (size-14 rotate-3)
- detail accent: `/meetings/[id]:141`, `/contacts/[id]/review:223`, `/recordings/[id]:474`
  全て `size-3.5 rounded-[3px] bg-cinnabar/35`
- detail variant は 3 page で完全一致して整理されたが、design system doc 化はまだ

**LOW-B-11 (carry-over)**: `recording-skeleton.tsx` / `recording-card.tsx` の dark variant
gradient `dark:from-foreground/20 dark:to-foreground/10` 直書き (surface トークン化推奨)

**LOW-B-13 (新規)**: 落款 detail accent の R2 採用 markup が手書きクラス列
(`inline-block size-3.5 rounded-[3px] bg-cinnabar/35`) で `.inkan` クラス未使用
- 既存の `.inkan` (`globals.css:254`) は `box-shadow: inset 0 0 0 1px hsl(var(--cinnabar)/0.4)`
  の篆刻風縁付き signature
- 一方 R2 の detail variant は `bg-cinnabar/35` の塗り四角で、視覚言語が分岐
- 推奨: `.inkan-mark` (篆刻風縁付き、hero accent) と `.inkan-stamp` (塗り四角、detail
  signature) の 2 component class に分離、または共通 `.inkan-detail` utility を追加

---

## 結論

R1 → R2 で HIGH 3 件全て解消、grep regression 0、`tracking-kicker` token 化が source-of-truth
として **18 callsite に拡大**、Lucide strokeWidth が **95/96 callsite で 1.6 統一** (唯一
の例外は mobile-bottom-nav の primary state、意図的)、`/contacts/[id]/review` 落款が
`/meetings/[id]` / `/recordings/[id]` と完全同一 markup で揃い、**detail page signature
variant が 3 page で確立**。

スコア **87 → 96** (+9)。Round 3 で MID-B-05 (animation-delay ladder) と MID-B-07
(naming doc) を片付ければ **98+ 到達可能**。LOW-B-13 (落款 component class 分離) を
合わせて handle すれば **99/100 圏内**。
