# UX / Design Round 2 Review — Phase 2

## スコア: Visual 96 / Mobile 94 / Brand 96  (平均 95.3)
## 前回: Visual 89 / Mobile 86 / Brand 87 → 改善幅 +7 / +8 / +9

Round 1 で指摘した 3 つの HIGH (palette 純度 / 編集トーン / 採番) と 4 つの MID は概ね解消され、Phase 1 Round 3 で確立した「Sumi & Cinnabar Editorial」の 3 大 brand asset (5-color palette / ページ内 №01 起点採番 / inkan 落款) が Phase 2 にも継承された。grep 横断で `sky / emerald / violet / rose / indigo / teal / orange / pink` の generic Tailwind 色は UI コードからゼロ検出、`data-sc-code / data-task-code` も DOM から完全除去、`deal_status` という英語列名の UI 露出も 0 になっている。残るは MID-U-02 (`-5s/+5s` と kanban drag handle の 44px 未達) と LOW-U-01 (meeting-filter-bar の focus ring 一段化) の 2 点と、サンプル badge の card 系コンポーネントへの統一波及だけで、いずれも 1 観点あたり -1〜2 点に収まっている。

---

## Round 1 HIGH/MID の解消状況

### HIGH-U-01 5-color palette 純度: **RESOLVED**

- `recording-player.tsx:42-55` の `SPEAKER_PALETTE` が **cinnabar / chitose / info / ochre / cinnabar (deep) / foreground muted** の brand 5 色シェードに完全に置換された。コメントも「朱 → 千歳緑 → 藍 → 黄土 → 落款濃朱 → 墨 muted の順で巡回。generic Tailwind カラーは禁則」と意図が明文化されており、後続の拡張で再発を防ぐ docstring が立っている。
- `commitments-panel.tsx:136, 207, 253-255`: 完了帯 `bg-chitose-muted/60 dark:bg-chitose/15`、`text-chitose`、最終 output `border-chitose/40 bg-chitose-muted/70 text-chitose` で完全に chitose 系に統一。emerald は全廃。
- `recording-detail-client.tsx:178`: 「ぜんぶ完了しました」output が `text-chitose border-l-2 border-chitose pl-3` の縦線一本構造で chitose 単色に。
- grep 確認: `apps/web/src` 全体で `sky-/emerald-/violet-/rose-/indigo-/teal-/orange-/pink-(50..950)` は **0 件検出**。

### HIGH-U-02 編集媒体トーン浄化: **RESOLVED**

- `meeting-filter-bar.tsx:135, 154`: `aria-label="商談ステージで絞り込み"`、`aria-label="案件の状態で絞り込み"` に完全日本語化。`「全 deal_status」` という UI label も「全ての状態」に書き換え済み (`DEAL_STATUS_OPTIONS:39-45`)。日本語の中に英語列名が露出する箇所は UI コードから消えた。
- `data-sc-code / data-task-code` は `placeholder.tsx` を含む全 UI ファイルから 0 件 (grep 確認)。`PagePlaceholder` の docstring に「scCode は採番ロジック用にだけ受け取り、DOM には出さない」と仕様が明記された。
- `meetings/[id]/page.tsx:57` の `view.id.slice(0, 8)` の UUID hex 露出は撤去され、`SectionLead` による「商談の表紙 / AI が読み解いた中身 / 約束と次の一手」の編集的セクション見出しに置換された。
- 残る `slice(0,8)` 系は (a) onboarding の同意 hash (sha256 を編集的に短縮) と (b) recordings/[id]/page.tsx:361 の zoom_recording_id が null の場合の `录画 XXXXXXXX` フォールバック、(c) transcript-pane の React key 用で、どれも本指摘とは無関係。

### HIGH-U-03 編集的ナンバリング: **RESOLVED**

詳細ページ 2 つの内部構造が完全に編集章立てに変わった:

| ページ | 採番 | 結果 |
|---|---|---|
| `/recordings/[id]` (page.tsx:397) | **№ 01 — 営業 / 録画 詳細** | ✓ 自分自身 №01 起点 |
| `/recordings/[id]` `recording-detail-client.tsx:115, 133, 143, 157, 169` | **№ 02 — 再生**、**№ 03 — 感情の起伏**、**№ 04 — 発言録**、**№ 05 — AI 解析**、**№ 06 — 約束と次のアクション** | ✓ 順番に連番、重複なし |
| `/meetings/[id]` (page.tsx:53) | **№ 01 — 営業 / 商談 詳細** | ✓ 自分自身 №01 起点 |
| `/meetings/[id]` SectionLead × 6 + 末尾 handoff | **№ 02 商談の表紙 / № 03 AI が読み解いた中身 / № 04 約束と次の一手 / № 05 関連する人と録画 / № 06 現場メモ / № 07 ステージの軌跡 / № 08 引き継ぎ** | ✓ 8 章まで一気通貫 |

ハードコード №15 / №16 は撤去され、editorial chapter のメタファが復活した。Phase 1 哲学「ページ内 №01 起点」が両詳細ページで完全継承。

### MID-U-01 サンプル badge 統一: **PARTIAL**

- 詳細 hero (`recordings/[id]/page.tsx:483-491` / `meetings/[id]/page.tsx:159-167`) に **`SampleBadge` / `MeetingSampleBadge`** が新設され、両者とも `border-dashed border-cinnabar/35 bg-cinnabar/5 text-cinnabar text-[10px] tracking-kicker uppercase` の Phase 1 美学準拠の 1 種類に統一された。
- 一方、`meeting-card.tsx:170-176` カンバンカード内の "サンプル" pill が依然として `border-foreground/15 bg-surface-inset/60 text-muted-foreground` の **墨グレートーン**、`recording-card.tsx:34-38` も **`border-background/30 bg-background/10` の glass treatment** で残置。詳細ページのみ統一が完了し、card 系コンポーネントには波及していない。
- → 詳細ページの 1 種類で確立した style token を card にも適用すれば全件統一になる (-1 点。詳細ヘッダの統一だけで主要視認動線の 80% は救えているので大きく減点しない)。

### MID-U-02 タッチ領域 44×44: **PARTIAL**

- `meeting-filter-bar.tsx:221, 232` の検索 / クリアボタンが `h-11 md:h-9` (モバイル時に 44px、デスクトップで 36px) に修正済 ✓
- `meeting-filter-bar.tsx:137, 156, 175, 194, 205` の全 select と date input も `h-11` に統一 ✓
- 一方、`recording-player.tsx:369-385` の **`-5s/+5s` ボタンは `size="sm"` のまま** (Button variant の sm は h-9 想定なので 36px、44px 未達)。
- `meeting-card.tsx:137` のカンバン **ドラッグハンドル** も `size-6` (24×24px) のまま。Round 1 で「size-11 に」と指摘した箇所が未対応。
- transcript-pane の timestamp button は段落全体クリックではないものの hover/active 表示は維持されており実用上は問題ないが、行内タップ範囲は依然小さい。
- → 主要 filter bar は救えたが、再生コントロールと kanban drag handle の 2 つが残存。Mobile -2 点。

### MID-U-03 kanban モバイル横スワイプ: **RESOLVED**

- `kanban-board.tsx:188-201` が `flex sm:grid` + `snap-x snap-mandatory sm:snap-none` + `touch-pan-x` + 各列 `w-[82vw] sm:w-auto shrink-0 snap-start` で完全に Linear iOS kanban パターンに到達。
- 親 `<ol>` に `-mx-4 px-4` で gutter を確保、`overflow-x-auto sm:overflow-visible` で sm 以上は通常 grid に切替、`aria-label / aria-describedby` も保持。
- sticky header の `top-[calc(var(--app-header-h)+env(safe-area-inset-top))]` も維持されており、横スワイプ中も列ヘッダが見切れない。

### MID-U-04 落款 (inkan) accent: **RESOLVED (控えめ実装)**

- `recordings/[id]/page.tsx:471-476` 末尾と `meetings/[id]/page.tsx:137-143` 末尾の両方に `<span aria-hidden className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35" title="落款" />` が追加された。`bg-cinnabar/35` (=opacity 35%) という極めて控えめな朱の小角丸方形で、Phase 1 Dashboard hero の `size-16 rotate-[-8deg] inkan` のような派手な落款ではなく、**編集媒体の末尾に押されたミニ落款**として「読み終わり」を示唆する設計。
- 「派手すぎず」「Phase 1 brand asset の継承」「`aria-hidden` で SR ノイズなし」のバランスは適切。`title="落款"` でホバー時にだけ意味が顕在化する仕掛けも編集的。
- ロゴ (`components/brand/logo.tsx`) では従来通り朱濃淡の正式 inkan を使用し、ページ末では 35% 透過の控えめ accent — 役割の分担が成立している。

---

## 残課題

### 残 HIGH: なし

### 残 MID (最大 3 件)

1. **MID-U-02 (残置半分) - 再生コントロール / kanban drag handle の 44px**: `recording-player.tsx:369-385` の `-5s/+5s` を `size="default"` (h-11) または carry-over の専用 `size-11` ボタンに、`meeting-card.tsx:137` の `size-6` ドラッグハンドルを `size-11` に拡大する。モバイルでの実用タップ精度に直結。
2. **MID-U-01 (残置半分) - card 系のサンプル badge 統一**: `meeting-card.tsx:170-176` と `recording-card.tsx:34-38` の "サンプル" pill を、詳細ヘッダで確立した `border-dashed border-cinnabar/35 bg-cinnabar/5 text-cinnabar` 1 種類に揃える。詳細⇄一覧で同じ語彙の bo trip 感が出ない。
3. **LOW→MID 昇格候補: meeting-filter-bar の focus ring 一段化**: `meeting-filter-bar.tsx:138, 157, 176` の全 select で `focus-visible:border-ring` のみ。`recording-filter-bar.tsx` 側で使われる二段 `shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]` に揃えれば Phase 1 focus ring 言語が完全統一する。

### 残 LOW

- `transcript-pane.tsx:233-243` の timestamp button を行全体クリック領域化する (Round 1 LOW-U-02 残置だが、行 hover トーン自体は維持されておりタップ自体は可能なので低優先度)。
- `recordings/[id]/page.tsx:361` の `录画 ${id.slice(0, 8)}` フォールバック表題は zoom_recording_id が null のレアケースのみで発火し、`录画 a1b2c3d4` のような UUID hex を見せる可能性が残る → `录画 (ID 未取得)` の方が編集トーンに合う。
- Round 1 LOW-U-03 KeyHints 共有コンポーネント化は未着手だが、Phase 1 設計を Phase 2 で機能拡大している段階としては OK で、後続 Phase 3 で切り出すのが自然。

---

## 美学整合 update

### 墨 × 朱: **完成度向上**
- speaker palette が **cinnabar / chitose / info / ochre / cinnabar-deep / foreground muted** の純度 100% に到達。Phase 1 Round 3 で `--info` を 215→204 にシフトしてまで作った「和の 5-color editorial palette」がそのまま Phase 2 の話者ラベル / 完了帯 / sentiment chart / pulse-ink で再生されている。
- 完了状態の chitose 統一 (commitments-panel `bg-chitose-muted/60` + `text-chitose`) で「達成 = 千歳緑 (chitose-deep)」「未達 / 主役 = 朱 (cinnabar)」「機微 = 藍 (info)」という brand 意味分離が確定。

### 編集的 №: **完成度向上**
- `/recordings/[id]` №01-06、`/meetings/[id]` №01-08 とどちらも自分自身の中で連番 ✓
- 重複なし、欠番なし、順番乱れなし (grep で各ページ内の `№ NN` を全て確認済)。
- editorial chapter のメタファが Phase 1 Dashboard → Phase 1 List → Phase 2 Detail まで継承。

### 落款 accent: **新規導入**
- ロゴ (rotate-8 inkan) / Dashboard hero (size-16 落款) / 詳細ページ末 (size-3.5 35% 透過落款) の 3 段階の落款語彙が定義された。ページ末ミニ落款は控えめだが、`title="落款"` で hover 時に意味が現れる「編集媒体の終わり」サイン。
- step-done (onboarding 完了) / page.tsx (root marketing) も既存 inkan を使用しており、Phase 1 + Phase 2 のサイト全体で inkan が「節目 (=完了 / セクション末 / brand mark)」を意味する一貫した brand asset に。

### 絵文字漏れ: **継続でゼロ**
- 修正ファイル群を含む全 UI コードで絵文字 (U+1F300-1FAFF / U+2600-27BF) 0 件 (grep 確認)。
- Lucide icon のみで貫徹。

### display / tabular / kicker / hairline / animate-*: **継続で適合**
- `border-t-2 border-foreground pt-3 animate-fade-in` の page entry が変更後も維持。
- `SectionLead({no, label})` (`meetings/[id]/page.tsx:150-156`) という共有関数が新規導入され、`kicker -mb-4 mt-0` で hairline 直前にセクション見出しを置く編集レイアウトが固定化された。Phase 3 で他ページにも展開可能な良パターン。

---

## 判定: **PASS (Round 3 は任意 polish)**

Round 1 HIGH 3 件は全て RESOLVED、MID 4 件中 2 件 RESOLVED + 2 件 PARTIAL に到達。「Phase 1 で禁欲的に絞り込んで 96 点に押し上げた 3 大 brand asset」(5-color palette / №01 起点採番 / inkan 落款) が Phase 2 にも継承され、平均 95.3 点で Round 2 目標の **95+** に到達。

残る 3 残課題 (`-5s/+5s` と drag handle の 44px、card 系サンプル badge 統一、filter-bar focus ring 一段→二段) はいずれも -1〜2 点 / 観点の polish レベル。これらを Round 3 で消化すれば Phase 1 Round 3 と同じ Visual 97 / Mobile 96 / Brand 97 (平均 96.7) に到達可能だが、Phase 2 として Phase 1 と同等の品質クラスに既に達しているので、**Round 3 は必須ではなく任意 polish** という位置づけ。
