# UX Round 3 Review — Phase 2

## スコア: Visual 97 / Mobile 96 / Brand 97  (平均 96.7)
## 前回: Visual 96 / Mobile 94 / Brand 96 (95.3) → 改善幅 +1 / +2 / +1 (平均 +1.4)

Round 2 で残置していた **MID-U-02 (-5s/+5s と kanban drag handle の 44px 未達)** と
**MID-U-01 (card 系サンプル badge の墨グレートーン残置)** が Round 3 で両方とも回収され、
Mobile 観点が 94 → 96 へ +2 で本人指定の 95+ 閾値を突破。Visual / Brand も
「詳細ヘッダで確立した SampleBadge 流派 = cinnabar dashed border + bg-cinnabar/5」が
ようやく card 系コンポーネントまで波及完了し、詳細⇄一覧のサンプル語彙が同一流派の
2 variant (light = `bg-cinnabar/5` / dark = `bg-background/15` on stage gradient) に統一された。
残るは LOW 級の polish (focus ring 二段化、mute ボタン 44px 化、transcript timestamp 行クリック化) のみで、
Phase 2 の意匠キャップは事実上ここで取り切った形。

---

## Round 2 残課題の解消状況

### MID-U-02 touch 44px: **RESOLVED**

#### `recording-player.tsx` -5s / +5s / play (再生・一時停止)

- `recording-player.tsx:354-368` 再生/一時停止ボタン: `size="default"` (Button variant の default = `h-11 px-5` 相当) ✓
- `recording-player.tsx:369-377` -5s ボタン: `variant="outline" size="default"` で **h-11 (44px)** に拡大 ✓
- `recording-player.tsx:378-386` +5s ボタン: 同上 `size="default"` で **h-11** ✓
- ラベルは `<span className="tabular text-xs">−5s</span>` で文字サイズは小さいまま、当たり判定 (button 領域) だけが 44px に育つ「視覚は引き締め / 触覚は広げる」の WCAG 2.5.5 / Material Touch Target ガイドライン準拠の正しい解。`-5s/+5s` の Mathematical minus (U+2212 `−`) を使った tabular 表記も維持されており、編集トーン (=タイポ厳格) を崩していない。
- 中央 overlay play ボタン (停止中のみ) は `recording-player.tsx:317-326` で `size-16` (=64px) の cinnabar 円形 → 当然 44px 以上。

#### `meeting-card.tsx` kanban drag handle

- `meeting-card.tsx:132-148` で「視覚的なハンドルは `GripVertical size-4` のまま、当たり判定だけ `size-11` (44×44px) に拡大」する分離パターンが完成:
  ```
  className={cn(
    // Round2 UX MID-U-02 fix: touch 領域 44px 確保。
    // 視覚的なハンドルは size-6 のまま、当たり判定のみ size-11 で広げる。
    'absolute -left-1 top-1 z-[2] inline-flex items-center justify-center size-11 rounded-md',
    ...
  )}
  ```
- 内側に `<GripVertical aria-hidden strokeWidth={1.6} className="size-4" />` (= 16px の icon) を中央配置 → 視覚的にうるさくない / 触覚で取りやすい、の正解パターン。
- `opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100` で「触る前は半隠し / hover or focus で立ち現れる」の Linear 風 affordance も維持され、44px の大きな当たり判定がレイアウト上邪魔にならない。
- `aria-label` が「`{meeting.title} を移動 (Space で掴む、矢印キーで移動、Space で離す)`」と DnD 操作の SR 案内まで含む完成度。Card 本体の `pl-7` も `dragHandleProps && 'pl-7'` で条件付きに保たれ、handle が無い (read-only / overview 用途) では padding が膨らまない。

→ Round 2 で残置した 2 つの 44px 違反が両方とも片付き、**Mobile +2 確定**。

### MID-U-01 sample badge 統一: **RESOLVED**

#### 統一の正準形 (詳細ページ ヘッダ)

`recordings/[id]/page.tsx:483-491` `SampleBadge()` と `meetings/[id]/page.tsx:159-167` `MeetingSampleBadge()` が同一トークン:

```
className="px-2 h-5 inline-flex items-center rounded-full
           border border-dashed border-cinnabar/35
           bg-cinnabar/5 text-cinnabar
           text-[10px] tracking-kicker uppercase"
```

#### `meeting-card.tsx:172-179` (一覧 kanban カード)

```jsx
// Round2 UX MID-U-01 fix: 統一 SampleBadge 流派 (cinnabar dashed)
<span ... className="px-2 h-5 inline-flex items-center rounded-full
                     border border-dashed border-cinnabar/35
                     bg-cinnabar/5 text-cinnabar
                     text-[10px] tracking-kicker uppercase whitespace-nowrap" >
  サンプル
</span>
```
→ MeetingSampleBadge と **完全一致 (`whitespace-nowrap` のみ追加)**。Round 2 の「墨グレー pill」(`border-foreground/15 bg-surface-inset/60 text-muted-foreground`) は完全撤去。

#### `recording-card.tsx:34-43` (一覧 録画カード)

```jsx
// Round2 UX MID-U-01 fix: 統一 SampleBadge 流派 (cinnabar dashed)。
// 録画 card は墨グラデ背景なので背景を強める。
<span ... className="px-2 h-5 inline-flex items-center rounded-full
                     border border-dashed border-cinnabar/55
                     bg-background/15 text-background/95
                     text-[10px] tracking-kicker uppercase whitespace-nowrap">
  サンプル
</span>
```

録画カードは左半分が `bg-gradient-to-br from-foreground/85 to-foreground/65` (= 墨グラデ濃い背景) の上に乗るため、`bg-cinnabar/5 text-cinnabar` をそのまま敷くと cinnabar が墨の上で沈んで読めない。Round 3 で採用された解は:

- **border-dashed は維持** (= sample 識別の主軸サイン)
- **border-cinnabar/35 → /55 に強化** (墨背景でも輪郭が立つ)
- **bg-cinnabar/5 → bg-background/15** (墨上で半透明白の編集ラベル風に)
- **text-cinnabar → text-background/95** (コントラスト確保)
- **h-5, px-2, text-[10px], tracking-kicker, uppercase は共通**

これは「同じ design token system の dark variant」として整合的な分岐で、light card と dark stage の両環境でサンプル識別の **dashed border + uppercase kicker** という 2 大シグナルが共通している。語彙単一性は保たれており、ブランド整合の観点で減点なし (= MID-U-01 RESOLVED として扱える)。

→ 詳細ヘッダ (1 流派) と一覧カード (light/dark の 2 variant、ただし dashed border + kicker タイポは共有) で **system 全体としての統一**が完成。詳細⇄一覧で「サンプル」語彙が完全一致するため、ユーザーが行き来した際の bo trip 感がなくなった。

### LOW-U-01 focus ring 二段化: **未対応 (本ラウンドの対象外)**

- `meeting-filter-bar.tsx:138, 157, 176` の select 3 つは依然 `focus-visible:outline-none focus-visible:border-ring` 一段のまま。
- `recording-filter-bar.tsx:25` 側は `focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]` の二段リング維持。
- 本 Round 3 は MID-U-01 / MID-U-02 の確実な fix が指示範囲だったため、focus ring は次ラウンド以降の任意 polish 扱いで OK。減点も -1 未満 (見た目の差はキーボードユーザーが select を tab 移動した瞬間のみ)。

---

## 95+ 到達 (3 観点と平均)

| 観点 | Round 1 | Round 2 | Round 3 | 95+ |
|---|---|---|---|---|
| Visual | 89 | 96 | **97** | ✓ |
| Mobile | 86 | 94 | **96** | ✓ |
| Brand  | 87 | 96 | **97** | ✓ |
| 平均   | 87.3 | 95.3 | **96.7** | ✓ |

3 観点すべてが 95+ 達成、平均 96.7 で Phase 1 Round 3 (96.7) と完全同水準に到達。

### Visual 96 → 97 (+1)

- card 系サンプル badge の墨グレートーン残置が消えたため、「詳細ページではサンプル = 朱の dashed」「一覧 card では同じ dashed が墨グラデ上で白く反転」という **同じ語彙の 2 variant** が完成。視覚言語の一意性 +1。
- recording-player の `-5s/+5s` ボタンが `size="default"` の h-11 に育っても、内側ラベル `text-xs` を維持しているため視覚的な「派手さ」は出ず、編集トーン (=タイポ厳格) を保ったまま当たり判定だけ拡大できている。視覚と触覚の分離の品が +1 に貢献。
- 100 に届かない理由: focus ring の二段/一段ハイブリッドが視覚的にまだ完全統一されていない (-2)、recording-player の中央 overlay play (cinnabar 円) と placeholder の「サンプル映像」kicker が hero hierarchy で軽くぶつかる場面が稀にある (-1)。

### Mobile 94 → 96 (+2) ★ 95+ 突破

- **44px touch target 達成**: -5s/+5s/play (再生 toggle) の 3 つと kanban drag handle で WCAG 2.5.5 / Material Touch Target Size を満たした。Phase 2 で kanban を主役機能にした以上、drag handle の 24px 残置は無視できない問題だったが、Round 3 で「視覚 16px / 当たり判定 44px」という分離パターンで品よく解決。
- ハンドルの `opacity-0 group-hover/card:opacity-100` で「触る前は引っ込んでいる」仕様も維持されており、44px に拡大しても read-only ユーザの視界に押し出してこない。
- 100 に届かない理由: (a) recording-player の **mute ボタンが `size="icon-sm"` (h-9 = 36px)** のままで 44px 未達 (-1)、(b) transcript-pane の timestamp button は行 hover で識別はできるが行全体タップ領域化がまだ (-1)、(c) chapters nav の pill が `h-7` (=28px) で 44px 未達 (-1) ※ チャプター操作は副次なので減点小。
- iOS Safari 実機での recording-player スクリーンでこれら 3 つを直すと 98+ も射程に入る。

### Brand 96 → 97 (+1)

- 「サンプル = cinnabar dashed」が **詳細 + 一覧 (light/dark variant) の全 4 箇所で一意化**。Phase 1 Round 3 で確立した「ページ内でサンプル識別語彙は 1 種類」原則が Phase 2 全 surface に波及完了。
- 「墨 × 朱」と「dashed border = 仮の値 / under construction」の編集メタファが一貫し、ユーザーが card 一覧→詳細ページに遷移しても同じ語彙の連続性で「これはサンプル」のシグナルが折れない。
- 100 に届かない理由: ChevronRight / Calendar / Users などの Lucide icon を `strokeWidth={1.6}` で揃えている中、kanban の drag handle GripVertical も 1.6 だが、recording-player の Pause/Play は 1.8 で僅か太め (-1)。これは控除レベルだが、Phase 1 の「線幅 1.6 統一」を厳密に守るならここで詰められる (-2)。
- 落款 (inkan) accent は Round 2 で完成済 → 維持。

---

## 残課題 (最大 3 件、polish のみ)

1. **LOW-U-01 (継続) meeting-filter-bar の focus ring 一段→二段**
   `meeting-filter-bar.tsx:138, 157, 176` の select 3 個に
   `focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18),inset_0_1px_0_hsl(var(--surface-highlight)/0.4)]`
   を追加で `recording-filter-bar` と完全一致。Phase 2 の focus ring 言語完全統一に。
   減点幅: -1 (Visual)。

2. **LOW-U-02 (新規) recording-player mute / chapters の 44px 未達**
   - `recording-player.tsx:387-401` mute ボタン `size="icon-sm"` (h-9 = 36px) → `size="icon"` (h-11 想定) に。
   - `recording-player.tsx:417-438` chapters の pill `h-7` (28px) → タップ可能性を担保するなら `h-9 sm:h-7` (= モバイル 36px / デスクトップ 28px) に。
   減点幅: -1 (Mobile)。

3. **LOW-U-03 (新規) Lucide strokeWidth の `1.8` → `1.6` 統一**
   `recording-player.tsx:324, 363, 365, 396, 398` で `strokeWidth={1.8}`、`recording-card.tsx:45, 63` で `strokeWidth={1.8}` が点在。Phase 1 で確立した 1.6 統一に揃えると線幅の編集トーンが一段引き締まる。
   減点幅: -1 (Brand)。

---

## 美学整合 (Round 2 からの差分)

### サンプル語彙の system 化: **新規完成**
- 詳細ヘッダ (light) `SampleBadge / MeetingSampleBadge`: `border-cinnabar/35 bg-cinnabar/5 text-cinnabar`
- 一覧 meeting card (light): 同一 token を踏襲 (`border-cinnabar/35 bg-cinnabar/5 text-cinnabar`)
- 一覧 recording card (dark stage 上): variant token (`border-cinnabar/55 bg-background/15 text-background/95`)
- 4 箇所で **`border border-dashed + h-5 px-2 text-[10px] tracking-kicker uppercase`** の構造的 token は共有、色だけ light/dark で変える。これは Phase 1 で `cinnabar` の `12 / 15 / 20` opacity tier を speaker palette に展開したのと同じ「同一 token の opacity / channel swap」流派の正統的拡張。

### 44px touch target: **新規完成**
- kanban drag handle の「視覚 size-4 / 当たり判定 size-11」分離は Phase 3 以降の他ハンドル系 (DnD / sortable / resize) で再利用できる良パターン。`absolute -left-1 top-1 z-[2] inline-flex items-center justify-center size-11 rounded-md` の wrapper が独立コンポーネント (`<TouchHandle>`) に切り出せるくらい再利用性が高い。
- recording-player の `-5s/+5s/再生` を `size="default"` に揃えたことで、ボタングループ全体の baseline (h-11) が統一され、ヴォリュームと再生速度セレクタとの整列も視覚的に整った。

### 5-color palette / №01 起点採番 / 落款 accent: **維持**
- Round 2 で確立した brand asset 3 種は本 Round で touch せず、品質を Round 2 水準で保持。grep 横断で `sky / emerald / violet / rose / indigo / teal / orange / pink` の generic Tailwind 色 0 件、`№` 採番は両詳細ページで自分自身 №01 起点を維持。

---

## 判定: **PASS — Phase 2 UX 完成ライン到達**

3 観点とも 95+ 達成、平均 96.7 で Phase 1 Round 3 (Visual 97 / Mobile 96 / Brand 97 / 96.7) と完全同水準。

残る 3 件 (focus ring 二段化、mute & chapters の 44px、Lucide stroke 1.6 統一) は全て -1 / 観点 の polish 級で、Phase 2 として Phase 1 と同等の品質クラスに到達した今、**Round 4 は実施せず Phase 3 (本番接続 / signed URL / RLS リライト 等) に進む**判断が妥当。任意 polish は Phase 3 中盤の意匠フリーズ前に纏めて拾えば 98+ も射程内。
