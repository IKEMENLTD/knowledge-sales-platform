# Architecture / Code Quality Review — Onboarding Round 3 (Final)

- 対象: commit `7bcffb5`
  - `apps/web/src/lib/onboarding/core.ts` (新規 — pure 関数層)
  - `apps/web/src/lib/onboarding/messages.ts` (新規 — error code map)
  - `apps/web/src/lib/auth/onboarding.ts` (薄いアダプタ + reportAndRedirect + captureException)
  - `apps/web/src/app/onboarding/page.tsx` (describeOnboardingError 使用)
  - `packages/db/src/migrations/manual/0031_onboarding_polish.sql` (新規)
  - 既存: `apps/web/src/lib/sentry.ts` (captureException ラッパ)
- 仕様根拠: `docs/spec/sales_platform_design_spec_v2.xlsx`
- 観点: Next.js 15 App Router Server Actions / Supabase RLS / TypeScript strict
- 採点ルール: Critical -8 / High -5 / Medium -2 / Minor -1
- 比較基準: Round 1 (48.0) / Round 2 (90.0)

---

## スコア推移

| Round | Score | 判定 | コミット |
|-------|------:|------|----------|
| 1 | 48.0 | FAIL (Critical 4 / High 8) | 初版 |
| 2 | 90.0 | Conditional PASS | `581ce85` |
| **3** | **96.5** | **PASS** | `7bcffb5` |

---

## Round 2 残課題の解消マトリクス

| ID | 区分 | Round 2 状態 | Round 3 修正 | 状態 |
|----|------|--------------|--------------|------|
| **R2-O-01** | High (H8 残) | acceptTermsCore DI 形未導入 (-1.5) | `lib/onboarding/core.ts` に 8 関数 (`parseConsentForm` / `parseWithdrawForm` / `buildConsentRows` / `evaluateCompletion` / `safeIp` / `mapErrorToCode` / `isPostgresPermissionDenied` / `isUniqueViolation`) を pure 関数として切出し、Zod スキーマ (ConsentInput / WithdrawInput) と AuthContext / ConsentRow 型を export。`auth/onboarding.ts` の server action は `requireAuthContext` 取得 → core 関数呼び出し → supabase 呼び出し → `reportAndRedirect` の薄いアダプタへ削減。Supabase / Next.js / headers 依存が無い純粋関数なので Vitest で単体テスト可能。 | **完全解消** |
| **R2-O-04** | Minor (-1) | 0029 default org_id DROP 予約未着手 | `0031_onboarding_polish.sql` にて `consent_logs.org_id` に運用コメントを付与 (`Phase2 切替で default DROP 予定。INSERT 側で明示渡し済み`)。同時に `accepted_at` を `drop not null` (R2-O-07 と同時施行)。default DROP の本実行は Phase2 cutover で `0032` 系として明示分離する設計判断は妥当。 | **解消** (運用合意済) |
| **R2-O-05** | Minor (-1) | Sentry / logger 接続未 | `lib/sentry.ts` の `captureException(error, context)` を `requireAuthContext` / `reportAndRedirect` / `connectCalendar.oauth` 経路に接続。全 redirect-on-error 経路で `{ action, ... }` コンテキスト付き send。silent redirect の運用観測性が確保された。 | **完全解消** |
| **R2-O-07** | Minor (-1) | `created_at` / `accepted_at` 役割重複 | `0031` で `accepted_at` を nullable 化 + 3 列に column comment (`accepted_at` = 宣言された同意発効時刻 / `created_at` = INSERT 物理時刻、append-only / `org_id` = Phase2 DROP 予定) を付与。役割が DB 側に明文化された。 | **解消** |
| **R2-O-08** | Minor (-1) | STEP_ERROR_TEXT inline | `lib/onboarding/messages.ts` に `STEP_ERROR_MESSAGES` (型安全 `OnboardingErrorCode`) + `describeOnboardingError(code)` を新設。`page.tsx` は `describeOnboardingError(params.error)` 一行で参照。`PRIVACY_SETTINGS_MESSAGES` も併設し i18n grep 一発化を実現。 | **完全解消** |

### Phase1.1 持ち越し合意済 (採点には加味しない)

| ID | 内容 | 合意 |
|----|------|------|
| R2-O-02 | hasCalendarScope の永続化 (`user_oauth_tokens` テーブル化) | Phase1.1 |
| R2-O-03 | Database 型自動生成 (`row.org_id as string` 解消) | Phase1.1 |
| R2-O-06 | `onboarding_progress` 1 テーブル化 | Phase2 で step3/5/6 追加時 |

---

## 採点 Breakdown (Round 1 → 2 → 3)

| # | 観点 | 配点 | R1 | R2 | **R3** | コメント |
|---|------|-----:|---:|---:|-----:|---|
| 1 | Server Action 設計 | 20 | 7.0 | 19.0 | **20.0** | R2-O-01 完全解消。`core.ts` の pure 関数化で server action は全て「parse → context → core 関数 → supabase → reportAndRedirect」の同一骨格に揃った。Zod parse / mapErrorToCode / buildConsentRows / evaluateCompletion が DI 可能。満点。 |
| 2 | 状態管理 | 15 | 8.0 | 13.5 | **14.0** | `evaluateCompletion` が pure 関数として切り出され、`completeOnboarding` から「state machine としての判定ロジック」が完全分離。R2-O-06 の onboarding_progress 1 テーブル化のみ残 (-1)。 |
| 3 | RLS / セキュリティ境界 | 15 | 5.0 | 14.0 | **14.5** | 0031 で `consent_logs.org_id` の Phase2 DROP 計画を column comment で明文化、INSERT 側で常に `ctx.orgId` 明示渡しという二重防御が文書化された。`accepted_at` nullable で将来 future-dated 同意 (legal hold 等) にも対応可能。`org_id` default DROP の本実行が Phase2 まで残ることのみ -0.5。 |
| 4 | 型安全性 | 15 | 10.0 | 13.0 | **14.0** | `OnboardingErrorCode` keyof typeof + Zod `infer` で error map と form input が両方型安全。`AuthContext` / `ConsentRow` / `ConsentInputT` / `WithdrawInputT` が core から export され server action / 将来の REST endpoint で共有可能。`row.org_id as string` (Database 型生成未) が 1 箇所だけ残るので -1。 |
| 5 | SQL 設計 | 10 | 6.0 | 9.0 | **9.5** | 0031 の column comment 3 本で `created_at` / `accepted_at` / `org_id` の意味論が DB 側に固定された。`do $$ ... exception when others then null` で再実行安全。`accepted_at drop not null` も合意済の future-dated 同意ユースケースを開放。Phase2 の `org_id default` DROP migration が予約コメントのみで実 migration 化されていない点だけ -0.5。 |
| 6 | エラー回復 | 10 | 3.0 | 9.0 | **10.0** | R2-O-05 完全解消。`reportAndRedirect(target, action, e)` で全 error 経路が `captureException(e, { action })` を経由してから redirect。`requireAuthContext` の org_missing 経路、`connectCalendar.oauth` 経路も独立 captureException 接続済。silent redirect の観測性問題が完全に解消。満点。 |
| 7 | テスタビリティ | 5 | 2.0 | 3.5 | **5.0** | R2-O-01 完全解消。`core.ts` 全 8 関数は Headers / Postgres error / FormData / users row を引数で受け取る pure 関数で、Vitest で next/navigation / next/headers モック無しでテスト可能。`buildConsentRows` / `evaluateCompletion` / `mapErrorToCode` / `parseConsentForm` / `safeIp` (cf-connecting-ip / x-forwarded-for / x-real-ip の優先順位) は典型的テスト対象。満点。 |
| 8 | 拡張性 | 5 | 3.0 | 4.0 | **4.5** | error code を `OnboardingErrorCode` 型で集約し、新規 error 追加時の改修箇所が `messages.ts` 1 ファイルに集約 (i18n 移行も同様)。step 追加コストは R2 から変化無いが、step 状態評価 (`evaluateCompletion`) が pure 関数化されたため step 追加時の影響範囲は最小化された。onboarding_progress 1 テーブル化までは至らず -0.5。 |
| 9 | 読みやすさ | 5 | 4.0 | 5.0 | **5.0** | `auth/onboarding.ts` が 252 行 → 「インポート + helper 2 個 + action 7 個」の同一骨格に揃い、各 action が 15-30 行で読み切れる。`reportAndRedirect` で error handling boilerplate が 1 行化。`describeOnboardingError` で UI 側も grep 一発。満点維持。 |
| **合計** | **100** | | **48.0** | **90.0** | **96.5** | |

---

## 判定: **PASS — 96.5 / 100**

- Round 2 残課題 R2-O-01 / R2-O-04 / R2-O-05 / R2-O-07 / R2-O-08 は **全て解消**。
- 新規 Critical / High **無し**。
- Phase1.1 持ち越しの R2-O-02 / R2-O-03 / R2-O-06 は採点上 -3.5 として控除済で、それでも 96.5 帯に着地。
- 実運用デプロイ可。`acceptTermsCore` の pure 関数化と reportAndRedirect の集約により、本ファイル群は Senior エンジニア視点で **「テスト・観測・保守の三点が揃った参照実装」** に到達。

---

## 解消の質的評価 (Senior エンジニア視点)

### R2-O-01 (核心修正)

`lib/onboarding/core.ts` の pure 関数層は単に「行を移した」のではなく、**境界の引き方が良い**。

1. `safeIp(headers: { get(name: string): string | null })` — Headers 型に直接依存せず get メソッドを持つ duck type を受ける。Vitest で `{ get: (k) => map[k] ?? null }` を渡せば即テスト可能。Round 2 までは `headers()` を直呼びしていたため Next.js context 必須だった。
2. `evaluateCompletion(row)` — `completeOnboarding` の最重要セキュリティ判定 (URL `?step=done` 改ざんで dashboard に飛ばせるかどうか) が「users 行 4 列 → `{ ok: true } | { ok: false, code }`」の純粋関数になった。攻撃面を分離してテスト可能化したのは設計として正しい順序。
3. `mapErrorToCode(e)` を `mapErrorToParam` から改名し、`reportAndRedirect` 側で URL 連結する分業に揃えた。命名がコードの責務を反映している。
4. Zod スキーマ (`ConsentInput` / `WithdrawInput`) を core に置いたことで、将来 REST endpoint (AP-138 POST /api/onboarding/sample-mode) を追加するとき、同じ Zod スキーマを `route.ts` から再利用できる。Phase1.1 で REST 化する際の整合性が事前に確保された。

### R2-O-05 (観測性)

`reportAndRedirect` の引数設計 `(target, action, e)` が良い。

- `action: string` を `'acceptTerms.consent_logs.upsert'` / `'connectCalendar.users.update'` のような階層命名で渡しており、Sentry のフィルタ・ダッシュボード作成時に grep 可能。
- `redirect` は `never` を返すので `reportAndRedirect(...): never` 宣言で型推論も成立。Round 2 までは redirect 後の `return` 漏れリスクがあったが、ここで完全に閉じた。
- `captureException` が DSN 未設定環境でも try-catch で握り潰されるため、開発環境クラッシュ無し。本番のみ実 Sentry に届く設計。

### R2-O-07 / R2-O-04 (DB 意味論の明文化)

column comment を「未来の自分への運用 spec」として使う設計は良い。`accepted_at` を「宣言された同意発効時刻」、`created_at` を「INSERT 物理時刻、append-only」、`org_id` を「Phase2 切替で default DROP 予定」と DB 側に書き込んだことで、 Schema を `\d+ consent_logs` で見るだけで意図が伝わる。GDPR audit 対応で `created_at` と `accepted_at` の意味が問われたとき、コメントが一次資料になる。

### R2-O-08 (UI 側との結合度低下)

`STEP_ERROR_MESSAGES` を `as const` + `keyof typeof` で `OnboardingErrorCode` を導出したのは TS strict 環境での慣用句として満点。`describeOnboardingError` が `string | null | undefined` を受けるシグネチャになっているのは、`params.error` (Next.js search params) の実型 (`string | string[] | undefined`) を意識した堅牢化と読める。

---

## 設計仕様との整合性 (`19_onboarding_initial` / `08_security_rls` / `04_api_endpoints`)

R2 から変化なし、7/9 PASS 維持 (Step3/5/6/AP-138 は Phase1 scope 外、`docs/spec` 側へ scope 明記が残作業)。

| 仕様項目 | R2 | R3 |
|----------|----|----|
| Step1 / Step2 / Step4 / consent_blanket / 08_security_rls | ✓ | ✓ |
| Step3/5/6 | ✗ (scope 外) | ✗ (scope 外) |
| AP-138 | △ | △ (Zod スキーマが core に出たので REST 化容易性は上昇) |

---

## まとめ (3 行)

1. Round 2 残課題 **R2-O-01 / 04 / 05 / 07 / 08 を全件解消**。新規 Critical / High 無し。
2. `lib/onboarding/core.ts` の pure 関数層と `reportAndRedirect` の集約により、テスタビリティ・観測性・保守性の三点が同時に達成された。Senior エンジニア視点で「実装としてのお手本」段階。
3. **判定: PASS (96.5 / 100)**。Phase1.1 で R2-O-02 / 03 / 06 (永続スコープ / DB 型生成 / onboarding_progress テーブル化) を吸収すれば 99 帯。本 PR は **即 merge 可**。
