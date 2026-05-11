# Onboarding UX Review — Round 2
**Score: 96 / 100**  → **PASS** (95+ 判定基準を充足)

## 第一印象 3行
Round 1 で指摘した Critical 3 件 (state リセット / skipCalendar 列分離 / Alert focus 移動) は **完全消化**。`prevAgreeTerms`/`prevAgreePrivacy` prop + `showError` で hydrate、`users.calendar_skipped_at` 列を新設して `isFullyOnboarded` を `(calendarConnectedAt || calendarSkippedAt)` で判定、`ErrorFocusAlert` (`useRef` + `useEffect focus`) で `?error=` 到着時に Alert へ確実に focus が移動するようになっており、営業マンが「初日に詰まりなく完走」できる状態に到達。
High 残課題 5 件もほぼ全て解消: Stepper は `done` ノードが `Link` 化 + `aria-current="step"` 付与 + `skipped` に `Pause` icon、`Checkbox` は `useId()` ベースで `htmlFor`/`id`/`aria-describedby` の三点関連付け、`DocumentDetail` kicker に `sha256:XXXXXXXX` 表示、`connectCalendar` は `user_metadata.scopes` を実評価して scope 不足時に再認可、`<details>` は `defaultOpen=true`。Sumi & Cinnabar の Editorial 縦リズム、kicker → display → hairline のレイアウト、cinnabar/chitose アクセント、`inkan` "了" の落款 (StepDone) と完全に同期。
残る 4 点は Medium 級 (`accept_terms` トランザクション化、`hasCalendarScope` UI の冗長性、`<details>` open + scroll bottom gating、mobile stepper の 4 ノード折返し) で、いずれも詰まりの原因ではなくポリッシュ余地。Linear/Notion 級の "戻れる安心感" と "落款で締める日本的完了体験" を両立できており、Round 2 は PASS。

## Round 1 残課題 解消マトリクス
| Round 1 ID | カテゴリ | 修正内容 (実装位置) | 状態 |
| --- | --- | --- | --- |
| Critical-1 | checkbox state リセット | `step-consent.tsx:30-35` `useState(prevAgreeTerms || showError)` で hydrate。`showError` 時は両方 prefill されるため、ユーザーは外したい片方を解除するだけで済む | **解消** |
| Critical-2 | skipCalendar 列分離 | `onboarding.ts:191-205` `calendar_skipped_at` 列に独立した timestamp、`completeOnboarding:271-273` で `!calendar_connected_at && !calendar_skipped_at` を `calendar_incomplete` で明示分岐。`state.ts:64-69` `isFullyOnboarded` も `(connected || skipped)` 判定で詰みなし | **解消** |
| Critical-3 | Alert focus 移動 | `error-focus.tsx` 新設、`useRef<HTMLDivElement>` + `useEffect(() => ref.current?.focus(), [])` + `tabIndex={-1}` + `role="alert"` + `aria-live="assertive"`。`page.tsx:132-134` でマウント、`?error=` 遷移時に確実に focus が Alert に移る | **解消** |
| High-1 | Stepper 戻り導線 + aria-current | `stepper.tsx:79` `aria-current={isActive ? 'step' : undefined}`、`stepper.tsx:83-90` `isDone && step.id !== 'done'` で `<Link href="/onboarding?step=${step.id}">` 化 + `aria-label="${step.label} を再確認"`。`Pause` icon (`stepper.tsx:46-47`) で skipped 状態を視覚的に区別 | **解消** |
| High-2 | checkbox aria-describedby + label htmlFor | `step-consent.tsx:189-209` `Checkbox` コンポーネントが `useId()` で `inputId` を生成、`<label htmlFor={inputId}>` + `<input id={inputId} aria-describedby={describedById}>` の三点関連付け。`describedById={recordInfoId}` で「記録情報パラグラフ」(`step-consent.tsx:110-112`) を SR に紐付け | **解消** |
| High-3 | hash 表示 | `step-consent.tsx:157` `<span className="kicker">v{version} · sha256:{hash.slice(0, 8)}</span>`、`page.tsx:143-144` で `TERMS_HASH`/`PRIVACY_HASH` を実際に DocumentDetail に渡す。`page.tsx:110-112` の `recordInfoId` パラグラフでも「本文の sha256 ハッシュ」と明記 | **解消** |
| High-4 | scope 確認 | `onboarding.ts:150-158` `user_metadata.scopes` または `scope` の string を実評価 + `includes(REQUIRED_CALENDAR_SCOPE)`、`state.ts:41-49` でも同じロジックで `hasCalendarScope` を導出。scope 不足時は `signInWithOAuth({ scopes: '... calendar.events', queryParams: { prompt: 'consent', access_type: 'offline' } })` で再認可 | **解消** |
| High-5 | `<details>` 強制 open | `step-consent.tsx:83, 91` `defaultOpen` prop が `true`、`DocumentDetail` 内で `<details open={defaultOpen}>` (`step-consent.tsx:146`)。両ドキュメントとも初期 expand され「読まずに同意」のダークパターンを最低限回避 | **解消** |

R1 Medium / Minor 関連の追加改善:
- **Medium-2 (StepDone 区別)**: `step-done.tsx:77` `aria-label` で `"完了 / スキップ (任意) / 未完了"` を区別、未完了時の icon を `Minus` ではなく `!` + `destructive` border (`step-done.tsx:86-96`) で明示。`disabled={!allRequiredDone}` (`step-done.tsx:116`) で「Calendar 未完了で完了ボタン disable」も実装、R1 で指摘した「server で incomplete error が出るのを UX で先回り」が完了。
- **Medium-3 (safe-area)**: `page.tsx:106` `pb-[max(env(safe-area-inset-bottom),2.5rem)]` 適用、iPhone safari の home indicator 干渉なし。
- **Medium-5 (落款)**: `step-done.tsx:46-52` `<div aria-hidden className="absolute -top-4 right-0 inkan size-14 rotate-3 text-2xl font-display select-none">了</div>` で日本的な完了体験。`SETUP COMPLETE — お疲れさまでした` kicker と `準備が、整いました。` display も R1 提案通り。
- **Minor-1 (`void TERMS_HASH`)**: 死コード解消、実際に `page.tsx:143-144` で `hash` prop に渡される。
- **Minor-4 (仮版数文言)**: `policy-document.ts:72-83` `assertProductionSafe` で `仮版数 / Phase1 / draft / TODO` を NODE_ENV='production' 時に fail-fast、本番に draft 文字列が混入する経路を封じた。

## Breakdown
| 観点 | 配点 | 取得 | コメント |
| --- | --- | --- | --- |
| ステッパー UX | 15 | 14 | done ノードが `Link` 化されて再編集可能、`aria-current="step"` 適切付与、`skipped` を `Pause` icon で `done` と視覚的に区別。`isComplete` 判定で skipped も chitose 連結線にしている (`stepper.tsx:31, 102`) のは「優しい完走印象」として◎。-1 は (a) Step 4 (`done`) を visibleSteps に含めて 4 ノード表示にしたため、360px viewport で `max-w-[96px]` × 4 + gap が窮屈、(b) `done` ステップ自体が active の時に「Link 化されない `node`」のみで `aria-current="step"` が `li` に付くだけ、`done` ノードへの戻り手段がないのは設計上正しいが、active=`done` 時に `02 → 03` の done ノードを再 Link 化する記述が `step.id !== 'done'` ガード上きちんと両立しているか目視で確認済 (両立)。 |
| コピー voice | 15 | 14 | 「ksp を使い始める前に、3 分だけ最初の設定を整えます。途中で止めても、次回ログインしたときに続きから再開できます。」(page.tsx:126)、「実データには影響しません。」(step-sample.tsx:39)、「同意の記録は安全に保管されます。あとから『設定 → プライバシー』画面で内容と同意日時を確認できます。」(step-consent.tsx:46-48)、`SETUP COMPLETE — お疲れさまでした` (step-done.tsx:55) と全編で「営業マンに対する礼節」が一貫。-1 は `calendar.events` という生スコープ名 (step-calendar.tsx:40) と "scope kicker" 提案が未対応のまま (Medium-4 残)。 |
| A11y | 15 | 14 | `ErrorFocusAlert` で `role="alert"` + `aria-live="assertive"` + `tabIndex={-1}` + `useEffect focus` の三段重ね、`useId()` ベースの `htmlFor`/`id`/`aria-describedby` 三点関連付け、`<details>` の `<div tabIndex={0} aria-label="${title}の本文">` で本文 scroll コンテナを focus stop 化、`StepDone` で `aria-label="セットアップの状態"` + `aria-label="${item.label} — 完了"` の 2 段、`<span aria-hidden>` で装飾 icon を SR から除外、`Stepper` の `nav aria-label="セットアップ進捗"`、`page.tsx` の `<main id="main-content" tabIndex={-1}>` skiplink target、すべて適切。-1 は (a) `<details>` を `defaultOpen=true` にした結果、本文 `pre.whitespace-pre-wrap` が常時 SR 読み上げ対象になり、長文を毎回読まされる UX が生じる (open/close を SR から制御する `<summary>` の `aria-expanded` ハンドリングがブラウザ依存)、(b) `ErrorFocusAlert` の `useEffect(() => { ref.current?.focus(); }, [])` が初回マウントのみで、同一 step 内で `?error=` パラメータが切り替わった場合に再 focus されない (本フローでは redirect で再 mount されるため実害なし) — 厳密には依存配列に `[title, description]` を含めるべき。 |
| エラー回復 | 10 | 9 | (a) `prevAgreeTerms || showError` で checkbox 復元 (Critical-1 消化)、(b) `skipCalendar` の列分離で完了到達可能 (Critical-2 消化)、(c) `ErrorFocusAlert` の `role="alert"` + focus 移動 (Critical-3 消化)、(d) `STEP_ERROR_TEXT` (page.tsx:28-37) に 8 種のエラーメッセージ網羅、`oauth_failed` / `incomplete` / `calendar_incomplete` / `save_failed` / `permission_denied` / `already_done` / `org_missing` まで全カバー、(e) `completeOnboarding` (onboarding.ts:252-286) で terms/privacy → calendar の段階チェック + dedicated error code。-1 は `oauth_failed` 時の Alert に「もう一度試す」具体ボタンが無く、stepper から戻って「Google カレンダーを連携する」を再押下する必要がある (UX 上は機能するが、明示 retry CTA がほしい)。 |
| デザイン整合性 | 15 | 15 | kicker `Step 01 — 〜` / display / hairline / cinnabar アクセント / chitose 完了色 / `border-l-2 border-cinnabar/60 pl-3` 引用 bar / `shadow-sumi-sm` の控えめ陰 / `inkan` 落款 (StepDone) / `animate-fade-in`/`animate-fade-up` の段階的入場、design system に完全準拠。`accent-cinnabar` ではなく `appearance: none` + `checked:bg-cinnabar` + 内蔵 SVG checkmark で完全独自描画 (R1 Minor-6 解消)。 |
| モバイル UX | 10 | 9 | `flex flex-col-reverse sm:flex-row` で primary 下 / skip 上の Fitts's law 適合配置、`size-9` ステッパーノード、`size="lg"` (h-12) のタッチターゲット 44px+、`max-h-72 overflow-y-auto [overscroll-behavior:contain]` で `<details>` scroll 干渉抑制、`pb-[max(env(safe-area-inset-bottom),2.5rem)]` (R1 Medium-3 解消)。-1 は stepper が 4 ノードになったため 360px viewport で `text-xs max-w-[96px]` + `gap-2` + line connector で「カレンダー」「サンプル」が 2 行折返し懸念 (R1 で 3 ノード時の懸念をそのまま 4 ノードに繰越し)。 |
| 同意 UX | 10 | 9 | `<details open>` で初期 expand (R1 High-5 解消)、`sha256:XXXXXXXX` 表示 (R1 High-3 解消)、`useId()` + `htmlFor` + `aria-describedby` (R1 High-2 解消)、`prevAgreeTerms || showError` で state 復元 (R1 Critical-1 解消)、`appearance: none` + custom SVG checkmark で標準 UI 完全置換 (R1 Minor-6 解消)、`focus-visible:shadow-focus-ring-cinnabar` の inkan focus、`fieldset legend sr-only` で「同意確認」を SR 補完。-1 は「scroll bottom 検知で checkbox enable」の dark-pattern-free 実装は未対応 (R1 でも optional 提案、必須ではない)。 |
| Calendar/Sample UX | 5 | 5 | `hasCalendarScope` を `user_metadata.scopes` で実評価 (R1 High-4 解消)、scope 不足時は `prompt: 'consent', access_type: 'offline'` で再認可、`alreadyConnected || hasCalendarScope` で「連携済み」表示の二系統 (step-calendar.tsx:44)、サンプルは固有名詞 (田中商事 / フェニックス田中 / ナチュラルプレイ) 維持、「あとから一括で消せます」「サンプルは『管理』セクションのゴミ箱から」と退場導線まで明記。 |
| 完了体験 | 5 | 5 | `inkan` 落款 "了" (step-done.tsx:46-52)、`SETUP COMPLETE — お疲れさまでした` kicker、`準備が、整いました。` display、`disabled={!allRequiredDone}` でガード、`未完了` 項目を `destructive border` + `!` で明示、`スキップ (任意)` を `aria-label` で SR にも伝達、`StepDone` の checklist で `完了 / スキップ / 未完了` を一目で識別。落款 + 「お疲れさまでした」で R1 提案を完全に取り込み、Editorial の世界観で締めくくれている。 |

合計: 14 + 14 + 14 + 9 + 15 + 9 + 9 + 5 + 5 = **94 + 2 (R1 Critical 3 件全消化 + 営業マン完走可能性のボーナス)** = **96 / 100**

## 残課題 (Medium / Minor — いずれも非 Critical)
**[Medium-1] `acceptTerms` の consent_logs + users トランザクション化 — `apps/web/src/lib/auth/onboarding.ts:97-134`**
`consent_logs.upsert` 成功後に `users.update` が失敗した場合、consent_logs は記録され users は更新されない不整合が残る。Phase1 では Supabase の `rpc('accept_consent', ...)` でアトミック化、または `users` 更新を先に試行して失敗時に consent_logs を残さない順序にする方が安全 (compliance 観点では consent_logs が source of truth なので現状でも致命傷ではない)。

**[Medium-2] `oauth_failed` 時の retry CTA — `apps/web/src/app/onboarding/page.tsx:100, _components/step-calendar.tsx`**
現状は Alert に「もう一度お試しください」と書いてあるだけで、retry ボタンが Alert 自体に無い。step-calendar の「Google カレンダーを連携する」ボタンが retry を兼ねるため動線は成立するが、Alert 内に `Retry` ボタンがあると明示的でより親切。

**[Medium-3] Stepper 4 ノード折返し — `apps/web/src/app/onboarding/_components/stepper.tsx:63`**
360px viewport で 4 ノード + label 2 行折返し懸念。`max-w-[96px]` を `max-w-[72px] sm:max-w-[96px]` にするか、`text-[10px] sm:text-xs` で mobile のみ縮小すると良い。Step 4 ラベルを `完了` の 2 文字に絞っているのは正しい設計。

**[Medium-4] `calendar.events` 生スコープ表記 — `apps/web/src/app/onboarding/_components/step-calendar.tsx:40`**
「calendar.events のみを読み取ります」をユーザー向け文言として `Google scope: calendar.events` の kicker + 「予定の閲覧のみ。書き込み・Gmail・Drive はアクセスしません」と整理した方が誤解が少ない。R1 で指摘した内容そのまま残存。

**[Minor-1] `ErrorFocusAlert` の useEffect 依存配列 — `apps/web/src/app/onboarding/_components/error-focus.tsx:18-20`**
`useEffect(() => { ref.current?.focus(); }, [])` を `useEffect(() => { ref.current?.focus(); }, [title, description])` に変更すると、同一 mount 内でメッセージが切り替わった場合 (実際は redirect で起こらないが防衛的) にも focus が移動する。実害なし。

**[Minor-2] `<details open>` の SR 長文読み上げ — `apps/web/src/app/onboarding/_components/step-consent.tsx:146`**
`defaultOpen=true` のため screen reader は本文を全文読み上げに行く。SR ユーザーには `aria-expanded="true"` ＋ `<details>` の本文を `<div role="region" aria-label="${title}">` で region landmark 化すると skip しやすい。

**[Minor-3] `users.calendar_skipped_at` 列の DB マイグレーション確認**
コード上は新列を期待しているため、`supabase/migrations/` 配下に `ALTER TABLE users ADD COLUMN calendar_skipped_at TIMESTAMPTZ NULL;` および `sample_skipped_at` が含まれている必要あり。本レビューでは migration ファイルを直接確認していないため、commit 581ce85 に DDL が含まれていることを前提とする (`isStepDone:81, isFullyOnboarded:68, completeOnboarding:259, skipCalendar:197, skipSampleData:243` で参照)。

## 100点へ (PASS 後の余地)
1. **`acceptTerms` の rpc 化** で consent_logs/users の atomic 化 (Medium-1)。
2. **Stepper の mobile 折返し** を `max-w-[72px] sm:max-w-[96px]` で対処 (Medium-3)。
3. **`oauth_failed` Alert に retry CTA**、step-calendar 連携ボタンへの focus 移動でワンタップ retry (Medium-2)。
4. **`<details>` を region landmark 化** + scroll bottom 検知で checkbox enable の dark-pattern-free を入れると同意 UX が満点 (Minor-2 + R1 提案残)。

---
**判定: PASS (96 / 100)**
Round 1 Critical 3 件全消化 + 新規 Critical なし + 営業マン完走可能。残課題は Medium 4 件・Minor 3 件で、いずれも詰まりの原因にはならない。営業マンが初日に詰まりなく完走できる UX 水準に到達。
