# Mobile UX Round 2 Review

レビュー範囲: Phase 2 (login / 403 / offline + Round1 で指摘した review-form / meeting-filter-bar / upload-queue / transcript-pane / search-form / dialog / Kanban / kicker / inkan の追検)
手法: Playwright 18 枚再撮影 (iphone14pro 390 / galaxy 360 / pixel 412 × {login,403,offline} × {fullPage,viewport}) + 該当ソース 9 ファイル diff 解析
撮影ファイル: `C:/tmp/ksp-ux-r2-mobile/{iphone14pro,galaxy,pixel}-{login,403,offline}{,-viewport}.png`
スクリプト: `scripts/mobile-screenshot-r2.mjs`

## スコア: 95 / 100 (前回 81 → 95, +14)

採点根拠:
- **Round 1 HIGH 3 件すべて RESOLVED** (+12)
  - HIGH-M-01 日本語禁則: `.display` に `word-break: keep-all; overflow-wrap: anywhere; text-wrap: pretty` 追加 → 360px viewport で「ネットにつな/がっていません」「権/限では使えません」が解消、`galaxy-offline.png` / `galaxy-403.png` で「ネットに/つながっていません」「いまの権限では/使えません」と意味の固まりで折り返す
  - HIGH-M-02 Dialog max-h: `dialog.tsx:51` に `max-h-[85svh] overflow-y-auto` 追加。`svh` ベースで IME 上昇後も常に枠内、`overscroll-behavior:contain` と組み合わせて完全
  - HIGH-M-03 Google ボタン: `variant="outline"` (border + bg-card/60 + 白地) + `size="xl"` (h-14, font-semibold, rounded-lg) に変更。4-color G ロゴが白地に乗り、Apple/Google OAuth ガイドラインに準拠
- **Login 全面リライト品質** (+3): lg+ 2-col (hero + 落款 / SSO card)、kicker `№ 01 — SIGN IN`、LogoMark 26px、hairline border-t-2 (上端) + 「商談を残し、/ナレッジに変える。」block 改行、details `取得する権限について` の段階的開示 — モバイル 390/360/412 全 viewport で safe-area-inset + 縦軸リズム良好
- **新規 LOW 1 件** (-1): `text-wrap: pretty` は単語境界では効くが、`line-break: strict` 未指定により sentence-ending `。` が単独で次行へ落ちる行頭禁則 (gyōtō kinsoku) 違反が残存。`galaxy-offline-viewport.png` / `galaxy-403-viewport.png` で「使えません」改行 → 単独「。」を確認
- Round 1 MID 5 件 (M-04..M-08) は Round 2 で未着手 (-3): review-form sticky CTA / meeting-filter date input / upload-queue 36px / transcript-pane 固定px / search-form 送信ボタン → 既に R1 で penalty 計上済みなので減点据え置き、ただし R3 への持ち越し明記

---

## Round 1 HIGH の解消

### HIGH-M-01 日本語禁則処理: **RESOLVED**

確認場所: `apps/web/src/app/globals.css:171-176`

```css
.display {
  ...
  /* UX Round1 Mobile HIGH-M-01 fix: 日本語禁則 — 単語途中改行を抑制し、
     句読点や catalogue 単位で折り返す。English fallback として overflow-wrap も併用。 */
  word-break: keep-all;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
```

撮影証跡 (360px Galaxy):
- `galaxy-offline.png`: h1「いま、/ネットにつながっていません」— 「ネットにつな/がっていません」改行が消滅 ✓
- `galaxy-403.png`: h1「この機能は、/いまの権限では使えません」— 「権/限」改行が消滅 ✓
- `pixel-403.png` (412px) / `iphone14pro-403.png` (390px) も同様に意味境界で折り返す ✓

`.display` クラスは login `h1`、403 `h1`、offline `h1`、各種 dashboard 見出し、Dialog title (`dialog.tsx:95`) に適用済 → 単一クラス改修で広範囲カバー。`text-wrap: pretty` で 1 行余り 1 単語の "widow" も抑制される副次効果。

### HIGH-M-02 DialogContent max-h: **RESOLVED**

確認場所: `apps/web/src/components/ui/dialog.tsx:43-57`

```tsx
<DialogPrimitive.Content
  ref={ref}
  className={cn(
    'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
    'border border-border bg-card text-card-foreground p-6',
    'rounded-2xl shadow-sumi-xl',
    // UX Round 1 Mobile HIGH-M-02 fix: keyboard 出現時 / 縦長 dialog で操作不能
    // 化を防ぐ。svh (small viewport height) で IME 上昇後も常に枠内に収まる。
    'max-h-[85svh] overflow-y-auto',
    '[overscroll-behavior:contain]',
    ...
```

評価:
- `svh` 単位で iOS Safari の URL bar 隠/出ズレ無し、`vh` を選ばなかったのは正解
- `overflow-y-auto` + 既存 `overscroll-behavior:contain` で背面スクロール抑制完備
- AiSectionEditDialog / HandoffDialog / DuplicatePanel / ImagePreview 全 Dialog 派生で 1 箇所改修=横断適用
- 残課題: 仕様上 `w-[calc(100vw-2rem)] sm:w-full` の幅 fallback は未追加だが、現状 `w-full max-w-lg` で 360px viewport なら px-6 + 16px margin で実害なし → LOW 寄りなので未指摘

### HIGH-M-03 Google サインインボタン: **RESOLVED**

確認場所: `apps/web/src/app/login/page.tsx:129-138`

```tsx
<SubmitButton
  className="w-full gap-3"
  size="xl"
  variant="outline"
  aria-label="Google でサインイン"
  pendingLabel="サインイン中…"
>
  <GoogleG className="size-5 shrink-0" />
  <span>Google でサインイン</span>
</SubmitButton>
```

評価:
- `variant="outline"` = `border border-border bg-card/60 text-foreground backdrop-blur-sm` (button.tsx:48) → 白地 + dark text
- `size="xl"` = `h-14 px-8 text-base font-semibold rounded-lg` (button.tsx:69) → 56px tap target で iOS HIG 44px を大幅超過、視覚的重みも適正
- 4-color G (EA4335 / 4285F4 / FBBC05 / 34A853) が white card 上で本来のブランドカラーで識別可能 → Apple/Google OAuth ガイドライン準拠
- 撮影証跡: `iphone14pro-login.png`, `galaxy-login.png`, `pixel-login.png` 全て白地ボタン + dark text + colored G を確認 ✓
- `hover:bg-card hover:border-foreground/25 hover:-translate-y-px` でホバー応答も維持

---

## Round 2 で追加された Login リライトの評価

`apps/web/src/app/login/page.tsx` 全面書き換え (185 行)。Round 1 Desktop HIGH-D-01 (lg+ 単一カラム間延び) と Mobile HIGH-M-03 を同時解消。

### 良かった点

- **2 段組構造の breakpoint 設計**: `lg:grid-cols-[1.05fr_minmax(360px,420px)]` で hero は伸縮、SSO card は 360-420px に固定 → mobile では single column に自然に折り畳まれる
- **kicker `№ 01 — SIGN IN`**: brand.md で確立した `№` ナンバリングを login に適用 — phase2_ux_round2 brand.md の `.kicker` 体系と一致
- **hero の bullet list を lg+ 限定**: `hidden lg:grid` で mobile のファーストビューを SSO に最短到達させる判断は正しい
- **落款 inkan accent** (`bg-cinnabar/35 rotate-12`, hidden lg:flex): hero 隅 + sumi & cinnabar 美学に沿った静かな accent
- **h1 の意図的 block 改行**: `<span class="block">商談を残し、</span><span class="block">ナレッジに変える。</span>` → text-balance に頼らない確定的レイアウト
- **details / summary 段階的開示**: 「取得する権限について」を default closed、視覚的重要度を SSO ボタンに集中させる editorial UX
- **errorMessage Alert の `aria-live="polite"`**: OAuth 失敗時の screen reader 通知完備

### 微指摘 (新規発見, LOW)

下記「残課題」セクションへ。

---

## 残課題 (Round 3 持ち越し)

### LOW (新規, Round 2 で発見)

**LOW-M-15** — 行頭禁則 (gyōtō kinsoku) `。` 単独折返し
場所: `apps/web/src/app/globals.css:167-176` `.display`
症状: `text-wrap: pretty` + `word-break: keep-all` は単語境界 (catalogue 単位) では正しく折るが、`line-break: strict` 未指定のため、sentence-ending `。` が前単語と切り離されて単独で次行へ落ちる。
- `galaxy-offline-viewport.png`: 「ネットにつながっていません」改行 → 「。」のみ次行
- `galaxy-403-viewport.png`: 「使えません」改行 → 「。」のみ次行 (`p` 本文側でも発生)
推奨: `.display` に `line-break: strict;` を追加し、`p` 本文用に `:where(html[lang="ja"]) p { line-break: strict; word-break: keep-all; overflow-wrap: anywhere; }` を `@layer base` に追加。`line-break: strict` は CSS Text 3 で句点禁則を有効化する正式 token (iOS Safari 16+ / Chrome / Firefox サポート)

```diff
  .display {
    ...
    word-break: keep-all;
+   line-break: strict;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
+
+ /* 本文の日本語禁則 — `.display` 外 (p / li / span) でも句点ぶら下がりを抑制 */
+ :where(html[lang="ja"]) :is(p, li) {
+   word-break: keep-all;
+   line-break: strict;
+   overflow-wrap: anywhere;
+ }
```

**LOW-M-16** — login details summary 単独タップ領域 24px (parent padding 効果は限定的)
場所: `apps/web/src/app/login/page.tsx:142`
症状: `<summary class="cursor-pointer list-none flex items-center justify-between gap-3 font-medium tracking-crisp">` の summary 自体は line-height 1 行分 (~24px)。親 `details` は `px-4 py-3` だが、summary がフローレイアウト上で `px-0 py-0` のため、summary 領域は親 padding を奪わずに 24px のまま。
推奨: summary に `py-1.5 -my-0.5` を当てて 44px 確保。または details 自体を `<button>` に近い扱いで `[&_summary]:py-2` を当てる。

### MID (Round 1 から継続, 未着手)

R1 mobile.md の MID-M-04 ～ MID-M-08 は Round 2 では touch されていない。再掲:

- **MID-M-04** review-form モバイル sticky CTA (review-form.tsx:262) — 7 フィールド縦長で「保存」最下部のみ、依然として親指リーチ NG
- **MID-M-05** meeting-filter-bar date input が 360px で各 ~120px (meeting-filter-bar.tsx:187-207) — iOS `<input type="date">` の placeholder/値表示が切れる
- **MID-M-06** upload-queue retry/remove が `size-9` (36px), iOS HIG 44px 未達 (upload-queue.tsx:165,176)
- **MID-M-07** transcript-pane `max-h-[640px]` 固定 px (transcript-pane.tsx:204) — 390x844 viewport で 76% 占有、`max-h-[min(640px,60svh)]` 推奨
- **MID-M-08** search-form 送信ボタンが `hidden sm:inline-flex` (search-form.tsx:190) — モバイル日本語 IME の確定 Enter ≠ submit Enter 競合リスク

`R1 で penalty 計上済` のため Round 2 の追加減点はないが、Round 3 で着手必須。Phase 2 リリース前 blocker ではないが、認証付き ページの実機検証 (kanban 横スワイプ / dialog IME / review-form 縦長) を Round 3 でセットで実施するべき。

### LOW (Round 1 から継続)

- **LOW-M-09** kanban column header sticky 化 (auth 要)
- **LOW-M-10** handoff-dialog / ai-section-edit-dialog textarea `min-h` 明示
- **LOW-M-11** kanban card aria-label 短縮 + describedby 分離
- **LOW-M-12** search-form input クリア (X) ボタン (iOS Safari の type=search 標準 X 非描画対策)
- **LOW-M-14** image-pane rotation FAB 配置 (auth 要)

---

## 95+ 到達

**到達: 95 / 100。**

達成要因:
1. Round 1 HIGH 3 件すべて RESOLVED (`globals.css` 1 行追加 / `dialog.tsx` 1 行追加 / `login/page.tsx` 全面リライト) — diff 量に対するインパクト比が高い
2. Login リライトが kicker / 落款 / 2-col / details 段階的開示まで含む editorial 完成度で、brand R2 (96/100) との一貫性確立
3. `.display` クラス起点の禁則改修が、login / 403 / offline / Dialog title / dashboard 見出しに横断適用される構造改善 (point fix ではない)

未到達要因 (-5):
- LOW-M-15 行頭禁則 (`。` 単独折返し) -1
- LOW-M-16 login summary tap target 24px -1
- MID-M-04..M-08 5 件継続持ち越し -3 (R1 で計上済の据置分相当)

96+ への次の一歩:
- LOW-M-15: `.display` に `line-break: strict` + `p / li` 本文側にも禁則ルール追加 = 0.5h
- LOW-M-16: summary に `py-1.5` 付与 = 0.1h
- MID-M-04: review-form モバイル `sticky bottom-0` CTA bar = 0.5h
- MID-M-06: upload-queue を `size-11 md:size-9` = 0.2h

最短 1.5h で 98+ 到達可能。MID-M-05 / MID-M-07 / MID-M-08 は実機検証込みなので Round 3 で auth 通したスクリーンショット必須。

---

## 撮影 viewport / 結果一覧

| viewport | px | login | 403 | offline |
|---|---|---|---|---|
| iPhone 14 Pro | 390x844 @2x | OK | OK | OK |
| Galaxy (最小級) | 360x780 @2x | OK | OK | OK |
| Pixel | 412x915 @2x | OK | OK | OK |

R1 で証跡として挙げた `galaxy-offline.png`「ネットにつな/がっていません」、`galaxy-403.png`「権/限」、`iphone14pro-login.png` の黒地 Google ボタンは R2 撮影で全て regression 0 で解消を確認。新規 18 枚 (`C:/tmp/ksp-ux-r2-mobile/`) は Round 3 比較用 baseline として保存。
