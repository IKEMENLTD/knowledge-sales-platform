# Mobile UX Round 1 Review

レビュー範囲: Phase 2 (contacts/import, contacts/review, meetings list+detail, recordings/[id], search, mobile-bottom-nav, auth-free pages)
手法: Playwright (390/360/412) で auth-free 撮影 + ソース 22 ファイル解析
撮影ファイル:
`C:/tmp/ksp-ux-mobile/{iphone14pro,galaxy,pixel}-{login,403,offline}.png` (9 枚)

## スコア: 81 / 100

採点根拠:
- 基礎は丁寧 (-)：safe-area-inset-*, min-h-dvh, mobile-bottom-nav 44px, kanban の snap-x snap-mandatory + touch-pan-x, kanban ハンドル 44x44 を Round2 で fix 済 → +
- **日本語禁則 0 件** (-6)：`word-break: keep-all` / `text-wrap: pretty` が globals.css にも components にも一切無い。Round 4 既知の offline h1 区切れ問題は撮影で再現、403 でも「権 / 限」が再現
- **DialogContent に max-h なし** (-4)：AI section edit / handoff / image preview いずれもモバイルでオーバーフロー時にスクロール不能になる可能性
- **Login Google ボタンが variant="default" (foreground=黒)** (-2)：OAuth ボタンの慣習(白地+ G ロゴ)と乖離、撮影でも視覚的にコントラスト過多で「沈んで」見える
- maximumScale=5 / userScalable=true は妥当 (+)
- review-form 縦長フォームに sticky CTA 無し (-2)：保存ボタンへ到達するのに 7 フィールド分スクロール必須
- transcript-pane の `max-h-[640px]` は固定 px、モバイル小画面で過大 (-1)
- search-form の input が `h-14`、kbd `/` が hidden sm:inline で OK、検索ボタン `hidden sm:inline-flex` → モバイルで送信動線は Enter のみ (-1)
- meeting-filter-bar の date input が `min-w-0 flex-1` で 2 つ並ぶ → 360px viewport で各 ~120px、ja-JP の date picker UI が崩れる懸念 (-1)
- contacts import の Thumb `size-14 md:size-16` (56px) + Card 内 retry/remove 各 icon-sm (36px) → 44px 未満 (-2)
- commitments-list `<button>` 行は p-3 で min-tap 44px は実質確保、OK
- recording-player は別ファイル未完読だが、video 操作ボタンが size icon-sm かどうか要追検

## 強み

- Viewport meta が next/font 経由 (`apps/web/src/app/layout.tsx:83`) で `viewportFit: 'cover'` + ズーム許可 5x — accessibility 規約満たす
- safe-area-inset 系がページ別に丁寧 (mobile-bottom-nav の `pb-[max(0.5rem,env(safe-area-inset-bottom))]`, onboarding の `pb-[max(env(safe-area-inset-bottom),2.5rem)]`)
- KanbanBoard が `snap-x snap-mandatory` + `touch-pan-x` + 横カラム `w-[82vw]` で iOS 慣性スクロール + 1 列ずつ snap — モバイル横スワイプ実装は完成度高い
- MeetingCard の DnD ハンドルは Round2 で `size-11` (44px) 拡張済、コメント `Round2 UX MID-U-02 fix` あり
- AppShell が `pb-nav` で main padding を bottom-nav 分逃がしているため、最下部 CTA が nav に重ならない
- review-form は `flex-col-reverse` で「保存」を最下部優先表示 (モバイル親指リーチ)
- Dialog Close は `size-11` (44px) 確保 (`apps/web/src/components/ui/dialog.tsx:59`)

## 改善余地

### HIGH

**HIGH-M-01** — 日本語禁則処理が全画面未対応
場所: `apps/web/src/app/globals.css` + 全 h1/p
症状: 360px viewport で `<h1 text-balance>` が単語ではなく文字単位で折返し、「ネットにつな / がっていません」「いまの権 / 限では使えません」と意味の途中で改行
推奨: `globals.css` の `.display` および日本語本文クラスに `word-break: keep-all; line-break: strict; overflow-wrap: anywhere;`、見出しは `text-wrap: pretty;` を追加。Round 4 既知の offline は撮影で再現 (`C:/tmp/ksp-ux-mobile/galaxy-offline.png`)

**HIGH-M-02** — DialogContent に max-h / overflow-y なし
場所: `apps/web/src/components/ui/dialog.tsx:43-54`
症状: モバイル keyboard 出現時 (`100dvh` ベース計算でも) 内容量が svh を超えるとダイアログ外にスクロールバーが出ず操作不能。AiSectionEditDialog の textarea / HandoffDialog の draftNotes textarea / DuplicatePanel の merge dialog で発生し得る
推奨: `'max-h-[85svh] overflow-y-auto'` を className に追加し、`overscroll-behavior:contain` (既存) と組み合わせる

**HIGH-M-03** — Login の Google サインインボタンが OAuth 慣習から外れ視覚的に沈む
場所: `apps/web/src/app/login/page.tsx:89-98`
症状: `variant="default"` (background=foreground=濃墨色, text=background=cream) で、Google 4-color G ロゴが黒地に乗って境界が消える。撮影 (`iphone14pro-login.png`) で確認
推奨: `variant="outline"` または専用の白地ボタン (border-border + bg-card/95) に変更。Material/Apple/Google の OAuth ボタンガイドラインに沿う

### MID

**MID-M-04** — review-form 縦長で sticky CTA 無し
場所: `apps/web/src/app/contacts/[id]/review/_components/review-form.tsx:262-310`
症状: モバイルで 7 フィールド + tags + hairline + ボタン群、ファーストビュー外にしか「保存して確認済みにする」が無い。OCR 自信度低のフィールドだけ修正したいユースケースで毎回最下部へスクロール必要
推奨: モバイルのみ `sticky bottom-0` の action bar (border-top + bg-background/92 backdrop-blur + safe-area-inset-bottom)、もしくは AppShell の `bottomActionBar` slot を ImagePane 兄弟から注入

**MID-M-05** — meeting-filter-bar の日付 input が狭すぎ
場所: `apps/web/src/app/meetings/_components/meeting-filter-bar.tsx:188-207`
症状: 360px で date input 2 つ + 「〜」セパレータが横並び、各々 ~120px。iOS の `<input type="date">` placeholder/値表示が切れる
推奨: モバイル時 `grid grid-cols-2 gap-2` または details/summary で「期間」を折り畳む。`md:flex md:items-center` でデスクトップは現状維持

**MID-M-06** — contacts import の Thumb 行 retry/remove ボタンが 36px
場所: `apps/web/src/app/contacts/import/_components/upload-queue.tsx:162-183`
症状: `size="icon-sm"` は h/w 36px、Apple/WCAG 44px に未達。失敗時の retry 連打や remove はミスタップ多発
推奨: モバイルのみ `md:size-9 size-11` か、Button variant に `icon-sm-mobile-lg` を追加

**MID-M-07** — transcript-pane の固定 px max-h
場所: `apps/web/src/app/recordings/[id]/_components/transcript-pane.tsx:204`
症状: `max-h-[640px]` 固定。390x844 で 76% 占有、kanban のような snap 制御も無く、player + sentiment chart と縦に重なって 1 セグメントしか見えない
推奨: `max-h-[min(640px,60svh)]`。同様に `recordings/[id]` の `image-pane.tsx` `max-h-[70vh]` → `max-h-[70svh]` (`vh` は iOS で URL bar 分計算ずれ)

**MID-M-08** — search-form の検索送信が Enter のみ (sm 以下)
場所: `apps/web/src/app/search/_components/search-form.tsx:187-196`
症状: 検索 submit ボタンが `hidden sm:inline-flex`。モバイル日本語 IME では確定 Enter ≠ submit Enter で誤動作することがあり、明示ボタンが安全
推奨: モバイルでも表示し、kbd `/` は隠す。あるいは label 内のフォーム外に「検索する」ボタンを `block sm:hidden` で配置

### LOW

**LOW-M-09** — kanban-board sticky header が `top-[calc(var(--app-header-h)+safe-area-inset-top)]`
場所: `apps/web/src/app/meetings/_components/kanban-board.tsx:231`
症状: モバイル時 AppShell の sticky header 高さは `h-14` (3.5rem) で固定済だが、`--app-header-h` を CSS 変数で参照すれば変更耐性が増す (既に変数化済、OK)。ただし横スクロール時に sticky が列ごとに動かない → 各列 sticky になっていないため、複数列スワイプ時にステージ名が常に見える保証なし
推奨: column header に `sticky top-0` 単体は効かないため、kanban 全体に `relative` + column header に `position: sticky; top: var(--app-header-h)`。現状 LOW

**LOW-M-10** — handoff-dialog / ai-section-edit-dialog の textarea が `min-h` 未設定
場所: `apps/web/src/app/meetings/[id]/_components/handoff-dialog.tsx` (textarea), 同 `ai-section-edit-dialog-client.tsx`
症状: 内容なしでレンダされると 0px に潰れる可能性 (textarea デフォルトは rows=2 ≒ 60px だが、tailwind の `h-auto` 等は危険)
推奨: `min-h-[8rem]` を明示

**LOW-M-11** — kanban カードの `aria-label` が長すぎる
場所: `apps/web/src/app/meetings/_components/meeting-card.tsx:144-145`
症状: VoiceOver で 1 カードあたり 50 字以上読み上げ、リスト探索が遅い
推奨: ハンドル aria-label は `${meeting.title} を移動` に短縮し、操作説明は `aria-describedby` 経由で別 sr-only に分離

**LOW-M-12** — search-form の input が `type="search"` だがピル型のクリア (X) 無し
場所: `apps/web/src/app/search/_components/search-form.tsx:167-186`
症状: iOS Safari は type=search でも標準クリアボタンを描画しない場合あり、長い query を消すのに backspace 連打
推奨: transcript-pane の検索クリアボタン (`X` size-7) を踏襲

**LOW-M-13** — login の details (`取得する権限について`) の summary タップ領域
場所: `apps/web/src/app/login/page.tsx:101-110`
症状: summary がデフォルト `h-auto`、行高で ~24px 程度
推奨: `summary` に `py-2 -my-1` 程度を当てて 44px 確保

**LOW-M-14** — image-pane の rotation ボタン到達性
場所: `apps/web/src/app/contacts/[id]/review/_components/image-pane.tsx` (未完読)
症状: 名刺画像の 90deg 回転は片手では辛い (画像が画面横幅一杯の場合)
推奨: bottom-right 固定の FAB に配置

## 改善コード提案 (具体的 diff レベル)

### 提案 A: 日本語禁則を globals.css に追加 (HIGH-M-01 修正)

```diff
- file: apps/web/src/app/globals.css
@layer base {
+  /* 日本語禁則処理 — Round4 で offline / 403 の単語途中改行を解消 */
+  :where(html[lang="ja"]) {
+    word-break: keep-all;
+    line-break: strict;
+    overflow-wrap: anywhere;
+  }
+  :where(html[lang="ja"]) h1,
+  :where(html[lang="ja"]) h2,
+  :where(html[lang="ja"]) h3,
+  :where(html[lang="ja"]) .display {
+    text-wrap: pretty;
+    word-break: keep-all;
+    overflow-wrap: anywhere;
+  }
}
```

### 提案 B: DialogContent に max-h 追加 (HIGH-M-02 修正)

file: `apps/web/src/components/ui/dialog.tsx:43-54`

```diff
     <DialogPrimitive.Content
       ref={ref}
       className={cn(
         'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
         'border border-border bg-card text-card-foreground p-6',
         'rounded-2xl shadow-sumi-xl',
-        '[overscroll-behavior:contain]',
+        '[overscroll-behavior:contain]',
+        // モバイル keyboard 出現時に画面外オーバーフローしないよう svh ベースで上限を切る
+        'max-h-[85svh] overflow-y-auto',
+        'w-[calc(100vw-2rem)] sm:w-full',
         'data-[state=open]:animate-scale-in',
```

### 提案 C: Login Google ボタンを OAuth 慣習へ (HIGH-M-03 修正)

file: `apps/web/src/app/login/page.tsx:89-98`

```diff
             <SubmitButton
               className="w-full gap-3"
               size="lg"
-              variant="default"
+              variant="outline"
+              // Google OAuth ボタンガイドライン: 白地 + 4-color G + black text。
+              // outline variant に border-border/80 + bg-card で近似する。
               aria-label="Google でサインイン"
               pendingLabel="サインイン中…"
             >
-              <GoogleG className="size-5 shrink-0" />
-              <span>Google でサインイン</span>
+              <GoogleG className="size-5 shrink-0" />
+              <span className="font-medium">Google でサインイン</span>
             </SubmitButton>
```

### 提案 D: review-form モバイル sticky CTA (MID-M-04 修正)

file: `apps/web/src/app/contacts/[id]/review/_components/review-form.tsx:262`

```diff
-      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
+      <div
+        className={cn(
+          'flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between',
+          // モバイルのみ最下部に sticky で貼り付ける (片手親指リーチ)
+          'md:static sticky bottom-0 -mx-6 px-6 py-3 bg-background/92 backdrop-blur',
+          'border-t border-border/60 md:border-0 md:bg-transparent md:p-0 md:mx-0',
+          'pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-0',
+        )}
+      >
```

### 提案 E: kanban-board モバイル date input 折りたたみ (MID-M-05 修正)

file: `apps/web/src/app/meetings/_components/meeting-filter-bar.tsx:187`

```diff
-      <div className="md:col-span-2 flex items-center gap-2">
+      <div className="md:col-span-2 grid grid-cols-2 gap-2 md:flex md:items-center">
         <input
           type="date"
           value={from}
           onChange={(e) => setFrom(e.target.value)}
           onBlur={() => push({ from })}
           aria-label="開始日"
-          className="h-11 flex-1 min-w-0 rounded-md border border-border bg-surface-inset/60 px-2 text-xs tabular"
+          className="h-11 min-w-0 rounded-md border border-border bg-surface-inset/60 px-2 text-xs tabular"
         />
-        <span aria-hidden className="text-muted-foreground text-xs">
+        <span aria-hidden className="hidden md:inline text-muted-foreground text-xs">
           〜
         </span>
```

### 提案 F: upload-queue retry/remove を 44px に (MID-M-06 修正)

file: `apps/web/src/app/contacts/import/_components/upload-queue.tsx:160-183`

```diff
       <div className="flex items-center gap-1 shrink-0">
         {isFailed ? (
           <Button
             type="button"
             variant="outline"
-            size="icon-sm"
+            size="icon"
+            className="size-11 md:size-9"
             onClick={() => onRetry(item.id)}
             aria-label={`${item.file.name} を再試行`}
             disabled={item.endpointUnavailable}
           >
             <RotateCw aria-hidden className="size-4" />
           </Button>
         ) : null}
         <Button
           type="button"
           variant="ghost"
-          size="icon-sm"
+          size="icon"
+          className="size-11 md:size-9"
           onClick={() => onRemove(item.id)}
```

### 提案 G: transcript-pane / image-pane を svh ベースへ (MID-M-07 修正)

file: `apps/web/src/app/recordings/[id]/_components/transcript-pane.tsx:204`

```diff
-          'max-h-[640px] overflow-y-auto space-y-1.5 pr-1',
+          'max-h-[min(640px,60svh)] overflow-y-auto space-y-1.5 pr-1',
```

file: `apps/web/src/app/contacts/[id]/review/_components/image-pane.tsx:145` (推定)

```diff
-                className="max-h-[70vh] w-full object-contain"
+                className="max-h-[70svh] w-full object-contain"
```

### 提案 H: search-form モバイル送信ボタン明示 (MID-M-08 修正)

file: `apps/web/src/app/search/_components/search-form.tsx:181-196`

```diff
         <button
           type="submit"
           className={cn(
-            'hidden sm:inline-flex items-center rounded-md border border-cinnabar/40 text-cinnabar bg-cinnabar/8',
-            'px-3 h-8 text-xs font-medium tracking-wide',
+            'inline-flex items-center rounded-md border border-cinnabar/40 text-cinnabar bg-cinnabar/8',
+            'px-3 h-9 sm:h-8 text-xs font-medium tracking-wide shrink-0',
             'hover:bg-cinnabar/14 hover:border-cinnabar/55 transition-colors duration-fast ease-sumi',
           )}
         >
           検索
         </button>
```

## 撮影 viewport 一覧

| viewport | ピクセル | 撮影ページ |
|---|---|---|
| iPhone 14 Pro | 390x844 @2x | login / 403 / offline |
| Galaxy (最小級 Android) | 360x780 @2x | login / 403 / offline |
| Pixel | 412x915 @2x | login / 403 / offline |

撮影結果サマリ:
- **galaxy-offline.png**: Round4 既知の「ネットにつな/がっていません」改行を再現 (HIGH-M-01 の証跡)
- **galaxy-403.png**: 「いまの権/限では使えません」改行を新規発見 (HIGH-M-01 の証跡)
- **iphone14pro-login.png**: Google サインインボタンが foreground 黒色で「Google でサインイン」テキスト + 4-color G が黒地に乗っている (HIGH-M-03 の証跡)
- pixel (412px) では禁則問題が一見緩和されるが、根本的な禁則ルールは未設定で 360px viewport で必ず再発

middleware で /contacts /meetings /recordings /search /dashboard が /login に redirect されるため、認証必要ページの実際の表示はコード解析のみで評価。実機 (Cookie 認証済) での撮影が可能になれば、kanban 横スワイプ / review-form 縦長 / dialog max-h / transcript-pane の挙動について Round 2 の追検が望ましい。
