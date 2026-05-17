# UX / Design Round 1 Review — Phase 2 (Contacts Import / Review・Search・Recordings・Meetings)

## スコア: Visual 89 / Mobile 86 / Brand 87  (平均 87.3)

Phase 1 Round 3 で 96/100 (visual) に到達した "Sumi & Cinnabar Editorial" の骨格 (border-t-2 ヘッダ / kicker / display + tracking-crisp / hairline / animate-fade-up / cinnabar pulse-ink) は Phase 2 の 4 機能 × 約 40 ファイルすべてで丁寧に踏襲されている。Lucide icon のみ・絵文字ゼロ・degrade メッセージの amber/cinnabar 和トーン・aria-live + role 完備という基礎品質は揃っており、shadcn テンプレ感は皆無。ただし機能数が一気に増えた結果、「Phase 1 で禁欲的に絞り込んだ 5-color パレット」「ページ毎の №01 起点採番」「落款 accent」という Phase 1 で得た３つの brand asset が **HIGH レベルで局所的に崩れている**。Round 2 で 95+ 到達は十分可能だが、Round 1 段階では「美しいが、Phase 1 ほど一貫していない」段階。

---

## 強み (Phase 1 美学の継承で特筆すべき箇所)

- **全 4 機能のページ entry が完全同型**: `border-t-2 border-foreground pt-3` + `kicker (№ NN — ドメイン)` + 右側 `kicker tabular` (件数 or 時刻) + 続く `display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance` という Phase 1 確立パターンが contacts/import (`page.tsx:14-37`)、search (`page.tsx:302-317`)、recordings (`page.tsx:75-97`)、meetings (`page.tsx:385-401`) で寸分違わず再生されている。"知らずに開いても 1 秒で KSP" の brand recognition が機能している。
- **degrade message の落ち着き**: search の amber `<output aria-live="polite">` (`search/page.tsx:343-354`)、recordings の `bg-cinnabar` 1.5px dot 付き静かな pill (`recordings/page.tsx:91-96`)、kanban の `<output id={announceId} aria-live="polite">` (`kanban-board.tsx:284-286`) — どれも「赤バナーで脅さず、和紙の上のメモとして添える」哲学を維持。
- **`UploadDropZone` の cinnabar pulse-ring** (`upload-drop-zone.tsx:111-118`): drop された瞬間に `key` を更新して `shadow-cinnabar-glow animate-fade-in` を一発光らせる仕掛けは、Dashboard hero の inkan glow と完全に同じ言語。
- **`ConfidenceBadge` の 3 段階トーン分離** (`confidence-badge.tsx:22-41`): 高 = chitose、中 = amber、低 = cinnabar。"信頼度が低いほど印鑑色 (主役色) で目立つ" 逆転設計が editorial として優秀。
- **`recording-player.tsx` の中央 Play ボタン** (`recording-player.tsx:314-335`): `bg-cinnabar text-cinnabar-foreground shadow-cinnabar-glow size-16` の落款めいた朱の円形が真ん中に座る hero treatment。Phase 1 Dashboard inkan の文法。
- **kanban DnD announcer** (`kanban-board.tsx:67-71, 97, 139, 158, 168, 178, 284-286`): `@dnd-kit` を新規追加できない制約下でブラウザ標準 `draggable` に倒しつつ、`sr-only aria-live="polite"` + 1.5 秒のクリア timer で「拾った」「移動先候補」「失敗してロールバック」を読み上げる実装は spec 仕様レベル。

---

## 改善余地 (HIGH / MID / LOW)

### HIGH-U-01: 5-color editorial palette の純度破壊 (Brand -7)

Phase 1 Round 3 で確立した KSP 固有 5 色 (墨 / 朱 / 千歳緑 / 藍 / 黄土) の外側にある **generic Tailwind 色** が Phase 2 で多発:

- `recording-player.tsx:36-63` `SPEAKER_PALETTE` に **`sky-500 / emerald-500 / violet-500 / rose-500`** の 4 色を含む。recharts でも `commitments-panel.tsx` 完了帯が `bg-emerald-50/60 dark:bg-emerald-500/[0.10]`、`recording-detail-client.tsx:170` の "ぜんぶ完了しました" output も `border-emerald-500 text-emerald-900` (素の emerald)。
- 商談詳細 `commitments-list.tsx` も `error` が `text-destructive` (cinnabar との H 距離 8°) と意味分離が弱い。
- 商談一覧 `KpiStat` (`recordings/page.tsx:159-199`) の Loader2 が `text-cinnabar`、success は `text-chitose` で OK だが、HandoffDialog 完了で emerald に切り替わる。

→ Round 3 で得た "shadcn 派生品ではない、和の 5-color editorial palette" の純度が崩れる。
**対策**: speaker palette は `cinnabar / chitose / ai / ochre / sumi-muted / cinnabar-deep` の brand 5 色シェードに置換。完了状態は全て `chitose` 系に統一 (emerald 系全廃)。recharts の sentiment-chart は既に cinnabar 単色で正しい。

### HIGH-U-02: 編集媒体トーンに DB 列名 / チケット番号 / UUID hex が露出 (Brand -6)

- `meeting-filter-bar.tsx:39-45, 154`: `「全 deal_status」`、`aria-label="deal_status で絞り込み"` ← 日本語の中に英語列名がそのまま露出。「商談状況」「実施状態」が正解。
- `contacts/import/page.tsx:14` `data-sc-code="SC-06" data-task-code="T-007"` ← 開発用 attribute が DOM に残置。
- `meetings/[id]/page.tsx:57` の右側に `view.id.slice(0, 8)` で UUID 先頭 8 文字 hex (`a1b2c3d4`) が裸出。ユーザは見て何の意味も持てない。
- `recordings/[id]/page.tsx:397` `№ 16 — 営業 / 録画` の "16" がページ単独で開かれた時に **何の根拠もない数字** として目に入る (後述 HIGH-U-03 と連動)。

**対策**:
- `deal_status` 系 UI 文言を「商談状況」(=stage)「案件結果」(=deal_status) のように日本語化、aria-label も同じく。
- `data-sc-code` 等は CI で `process.env.NODE_ENV === 'production'` 時に除去。
- 商談 ID は表示しない、または「商談 #1234」のような採番カウンタ列を追加。
- recordings detail の "№ 16" は HIGH-U-03 で扱う。

### HIGH-U-03: 編集的ナンバリングの不統一 (Visual -5)

Phase 1 哲学は「ページ毎に №01 から積み上げる editorial 採番」。Phase 2 で 3 系統が混在:

| ページ | 採番方式 | 問題 |
|---|---|---|
| `/dashboard` `/contacts` `/contacts/import` `/search` `/recordings` `/meetings` | **ページ内 №01 起点** ✓ | 正しい |
| `/recordings/[id]` `/meetings/[id]` | **ハードコード №15 / №16** (グローバル通し番号風) | リンクで来た時に根拠不明 |
| `/meetings/[id]` 内のセクション | **採番なし** (AiSummaryPanel / CommitmentsList / StageHistory 全部無番) | 一覧 (№01-06 振り済) との non-consistency |

→ "globally numbered editorial chapter" を狙っているなら full path で №01 から振り直し、章立てメタファーとして全 sitemap を採番する必要があるが、現状はハードコード 15/16 が孤立。

**対策**: 詳細ページは「親の通し採番に従う」ではなく「自分自身の中で №01 起点」に統一。`/recordings/[id]` を `№ 01 — 営業 / 録画` に、`/meetings/[id]` を `№ 01 — 営業 / 商談` に変更。詳細ページ内のセクション (`AiSummaryPanel`, `CommitmentsList`, `RelatedRecordings`, `StageHistory`, `HandoffDialog`) には `№ 02-07` の章番号を付与し、`/meetings` 一覧 (`№ 02-06` で番号済み) と同等の editorial 密度を達成。

### MID-U-01: 空状態 / サンプル表示の温度差

3 系統が並存している:

- `recordings/page.tsx:91-96`: `bg-cinnabar` 1.5px dot + 静かな pill → Phase 1 美学に最も近い ✓
- `recordings/[id]/page.tsx:407-414`: `bg-amber-100/60 dark:bg-amber-500/20 text-amber-900 border-amber-400/40` (amber)
- `meetings/[id]/page.tsx:55`: `kicker tabular text-cinnabar` "サンプル" (テキストのみ)
- `recording-card.tsx:34-38`: `border-background/30 bg-background/10` (背景の glass treatment、tone 全く違う)

**対策**: 全 "サンプル" badge を「`bg-cinnabar` 1.5px dot + kicker tabular pill」の 1 種類に統一 (Phase 1 で確立済の Dashboard 哲学)。

### MID-U-02: タッチ領域 44×44 未達 (Mobile -4)

WCAG 2.5.5 (Target Size, Level AAA) 推奨 44×44px に届かない要素:

- `meeting-card.tsx:133-147` ドラッグハンドル: `size-6` (24px) → kanban の主要操作なのに親指で押せない。
- `recording-player.tsx:386-394` `-5s/+5s` ボタン: `size="sm"` のテキスト → モバイル動画 scrubbing で誤タップ多発予想。
- `transcript-pane.tsx:233-243` timestamp button: `w-12` で text-[11px]、行間 `gap-3 p-2.5` → 1 発言あたり タップ範囲 12×16 程度。
- `recording-filter-bar.tsx` `clear` button: `h-9 px-2.5` → 36×36。

**対策**: kanban ハンドルは `size-11` (44px) に、`-5s/+5s` は `size="default"` (h-11) に、timestamp button は親 `<li>` 全体をクリック領域化 (button を li にラップ)。filter clear は `h-11` に。

### MID-U-03: kanban のモバイル横スワイプ未設計 (Mobile -4)

`kanban-board.tsx:191` `grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 overflow-x-auto`:
- 360-639px: 1 列 → 5 ステージが**縦積み 1500px+** になり、「流れで見渡す」brand promise が縦スクロールで失われる。
- 640-1279px: 2 列 → 同様に流れが見えない。
- `overflow-x-auto` は親に付いているが grid の `min-w` 設定がないので横スワイプは効かない。

**対策**: `flex` ベースに変更し各列 `min-w-[18rem]` + `snap-x snap-mandatory`、または mobile 専用に `[grid-template-columns:repeat(5,18rem)] overflow-x-auto` を当てて横スワイプ kanban を実現 (Linear iOS kanban と同じ手法)。各列 sticky header (`top-[calc(var(--app-header-h)+env(safe-area-inset-top))]`) は既に正しく設定されている。

### MID-U-04: 落款 (inkan) accent が Phase 2 で完全不在 (Brand -5)

Phase 1 Round 3 で「dashboard hero に印鑑が押されている視覚を生み、brand voice を空間化」と評価された **`size-16 rotate-[-8deg] bg-cinnabar inkan "K"`** 落款が、Phase 2 のどこにも継承されていない:

- `/recordings/[id]` hero (動画 player + 詳細メタ) → 落款余地大
- `/meetings/[id]` の MeetingHeader (会社名 + タイトル + Stage select) → 落款余地大
- `/contacts/[id]/review` の保存成功 toast → 「確認済み 落款 stamp pulse」が最適
- `/contacts/import` の取り込み完了結果 → "印鑑を押した" 文脈そのもの

**対策**: 最低 1 箇所 (例: `/contacts/[id]/review` の reviewStatus=verified 遷移直後 200ms だけ `<span className="inkan animate-pulse-ink">確認済</span>` を表示) で落款 accent を継承。これだけで Phase 1 brand asset の継続性が証明される。

### LOW-U-01: focus ring の不揃い

3 系統混在:

- 二段 (inset + ring): `recordings/_components/recording-filter-bar.tsx:25` `shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]` ✓ Phase 1 準拠
- cinnabar focus: `search-form.tsx:163` `focus-within:shadow-focus-ring-cinnabar` ✓ Phase 1 準拠
- 単純 border のみ: `meeting-filter-bar.tsx:138, 157, 176, 194, 205` `focus-visible:border-ring` ← inset/ring 欠落

**対策**: `meeting-filter-bar` の全 select / date input に `focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]` を統一適用。

### LOW-U-02: line-clamp 漏れ

- `recording-skeleton.tsx:88` `RecordingProcessingCard` のタイトル `<h2>` は clamp 無し → 長文タイトルで skeleton 列と重なる懸念。
- `share-link-dialog.tsx` 結果領域 `Input readOnly value={result.url}` は font-mono だがコンテナで横スクロール、モバイル時に URL が hidden になる。

**対策**: processing-card タイトルを `line-clamp-2`、share-link result Input を `select` 一度クリックで全選択 (既に `onFocus={e=>e.currentTarget.select()}` あり ✓) のままで OK だが、視覚的に "…" 省略の hint が欲しい。

### LOW-U-03: keyboard shortcut の発見性が分散

- `RecordingPlayer` 下: J/K/L/Space/0-9 (recording-player.tsx:449-464)
- `SearchForm` 内 input 右: "/" (search-form.tsx:181-186)
- `TranscriptPane` 検索 input placeholder: "Enter で先頭ヒットへジャンプ"
- `kanban-board.tsx` セクション kicker: "ドラッグ または カードのハンドル→Space で移動 ・ ← → で隣のステージ"

→ 各機能ごとに独自場所に独自フォーマットで配置されており学習困難。

**対策**: 共通 `<KeyHints />` コンポーネントを `_components/ui/key-hints.tsx` 等に切り出し、`<Kbd>` token の意匠を Phase 1 へ昇格 (recording-player.tsx の Kbd 実装が既に良好なので、これを共有コンポーネント化)。

---

## 美学整合性チェック

### 墨 × 朱
- **bg-card / border-foreground/10 / shadow-sumi** は全機能で踏襲 ✓
- **cinnabar の用法**: 取り込み完了 pulse、検索 highlight (`bg-cinnabar/15`)、ナビ CTA、ConfidenceBadge 低、processing progress bar、ai-insights bullet 全部 cinnabar 系で統一 ✓
- 但し `commitments-panel.tsx` 完了帯と `recording-detail-client.tsx` 引き継ぎ通知の **emerald 系** が異色挿入 (HIGH-U-01)。speaker palette の **sky/violet/rose** も同罪。

### 編集的 №
- ページ内 №01 起点が contacts/search/recordings/meetings 一覧で完璧に揃う ✓
- `/recordings/[id]` の `№ 16`、`/meetings/[id]` の `№ 15` がハードコードで孤立 (HIGH-U-03)
- 詳細ページ内のセクション (AiSummaryPanel/CommitmentsList/StageHistory) が無採番 — Phase 1 哲学「主要 section に小さく №NN」継承の片手落ち (HIGH-U-03)

### 落款 accent
- **Phase 2 で完全不在** (MID-U-04)。Phase 1 で評価された brand asset が継承されておらず、`inkan` クラス自体は globals.css に残っているはずだが利用箇所ゼロ。

### 絵文字漏れ
- 全 40+ ファイルを scan、絵文字 (U+1F300〜U+1FAFF / U+2600〜U+27BF) は **検出ゼロ** ✓ Lucide のみで貫徹。

### display / tabular / kicker / hairline / animate-* の使い分け
- `display` (Bricolage Grotesque) は h1/h2/h3 + KPI metric で一貫 ✓
- `tabular` は時刻 / 件数 / 金額 / score で正しく使用 ✓
- `kicker` の uppercase tracking は kicker class 経由 ✓
- `hairline` divider はセクション境界に正しく挿入 ✓
- `animate-fade-up [animation-delay:60-180ms]` の段階化も維持 ✓

---

## 修正方針 (Round 2 で 95+ 到達のため)

| 観点 | Round 1 | Round 2 目標 | アクション |
|---|---|---|---|
| Visual | **89** | **96** | HIGH-U-01 (palette 純度), HIGH-U-03 (採番), MID-U-04 (落款) を解消 |
| Mobile | **86** | **95** | MID-U-02 (タッチ領域 44px), MID-U-03 (kanban 横スワイプ) を解消 |
| Brand | **87** | **96** | HIGH-U-01 (palette), HIGH-U-02 (DB 列名露出), MID-U-01 (サンプル統一), MID-U-04 (落款) を解消 |

### 優先順位付き修正項目

1. **HIGH-U-01 palette 純度 (最重要)**: `SPEAKER_PALETTE` 6 色を brand 5 色シェード (cinnabar / cinnabar-deep / chitose / chitose-muted / ai-deep / ochre) に置換。完了状態の `emerald` を全廃して `chitose` に統一。`commitments-panel.tsx:136, 209, 255-263` + `recording-detail-client.tsx:170` + 全 success toast。
2. **HIGH-U-02 編集トーン浄化**: `deal_status` → 「案件結果」、`stage` → 「商談状況」へ用語日本語化。`data-sc-code` 系を production build から除去。UUID hex 露出を「商談 #1234」連番表記に。
3. **HIGH-U-03 採番統一**: 詳細ページを「自分の中で №01 起点」に変更。`/recordings/[id]` `/meetings/[id]` のトップ kicker を `№ 01 — 営業 / 録画 (商談)` に、内部セクションに `№ 02-07` を順次採番。
4. **MID-U-02 タッチ領域**: kanban ハンドル → `size-11`、`-5s/+5s` → `h-11`、transcript timestamp → 行全体をクリック領域化、filter clear → `h-11`。
5. **MID-U-03 kanban 横スワイプ**: `[grid-template-columns:repeat(5,18rem)] overflow-x-auto snap-x snap-mandatory` でモバイル横スワイプ kanban を実現。
6. **MID-U-04 落款継承**: `/contacts/[id]/review` の verified 遷移直後 200ms `<span className="inkan animate-pulse-ink">確認済</span>` afterglow を実装。Phase 1 Dashboard hero の `inkan` クラスを再利用。
7. **MID-U-01 サンプル badge 統一**: 全 "サンプル" 表示を `bg-cinnabar 1.5px dot + kicker tabular pill` の 1 種類に集約。
8. **LOW-U-01 focus ring 統一**: `meeting-filter-bar` の select/date を `recording-filter-bar` の二段 inset+ring に揃える。
9. **LOW-U-02 line-clamp 補完**: `RecordingProcessingCard` タイトルに `line-clamp-2`。
10. **LOW-U-03 KeyHints コンポーネント切り出し**: `recording-player.tsx` の `<Kbd>` を共有 `_components/ui/kbd.tsx` に昇格、各機能で再利用。

---

## 判定: **CONDITIONAL PASS (Round 2 修正必須)**

Phase 1 で確立した美学の **骨格** (40+ ファイル横断の border-t-2 ヘッダ / kicker / display / hairline / animate-fade-up / cinnabar pulse / Lucide-only / aria-live) は **完璧に踏襲されている**。一方で Phase 1 Round 3 が **禁欲的に絞り込んで 96 点に押し上げた 3 つの brand asset** (5-color palette の純度 / ページ内 №01 起点採番 / inkan 落款 accent) が、機能拡大で 12 並列 agent が同時に書いた結果として **HIGH レベルで局所破壊** されている。

特に HIGH-U-01 (palette 純度) は Round 3 で `--info` を 215→204 に藍寄りシフトしてまで作った「和の 5-color editorial palette」の意味を直接損ねており、sky/emerald/violet/rose の `recording-player.tsx:36-63` 5 行を brand シェードに書き換えるだけで brand score が +7 跳ねる。HIGH-U-02 (DB 列名露出) と HIGH-U-03 (採番) も grep ベースの一括置換で 1 時間以内に解消可能。MID-U-02/U-03/U-04 (タッチ / kanban 横スワイプ / 落款) はそれぞれ独立した実装が必要だが、いずれも既存 Phase 1 token を再利用するだけで完結する。

Round 2 で上記 HIGH 3 件 + MID 4 件を消化すれば、Phase 1 と同等の **Visual 96 / Mobile 95 / Brand 96** (平均 95.7) に到達可能。Phase 2 の機能密度・情報量・データ密度バランスは Phase 1 を超えており、骨格は完成しているので、**ディテール polish に絞った Round 2** で十分。
