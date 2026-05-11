# Onboarding UX Review — Round 1
**Score: 78 / 100**

## 第一印象 3行
ステッパー＋ stepごとの header (kicker → display → 説明文) という Editorial 縦リズムが揃っており、Sumi & Cinnabar の語彙 (kicker / display / hairline / cinnabar accent / chitose の完了色) はほぼ完璧に体現されている。コピーも「3 分」「途中で止めても続きから再開」「業務目的以外に〜」と営業マンに対する誠実さがあり、Linear/Notion 級の polish が見える。
一方で**完了済みステップに戻る導線が完全に欠落**しており、(stepper はクリックできない)、StepConsent のチェックボックスに `aria-describedby` が無い、Calendar/Sample で skip した結果のフィードバックが無い、エラーメッセージが `aria-live="polite"` のみで focus 移動が無い、など a11y/エラー回復で詰まる要素が複数。
営業マンが「初日に詰まりなく完走」できる水準には到達しているが、ステッパーの戻り、`details` の長文 fold 操作、`onboarded_at が立つまで動かさない skip 状態` の説明が薄く、Linear 級の完成度まではあと一磨き必要。

## Breakdown
| 観点 | 配点 | 取得 | コメント |
| --- | --- | --- | --- |
| ステッパー UX | 15 | 10 | 数字ノード＋hairline 連結＋active の pulse-ink ring は美しいが、`done` ノードに戻り導線 (link / 編集ボタン) が無い。skip 後の任意ステップが視覚的に区別されない (stepper では `done` 状態と skipped を区別する記号が出ない)。stepper に `aria-current="step"` が無い。Step 4「完了」が `visibleSteps` から除外されているのは正しい設計だが、いま 3/4 までしか可視化されない違和感あり (ヘッダ右上の `SETUP` / `COMPLETE` で代替してはいるが、線で示してほしい)。 |
| コピー voice | 15 | 13 | 「ksp を使い始める前に、3 分だけ最初の設定を整えます」「途中で止めても、次回ログインしたときに続きから再開できます」「実データには影響しません」など現場感ある日本語。"calendar.events" を生で見せている (step-calendar 39) のと、`(本文は仮版数 — Phase1 開発中)` を本番フローでユーザーが目にする点が-2。 |
| A11y | 15 | 9 | `aria-live="polite"` は Alert に付いているが (1) Alert は **client navigation 後の初期マウント時に announce されない** (新しいページ・mount 時の `aria-live` は読まれない実装が多い、`role="status"` か `role="alert"` 付与必須)、(2) error 表示時に focus を Alert に移していない、(3) `<input type="checkbox">` (step-consent 152) に対応する `<label>` の `for` が無く、`flex items-start` で囲っているのみで暗黙関連付け、(4) `<details>` の長文 200+ 行を `pre.whitespace-pre-wrap` で 1 つの focus stop に閉じ込めており screen reader の navigation が困難、(5) StepDone の checklist が `<ul>` だが完了/スキップを `kicker` だけで表現しており、SR で「完了」が読まれない (`aria-label` 必要)、(6) `Loader2` のスピン中 `aria-busy` は付くが、pendingLabel `"記録中…"` は `aria-live` 子要素として読まれない (button が live region になっている)。 |
| エラー回復 | 10 | 6 | `?error=consent_required` は表示されるが (a) form が submit 後に router redirect で `agreeTerms` state がリセットされる (`useState` 初期値 `false`) ため、ユーザーが checkbox を 1 つだけ ON にして送信し→error→戻ってきた時に**全部リセット**されている。(b) `skipCalendar` は `calendar_connected_at: null` を上書きするだけで「skipped」とマークする列が無く、`isFullyOnboarded` で必須扱いのままなので、後で `?step=done` を踏ませても `completeOnboarding` で incomplete error。(c) `oauth_failed` 時に retry ボタンが無く error メッセージのみ、戻り先が不明。 |
| デザイン整合性 | 15 | 14 | kicker `Step 01 — 〜` / display `〜です。` / hairline / `border-t-2 border-foreground pt-3` の Editorial slate / cinnabar アクセント / chitose 完了色 / `border-l-2 border-cinnabar/60 pl-3` の引用 bar、すべて design system に完全準拠。-1 は StepDone の checklist で `bg-muted` のスキップ表示が cinnabar/chitose 系から外れている点と、Stepper のラベルが `text-[11px]` でやや小さく Editorial の hierarchy を壊している点。 |
| モバイル UX | 10 | 8 | `flex flex-col-reverse sm:flex-row` で primary button 下 / skip 上の縦配置にしている (Fitts's law 適合)、`size-9` ステッパーノード、`size="lg"` (h-12)、`safe-area` は未対応 (`pb-[env(safe-area-inset-bottom)]` 無し、main の `py-10` のみ)、`<details>` の 200+ 行コンテンツが `max-h-72 overflow-y-auto [overscroll-behavior:contain]` で scroll 干渉抑制してあるのは○。stepper のラベル `max-w-[90px]` で 360px viewport だと「カレンダー」「サンプル」「同意事項」が 4 列で詰まる懸念 (visibleSteps は 3 だが、Step 4 を含めるべき判断と矛盾)。 |
| 同意 UX | 10 | 7 | `<details>` fold は丁寧、`kicker v2026.05.0` で version 露出、cinnabar 引用 bar、`size-5` の checkbox、`focus-visible:shadow-focus-ring-cinnabar` の inkan focus は美しい。-3 は (a) hash 表示が無い (PRIVACY_HASH を import しているのに `void PRIVACY_HASH` で捨てている)、ユーザーの言う「ハッシュ表示」が UI に出ていない、(b) `<details>` が初期 closed で「読まずに同意」を防げない (`open` 属性で initial expand or "最後までスクロールしないと checkbox 有効化しない" UX が欲しい)、(c) `accept_terms` の checkbox が `checked: bg-cinnabar` で inkan accent はあるが、`<input type="checkbox">` の標準 UI と完全に置き換えていない (`appearance: none` 等が無い) ため、ブラウザ既定 UI が見えてしまう懸念。 |
| Calendar/Sample UX | 5 | 4 | 「あとで連携する」「あとで入れる / 必要ない」とトーンが優しい、取得情報の明示 (calendar.events のみ、Gmail/Drive 不参照)、サンプル内訳の固有名詞 (田中商事 / フェニックス田中 / ナチュラルプレイ) は具体的で○。-1 は `connectCalendar` が provider_token を見て即 connected にしてしまう (再認可しないと scope が広がらないリスク)、`hasCalendarScope` の判定が `provider_token` の存在のみで scope を見ていない (state.ts 44)。 |
| 完了体験 | 5 | 4 | checklist で完了/スキップを横並びにする発想は良いが、「サンプルだけスキップ」と「Calendar スキップ」が同じ視覚扱い、Calendar 必須なのに skip 状態で `completeOnboarding` を押せてしまうように見える (実際は server で `?error=incomplete` だが、UX 上は disable 必要)。お祝いの動きが弱い (`Sparkles` を `step-sample` で消費済、StepDone は `ArrowRight` のみ)。 |

## Critical
**[Critical-1] StepConsent: chekbox state がリセットされ、error 後にユーザーが再度両方クリックする必要 — `apps/web/src/app/onboarding/_components/step-consent.tsx:25-27`**

```diff
- const [agreeTerms, setAgreeTerms] = useState(false);
- const [agreePrivacy, setAgreePrivacy] = useState(false);
+ const [agreeTerms, setAgreeTerms] = useState(showError ?? false);
+ const [agreePrivacy, setAgreePrivacy] = useState(showError ?? false);
```
本来は server から `data-prev-agree-terms` を渡して hydrate するか、もしくは error をクライアント側で `useFormState` で扱い state を保持する。最低でも `showError` 時は両方 prefill すべき (どちらかを誤って外したことが分かるなら最良)。

**[Critical-2] skipCalendar が `calendar_connected_at: null` 上書きでスキップを区別できず、完了に到達不可能 — `apps/web/src/lib/auth/onboarding.ts:172-182`**

```diff
 export async function skipCalendar() {
   const ctx = await requireAuthContext();
   const supabase = await createServerClient();
-  await supabase
-    .from('users')
-    .update({ calendar_connected_at: null })
-    .eq('id', ctx.userId);
+  await supabase
+    .from('users')
+    .update({ calendar_skipped_at: new Date().toISOString() })
+    .eq('id', ctx.userId);
   redirect('/onboarding?step=sample');
 }
```
そして `isFullyOnboarded` を `calendarConnectedAt || calendarSkippedAt` で判定するか、`completeOnboarding` を「terms + privacy のみ必須」に緩和する。**現状は skip → done → 完了ボタン → `?error=incomplete` で詰む** (users.calendar_connected_at が null のまま `completeOnboarding` の check が calendar 列を見ていないが、`isFullyOnboarded` がそれを必須にしているため `state.onboardedAt && isFullyOnboarded(state)` が常に false で redirect されず onboarding に留まる)。

**[Critical-3] エラー Alert が `aria-live` のみで、新規 mount 時に screen reader に読まれない & focus が動かない — `apps/web/src/app/onboarding/page.tsx:111`, `step-consent.tsx:42`**

```diff
- <Alert variant="warning" aria-live="polite" className="mb-6 animate-fade-up">
+ <Alert
+   variant="warning"
+   role="alert"
+   aria-live="assertive"
+   tabIndex={-1}
+   ref={errorRef}
+   className="mb-6 animate-fade-up"
+ >
```
client side で `useEffect(() => { if (errorMessage) errorRef.current?.focus(); }, [errorMessage])` を足し、`?error=` 付きで遷移したら必ず Alert に focus を移す。`role="alert"` + `aria-live="assertive"` の冗長指定で SR 互換性確保。

## High
**[High-1] Stepper に `aria-current="step"` が無い & 完了済みノードが clickable じゃない — `apps/web/src/app/onboarding/_components/stepper.tsx:25-77`**

```diff
- <li key={step.id} className="flex items-center flex-1">
+ <li
+   key={step.id}
+   className="flex items-center flex-1"
+   aria-current={isActive ? 'step' : undefined}
+ >
   <div className="flex flex-col items-center gap-2 flex-1">
-    <div className={...}>
+    {isDone ? (
+      <Link href={`/onboarding?step=${step.id}`} className="...">
         ...
+      </Link>
+    ) : (
+      <div className={...}>...</div>
+    )}
```
done のノードは「戻って確認 / 再編集」する手段が必要。Linear/Notion なら必ず戻れる。

**[High-2] Checkbox に `aria-describedby` が無く、SR で「同意の記録には版数 (2026.05.0 / 2026.05.0) と内容のハッシュ・〜が含まれます」が arbitrary な段落になる — `apps/web/src/app/onboarding/_components/step-consent.tsx:79-83, 152-164`**

```diff
- <input type="checkbox" name={name} checked={checked} ... />
+ <input
+   type="checkbox"
+   id={`onb-${name}`}
+   name={name}
+   checked={checked}
+   onChange={(e) => onChange(e.target.checked)}
+   aria-describedby="onb-consent-record-info"
+   ...
+ />
- <p className="text-xs text-muted-foreground">
+ <p id="onb-consent-record-info" className="text-xs text-muted-foreground">
    同意の記録には、版数 ({termsVersion} / {privacyVersion}) と内容のハッシュ・同意日時・接続元情報が含まれます。
  </p>
```
さらに `<label htmlFor={`onb-${name}`}>` で明示関連付け (現状は暗黙的 wrap、iOS Safari の VoiceOver で誤読あり)。

**[High-3] hash 表示の約束が果たされていない — `apps/web/src/app/onboarding/page.tsx:22-23` (`void TERMS_HASH` で捨てている) と `step-consent.tsx:81`**

設計書 `19_onboarding_initial` で hash 表示が約束されているなら、kicker で 8 桁表示すべき:
```diff
- <p className="kicker">v{version}</p>
+ <p className="kicker">v{version} · sha256:{hash.slice(0, 8)}</p>
```
`DocumentDetail` に `hash` prop を追加し、page.tsx で `TERMS_HASH` / `PRIVACY_HASH` を実際に渡す。

**[High-4] `connectCalendar` が scope を確認せず provider_token のみで完了判定 — `apps/web/src/lib/auth/onboarding.ts:141-167`**

```diff
- const providerToken = session.session?.provider_token ?? null;
- if (!providerToken) {
+ const providerToken = session.session?.provider_token ?? null;
+ const grantedScopes = session.session?.user.user_metadata?.scopes ?? '';
+ const hasCalendarEvents = grantedScopes.includes('calendar.events');
+ if (!providerToken || !hasCalendarEvents) {
    // OAuth re-run
  }
```
初回 sign-in が `openid email profile` のみ通っているケースで、`calendar.events` 無しに `connectCalendar` を完了扱いしてしまう。

**[High-5] StepConsent の `<details>` を 1 つも開かずに submit できる — `apps/web/src/app/onboarding/_components/step-consent.tsx:109-136`**

ダークパターン回避のため、`details` を `open` 属性 default ON にするか、scroll bottom を検知してから checkbox を enable にする dark-pattern-free な実装が必要。最小限の修正案:
```diff
- <details className="group rounded-lg border ...">
+ <details open className="group rounded-lg border ...">
```

## Medium
**[Medium-1] `?error=` 後の form state 復元: server から `prevAgree` を渡す — `page.tsx:117-126`** — 上の Critical-1 と関連、`<StepConsent prevAgreeTerms={...} prevAgreePrivacy={...} />` で hydrate するのが最良。

**[Medium-2] StepDone の checklist で「Calendar スキップ」と「サンプルスキップ」を視覚的に区別 — `step-done.tsx:62-63`**

```diff
- <span className="kicker">{item.done ? '完了' : 'スキップ'}</span>
+ <span className="kicker">
+   {item.done ? '完了' : item.optional ? 'スキップ (任意)' : '未完了'}
+ </span>
```
さらに Calendar が `未完了` で `ホームへ進む` を `disabled` にする (server で incomplete error が出るのを UX で先回り)。

**[Medium-3] mobile safe-area & タッチターゲット — `page.tsx:92`**

```diff
- className="mx-auto min-h-dvh max-w-2xl px-6 py-10 md:py-16 outline-none flex flex-col"
+ className="mx-auto min-h-dvh max-w-2xl px-6 pt-10 md:pt-16 pb-[max(env(safe-area-inset-bottom),2.5rem)] outline-none flex flex-col"
```

**[Medium-4] StepCalendar の取得情報が `calendar.events` 内訳のみで、ユーザーは「タイトル」も入ると認識する必要 — `step-calendar.tsx:39-40`**

「(calendar.events) のみを読み取ります」と書いてあるが、その下のリストで「タイトル / 日時 / 出席者 / 会議URL」と書いており、ユーザー的には「タイトルも読まれるのか」と気になる可能性。kicker で `Google scope: calendar.events` と整理した方が誤解が少ない。

**[Medium-5] StepDone の完了体験を強化 — `step-done.tsx:27-37`**

```diff
  <header className="space-y-2">
-   <p className="kicker">セットアップ完了</p>
-   <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
-     準備ができました。
-   </h2>
+   <p className="kicker">SETUP COMPLETE — お疲れさまでした</p>
+   <h2 className="display text-3xl md:text-4xl font-semibold tracking-crisp">
+     準備が、整いました。
+   </h2>
+   <span aria-hidden className="inkan absolute right-6 top-10 size-12 rotate-3">了</span>
```
落款 (inkan) を完了体験で出すと Editorial の世界観が締まる。

**[Medium-6] Stepper の label が `text-[11px]` で WCAG 2.5.5 (target size) は満たすが視認性が低い — `stepper.tsx:55`**

```diff
- 'text-[11px] font-medium tracking-crisp text-center leading-tight max-w-[90px]',
+ 'text-xs font-medium tracking-crisp text-center leading-tight max-w-[96px]',
```

**[Medium-7] `acceptTerms` で consent_logs insert がトランザクションでない — `lib/auth/onboarding.ts:106-131`**

consent_logs insert 失敗時に users 更新が走らないように、もしくは逆順 (users 先) 失敗時に rollback できないため、Phase1 でも `supabase.rpc('accept_consent', {...})` で 1 トランザクションにしたい。

## Minor
**[Minor-1] `void TERMS_HASH; void PRIVACY_HASH;` — `page.tsx:22-23`** 死コードか、本来 hash 表示する予定だったコメントを足す or 削除。

**[Minor-2] `kicker` 内の `SETUP` / `COMPLETE` 切替が active === 'done' 判定のみ — `page.tsx:96`** 任意ステップ skipped を表現する `SKIPPING` が無く、stepper 状態と kicker が独立。

**[Minor-3] Step 番号の桁数 — `stepper.tsx:43`**

`{(idx + 1).toString().padStart(2, '0')}` で `01 / 02 / 03` は美しいが、step 4 (done) を `visibleSteps.filter` で除外しているので最大 `03`。完了画面で `04 ✓` を出すと充実感が出る。

**[Minor-4] Consent 文中の `(本文は仮版数 — Phase1 開発中。本番ローンチ前に法務チームの正式版へ差し替え)` を本番フローで露出 — `lib/auth/onboarding.ts:31, 57`** 開発ビルドのみ表示にすべき (`if (process.env.NODE_ENV !== 'production')` で wrap)。

**[Minor-5] StepCalendar / StepSample が `<form action={skip}>` を 2 つ並べているため、tab 順が `skipボタン → connectボタン` の **flex 視覚順と逆** — `step-calendar.tsx:66-77`** モバイルで `flex-col-reverse` 時は視覚=tab が一致するが、desktop で `sm:flex-row` 時に tab で primary が先になる。`order` を CSS で揃えるか tabindex で明示。

**[Minor-6] checkbox の `accent-cinnabar` と `checked:bg-cinnabar checked:border-cinnabar` を併用しているが、`appearance: none` 系の reset が無くブラウザ差で表示崩れる可能性 — `step-consent.tsx:157-163`**

## 100点へ
1. **Critical 3 件 (state 復元 / skipCalendar 列分離 / Alert focus 移動) を必ず潰す** — ここが現場で詰まる原因の 9 割。
2. **Stepper を `aria-current` + clickable done ノードに昇格させ、Linear/Notion 級の「戻れる安心感」を実装**。
3. **`?error=` 時に StepConsent の checkbox 状態を server 経由で復元 (`useFormState` か prop hydrate)、+ hash 表示を約束通り出す**。
4. **StepDone に落款 (inkan) と「お疲れさまでした」の Editorial 締めくくり、Calendar 未完了時の `disabled` 状態を視覚化**。
5. A11y を SR 実機で 1 周 (VoiceOver + NVDA) 通して `aria-describedby` / `<label htmlFor>` / `role="alert"` の挙動を検証する。これで 95+。
