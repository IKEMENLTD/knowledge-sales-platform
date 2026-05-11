# Onboarding 実装レビュー — Compliance / Privacy 観点 (Round 1)

- **対象 commit**: 571d804
- **レビュアー**: Compliance / Privacy 専門 (個人情報保護法 + EU GDPR + 社内コンプラ)
- **対象範囲**:
  - `apps/web/src/app/onboarding/` (page.tsx, layout.tsx, _components/*)
  - `apps/web/src/lib/auth/onboarding.ts`
  - `apps/web/src/lib/onboarding/state.ts`
  - `packages/db/src/migrations/manual/0029_consent_logs.sql`
  - 設計書: `sales_platform_design_spec_v2.xlsx` の `16_compliance_legal`, `19_onboarding_initial`, `08_security_rls`, `25_v2_review_resolutions`
- **判定基準**: Big4 監査法人の compliance 監査を通せるレベル + 個人情報保護法・GDPR 完全準拠 + 撤回権担保 = 100

---

## 総合点: **63 / 100**

> 基本的な「同意記録の最低限の証跡」「scope minimization」「目的明示」は揃っており、骨格としては監査可能なベースに乗っている。
> ただし **撤回 UI が無い・content_hash の元本(規約本文)を永続化していない・規約本文が「仮版数」のままハードコード・Step3 サンプルで他人の `org_id` を書き込める・consent UPDATE policy で本来不変であるべき列まで更新を許してしまっている** など、Big4 監査では一発で指摘される穴がいくつか残る。法令違反相当 Critical が 1 件 (撤回権実装不在 / GDPR Art.7(3)) 、High が複数。

| # | 観点 | 配点 | 取得点 | コメント |
|---|------|------|--------|----------|
| 1 | 同意記録の証跡性 | 20 | 14 | 列構成は十分。ただし append-only 強制が UPDATE policy で完全に担保できていない。content_hash chain も無し |
| 2 | コンテンツハッシュ管理 | 15 | 9 | sha256 は付くが、元本 (TERMS_BODY) を永続化せず TS リテラルに置いており再現困難。版数も二箇所バラバラに置かれる |
| 3 | 撤回権の保証 | 10 | 2 | DB 列はあるが、撤回 UI/API/Server Action 全て未実装。GDPR Art.7(3) を満たさない |
| 4 | RLS | 10 | 6 | self_select / self_insert は OK、admin/legal も OK、DELETE REVOKE も OK。ただし UPDATE policy が `withdrawn_at` 以外も書き換え可能でザル |
| 5 | スコープ最小化 | 10 | 9 | calendar.events のみ・Gmail/Drive は要求せず・UI でもその旨を明示 |
| 6 | 目的明示 | 10 | 7 | Step1/Step2 は明示。ただし「保管期間 / 委託先」が UI 直前(`step-consent`)に出ない (`<details>` に隠れる)、`Anthropic/OpenAI` を「指定する委託先」とだけ書き越境移転に触れていない |
| 7 | 法令準拠 | 10 | 5 | 個情法 18 条「利用目的の特定」・27 条「第三者提供」・28 条「越境移転」、GDPR Art.13/Art.7/Art.46 にギャップ多数 |
| 8 | 保管・削除 | 10 | 11 → cap 10 | プライバシーポリシー本文に「3年/退職60日」明示。`SOFT_DELETE_GRACE_DAYS=30` と数字が二系統あり微差、ただし退職SOPは別シート定義あり ➜ 9 |

合計 = 14 + 9 + 2 + 6 + 9 + 7 + 5 + 9 = **61** … round 補正 +2 (現場運用上は最小限走る) = **63 / 100**

---

## Critical (-8 each) — 法令違反リスク

### C-1. 同意撤回 (Right to Withdraw) の機能が実装されていない — **-8**

- **症状**: `consent_logs.withdrawn_at` カラムは DB に存在し、PRIVACY_BODY 第5項にも「撤回できます」と記載しているが、撤回を行う Server Action / API / UI が **一切存在しない** (`apps/web/src/lib/auth/onboarding.ts` には withdraw 関数がない、`apps/web/src/app/onboarding/` 配下にも撤回画面がない)。
- **法的根拠**:
  - **GDPR Art.7(3)**: "The data subject shall have the right to withdraw his or her consent at any time. … It shall be **as easy to withdraw as to give consent.**" — 同意撤回はチェックボックスONと同じ操作量で可能でなければならない。
  - **個人情報保護法 第22条 (個人データの正確性確保・利用停止等)**, **第35条 (利用停止・消去等の請求)** — 本人は利用停止を請求できる。請求ルートが画面に存在しないと「請求権の実効性」を欠く。
- **監査インパクト**: Big4 監査 / DPIA レビュー / DPO 監督いずれも一発指摘案件。「同意を取る画面はあるのに撤回画面が無い」は典型的な GDPR 違反パターン。
- **是正案**:
  1. `/settings/privacy` に「同意の確認・撤回」セクションを設置。
  2. `withdrawConsent(consentType: 'terms_of_service' | 'privacy_policy' | …)` Server Action を実装し、`UPDATE consent_logs SET withdrawn_at = now() WHERE user_id = auth.uid() AND consent_type = $1 AND withdrawn_at IS NULL` を発行。
  3. 撤回後は再ログイン時に onboarding に戻し、再同意フローを走らせる (= 「撤回後の挙動」を明文化)。
  4. UI 上に「撤回すると本サービスの一部または全部が使えなくなります」の事前告知 (GDPR Art.7(3) 第2文)。

### (Critical はこの1件)

---

## High (-5 each) — コンプラ監査で必ず指摘される

### H-1. `consent_logs` の UPDATE policy が `withdrawn_at` 列に限定されていない — **-5**

- **症状**: migration `0029_consent_logs.sql` line 58-62:
  ```sql
  create policy consent_logs_self_withdraw on public.consent_logs
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  ```
  コメントには「UPDATE は撤回 (withdrawn_at) のみ許可 — それ以外の列は変更不可」と書いてあるが、**実際には `using/with check` が user_id 一致しか見ておらず、`content_hash` や `version`, `accepted_at` まで全部書き換え可能**。これでは「append-only な証跡」ではなく「自分で過去の同意ハッシュを書き換えられる」状態。
- **法的根拠**:
  - **GDPR Art.5(1)(f) integrity and confidentiality (security principle)** — 改ざん耐性を持って処理しなければならない。
  - **個人情報保護法 第23条 (安全管理措置)** — 漏えい・滅失・**改ざんの防止**を含む。
- **是正案**: BEFORE UPDATE trigger で `OLD.content_hash`, `OLD.version`, `OLD.consent_type`, `OLD.user_id`, `OLD.accepted_at`, `OLD.ip_address`, `OLD.user_agent`, `OLD.created_at` が変わっていたら RAISE EXCEPTION。または列レベルで `GRANT UPDATE (withdrawn_at) ON consent_logs TO authenticated` の形にして、UPDATE policy 側はそのまま使う。

### H-2. content_hash の「元本」が永続化されていない (改ざん検知が成立しない) — **-5**

- **症状**: `apps/web/src/lib/auth/onboarding.ts` line 14-58 で `TERMS_BODY` / `PRIVACY_BODY` をソースコードに直書きし、sha256 を取って `content_hash` 列に入れている。しかし規約**本文そのもの**は DB にもオブジェクトストレージにも保存されていない。
- **何が問題か**:
  - 2 年後に「ユーザーが v2026.05.0 のときに同意した規約本文は何だったか」を監査人に提示できない。git history を辿る必要があり、Big4 監査では「公式記録ではない (= 改ざん可能)」とみなされる。
  - 後で本文だけ書き換えて同じ version 文字列のままデプロイすると、過去ハッシュと新本文が一致しなくなる、という検知はできるが、**新本文 = 過去本文だったかを後から確認できない**。
- **法的根拠**:
  - **個人情報保護法 第21条 (利用目的の通知)** — 本人が同意した時点の利用目的を「再表示できる」ことが (実務上の) 説明責任。
  - **GDPR Art.7(1)**: "the controller shall be **able to demonstrate** that the data subject has consented to processing of his or her personal data." — 「同意したことを証明できる」には同意対象の内容を持っていることが含まれる。
- **是正案**:
  - `legal_documents (id, type, version, body, sha256, effective_from, effective_to, published_by)` テーブルを新設し、`consent_logs.legal_document_id (uuid)` を FK で持つ。
  - 規約改版は本テーブルに INSERT (UPDATE 禁止 / DELETE 禁止)。
  - 旧版は R2 WORM (Object Lock) にも同時保存し、ハッシュを cross-verify。

### H-3. 越境移転 (個情法第28条) / GDPR Art.46 への言及が不足 — **-5**

- **症状**: `PRIVACY_BODY` 第2項に「委託先 (Anthropic / OpenAI / Cloudflare / Render / Supabase) を通じて処理されます」とのみ記載。**国名・所在地・移転根拠 (SCC / DPA 締結状況) ・本人が当該情報を取得する手段** が記載されていない。
- **法的根拠**:
  - **個人情報保護法 第28条 (外国にある第三者への提供の制限)** および同法施行規則第17条 — 「外国の名称」「個人情報の保護に関する制度」「第三者が講ずる措置」を本人通知 (or 同意取得時開示) する必要あり。
  - **GDPR Art.13(1)(f)**: "where applicable, … the intention to transfer personal data to a third country … and reference to the appropriate or suitable safeguards (Art.46 SCCs)".
- **監査インパクト**: Anthropic (米国)、OpenAI (米国)、Cloudflare (米国)、Render (米国)、Supabase (シンガポール/EU) — 全社が日本国外で個情法 28 条が直接適用される。法務監査一発指摘案件。
- **是正案**: PRIVACY_BODY に以下を追記し、版数を上げる:
  ```
  2-1. 外国にある第三者への提供
  本サービスのデータは下記の国に所在する委託先で処理されます。
    - Anthropic (米国 / 連邦取引委員会 FTC 監督下 / DPA + SCC 締結済み)
    - OpenAI (米国 / 同上)
    - Cloudflare (米国 / 同上)
    - Render (米国 / 同上)
    - Supabase (シンガポール / PDPA / DPA + SCC 締結済み)
  各国の個人情報保護制度は当社の「外国制度に関する情報」ページ ({URL}) で常時公開しています。
  ```

### H-4. UI 上での「目的明示・取得情報・委託先」が `<details>` (アコーディオン) に隠れている — **-5**

- **症状**: `apps/web/src/app/onboarding/_components/step-consent.tsx` line 109-130 で、規約本文は `<details>` 要素 (デフォルト閉じている) の中。**閉じたままチェックボックス2つだけ ON にしてサブミット可能**。
- **法的根拠**:
  - **個人情報保護法 第21条 (取得に際しての利用目的の通知等)** — 利用目的を「本人が容易に知り得る状態」で通知する必要あり。アコーディオン閉が許容されるかはガイドライン上微妙だが、Big4 監査では "dark pattern" として High 指摘。
  - **GDPR Recital 32, Art.7(2)**: "the request for consent shall be presented … in an **intelligible and easily accessible form**, using **clear and plain language**." — 取得情報・利用目的・受領者・保管期間は「容易にアクセス可能」でなければならない。隠す = 違反。
- **是正案**:
  - 取得情報・利用目的・委託先・保管期間の **サマリー (3-5 行)** をチェックボックス直上に常時表示。
  - 全文閲覧は `<details>` のままで OK、ただし「全文を見る」ボタンの状態は `aria-expanded` で適切に。
  - 「最後までスクロールしないとチェック ON できない」スクロール強制が業界ベストプラクティス。

### H-5. 「仮版数 — Phase1 開発中」のまま本番に出る可能性 — **-5**

- **症状**: `TERMS_BODY` / `PRIVACY_BODY` の末尾に「(本文は仮版数 — Phase1 開発中。本番ローンチ前に法務チームの正式版へ差し替え)」と書かれており、`TERMS_VERSION = '2026.05.0'`。**この文字列が prod に流出した瞬間にコンプラ事故**。
- **法的根拠**: 直接の条文違反ではないが、「未確定の規約に対して同意取得 → ユーザーは自分が何に同意したか正確に把握できない」 → **GDPR Art.7(2) 不適切な consent 取得**, 個情法 21 条「容易に知り得る状態にすること」抵触。
- **是正案**:
  1. `lib/auth/onboarding.ts` の TS リテラル直書きをやめ、`legal_documents` テーブル (H-2 で提案) から取得する。
  2. CI で `TERMS_BODY` / `PRIVACY_BODY` に「仮版数」「Phase1 開発中」文字列が含まれていたら `NODE_ENV=production` で build を fail させる guard を実装。
  3. 法務 sign-off 後に `2026.05.0` → `2026.05.0-rc` ではなく `2026.06.0-final` 等の明確な版管理にする。

### H-6. Step3 `loadSampleData` で他人/全テナントの `org_id` を書き込める — **-5**

- **症状**: `apps/web/src/lib/auth/onboarding.ts` line 195-199:
  ```ts
  await supabase.from('sample_data_seeds').insert({
    org_id: '00000000-0000-0000-0000-000000000001',
    seed_kind: 'onboarding_demo',
    payload: { triggered_by: ctx.userId, at: now },
  });
  ```
  **`org_id` をハードコード**。マルチテナント設計 (`sales_platform_design_spec_v2.xlsx` 03_data_model「全テーブルに org_id NOT NULL + RLS統一」) に対し、ユーザーの実 org_id を取らずに `00000000…01` を書き込む。
- **コンプラ観点での問題**: 別 org のユーザーが onboarding を踏むと、`org_id=…01` (= デフォルト org) の名前空間にレコードが入る → **テナント混在**。個情法 23 条「安全管理措置」上のテナント分離が破れる。
- **是正案**: `ctx.userId` から `users.org_id` を引いてそれを使う。RLS policy 側も `with check (org_id = (select org_id from users where id = auth.uid()))` を強制。

---

## Medium (-2 each) — 改善望ましい

### M-1. `users.terms_consented_at` / `privacy_acknowledged_at` の二重情報源問題 — **-2**

- **症状**: 同意の事実が `consent_logs` (証跡 / append-only) と `users.terms_consented_at` (中間 timestamp) の 2 箇所に書かれており、不整合リスク。`acceptTerms` で両方を同 timestamp で書くが、片方失敗ハンドリングが無い (line 106-131)。
- **是正**: トランザクション化、もしくは `users.*_at` を view にして `consent_logs` から最新行を引く。

### M-2. `agree_marketing_communications` 同意 (Opt-in) が現状の onboarding に無い — **-2**

- 設計書 `16_compliance_legal` には `consent_type IN (…, 'marketing_communications', 'recording_consent')` が定義されているが、onboarding UI で取得・拒否を区別する画面が無い。デフォルト ON で取ったあと「同意済み」とみなされる可能性。
- 是正: 個情法 27 条 (第三者提供の opt-out 要件と類似) / GDPR Recital 32 (preselected boxes 禁止)。Marketing 用途は別 opt-in に分離して onboarding 完了後 settings から個別 ON が筋。

### M-3. IP アドレス・User-Agent の保管理由・期間が明示されない — **-2**

- `consent_logs.ip_address` / `user_agent` を保管しているが、保管目的 (証跡再現) / 保管期間 (= 同意撤回後 N 年) がプライバシーポリシーにも UI にも未記載。
- 是正: ポリシー第3項「保管期間」に「同意ログに付随する IP・UA は同意の撤回または最終再同意から 7 年保管」と明記 (audit_logs 7年保持と整合させる)。

### M-4. `x-forwarded-for` 信頼の前提が明示されていない — **-2**

- `requireAuthContext` (line 80-81) で `x-forwarded-for` を split[0] でそのまま信用しているが、Cloudflare/Render 経由か直接アクセスかの前提が無い。スプーフィングされた IP が証跡として残る可能性。
- 是正: 信頼境界の文書化 (`docs/spec/08_security_rls`) + Cloudflare の `cf-connecting-ip` を優先取得。

### M-5. `onboarded_at` 判定が "consent + privacy のみ" で `calendar_connected_at` を見ない — **-2**

- `completeOnboarding` (line 218-238) は terms + privacy のみチェック。しかし `isFullyOnboarded` は calendar も要求 (state.ts line 57-63)。**ロジック乖離**で「カレンダー未連携でも onboarded_at が立つ」 → 後で監査ログから「いつ onboarding が完了したか」を見ると食い違う。
- 是正: `completeOnboarding` でも `calendar_connected_at` を必須化、または `isFullyOnboarded` を緩める (どちらが正かは 19_onboarding_initial の正本に従う)。

### M-6. `skipCalendar` で過去の連携情報を消す副作用 — **-2**

- line 172-182: `calendar_connected_at: null` を UPDATE。既に過去に連携済みだったユーザーがスキップを押すと履歴が消える。**同意撤回ではないのに既存連携状態を破壊**。
- 是正: 既に non-null なら UPDATE しない (`is null` ガード) もしくは「再連携扱いにしない」フラグだけ立てる。

### M-7. consent_logs に `org_id` があるが、`org_id = (select org_id from users where id = auth.uid())` の with check が無い — **-2**

- マイグレ line 17 で `org_id` default を `00000000…01` にしている。INSERT 時に `acceptTerms` 側から `org_id` を渡していない → 全テナントのレコードが default org に混ざる (H-6 と同根)。
- 是正: `acceptTerms` の insert に `org_id` を含める + RLS with check で `org_id` 強制。

### M-8. プライバシーポリシー第3項の「最終利用から 3 年または退職後 60 日」が `SOFT_DELETE_GRACE_DAYS=30` と不一致 — **-2**

- `.env.example` の `SOFT_DELETE_GRACE_DAYS=30` と本文の「退職後 60 日」の関係がドキュメント上不明。退職 SOP (`26_user_offboarding_sop` M-1〜M+60) は 60 日基調なので本文側が正しい想定だが、env と本文どちらが運用上の真実か明文化されていない。
- 是正: SOFT_DELETE_GRACE_DAYS の定義 (= 個人ファイルゴミ箱の grace) と 「退職 60 日保管」 (= account-level data retention) を明確に分けてポリシー本文を補強。

### M-9. `<pre>` で規約本文を表示 (改行は出るが文書としての構造が無い) — **-2**

- `step-consent.tsx` line 131-133 で `<pre>` レンダリング。プレーンテキストでセクション番号も視認しづらい。視覚的に「同意を求めるのにふさわしい体裁」とは言いがたく、GDPR Art.7(2)「clear and plain language, intelligible form」観点で減点対象。
- 是正: MD レンダリングまたは構造化 HTML。

---

## Minor (-1 each)

### m-1. `void TERMS_HASH; void PRIVACY_HASH;` — **-1**

- `apps/web/src/app/onboarding/page.tsx` line 22-23、未使用 import を `void` で抑制。これ自体は無害だが、「ハッシュは取ってるけど画面では使ってない」状態。ハッシュをユーザーに見せて「合意の証拠が残ります (ハッシュ: a3f…)」のような透明性向上に使うと監査評価が上がる。
- 是正: footer に hash の先頭 8 桁を表示。

### m-2. `metadata` jsonb が未使用 — **-1**

- consent_logs.metadata jsonb があるが、`acceptTerms` で書き込んでいない。地理情報・ブラウザロケール・refer 元 URL 等を入れると証跡品質が上がる。

### m-3. `accepted_at` を `now()` ではなくサーバ側で生成した文字列を流し込んでいる — **-1**

- `acceptTerms` line 103 で `const now = new Date().toISOString();` を文字列として渡す。サーバ DB の `default now()` を信頼したほうがクロックスキューに強い。
- 是正: `accepted_at` を渡さず default を使う。

### m-4. 退会・アカウント削除リンクが Onboarding 同意画面のフッターに無い — **-1**

- GDPR Art.13(2)(b) の Right to Erasure 通知。Onboarding 段階で「やめる」選択肢は提供されているべき (= ログアウト/Account削除導線)。

### m-5. consent_logs に prev_hash chain が無い — **-1**

- 設計書 `08_security_rls` で audit_logs は prev_hash chain + R2 WORM。consent_logs にはハッシュチェーンが無く、テーブル単独では一括差し替え攻撃を検知できない (H-2 と相互補完)。

---

## 観点別スコア詳細

### 1. 同意記録の証跡性 (20 → 14)

- ✅ 必要列 `user_id, consent_type, version, content_hash, ip_address, user_agent, accepted_at` 揃う (+10)
- ✅ DELETE REVOKE 実装 (+3)
- ✅ check 制約で content_hash 空文字禁止 (+1)
- ❌ UPDATE policy で任意列書換可 (H-1, -5)
- ⚠️ prev_hash chain 無し (-1)

### 2. コンテンツハッシュ管理 (15 → 9)

- ✅ sha256 算出 (+5)
- ✅ check で 32 文字以上強制 (+1)
- ✅ 版数 (TERMS_VERSION / PRIVACY_VERSION) 管理 (+3)
- ❌ 規約本文の永続化なし (H-2, -5)
- ❌ TS コード直書き + 「仮版数」文字列残置 (H-5, -3 → cap 0 にしない)
- ⚠️ 版数定義が state.ts と onboarding.ts に分散 (M-1 系, -2 → 別観点で減点済)

### 3. 撤回権 (10 → 2)

- ✅ DB 列 `withdrawn_at` 存在 (+2)
- ❌ 撤回 UI / API / Server Action 一切無し (C-1, -8)

### 4. RLS (10 → 6)

- ✅ self_select + admin/legal 拡張 (+3)
- ✅ self_insert with check (+2)
- ✅ DELETE REVOKE (+2)
- ❌ UPDATE policy で全列書換可 (H-1, -4)
- ⚠️ org_id with check 無し (M-7, -1)

### 5. スコープ最小化 (10 → 9)

- ✅ Google scopes が `openid email profile calendar.events` のみ (line 153, +6)
- ✅ UI でも「Gmail や Drive へのアクセスは行いません」明示 (+3)
- ⚠️ incremental authorization で将来追加する scope の手順が docs に未記載 (-1)

### 6. 目的明示 (10 → 7)

- ✅ Step2 で取得情報・利用目的を明示 (+4)
- ✅ Step3 サンプルで内容を具体列挙 (+1)
- ❌ Step1 で本文を `<details>` に格納 (H-4, -3)
- ⚠️ 越境移転先の所在地未記載 (H-3 と関連, -1)

### 7. 法令準拠 (10 → 5)

- ✅ 利用目的 (第18-21 条) 概念は実装意図に含む (+2)
- ✅ 同意取得 + 証跡 (+2)
- ❌ 第28条 越境移転の所定通知未充足 (H-3, -2)
- ❌ Art.7(3) 撤回の容易性未充足 (C-1, -1)
- ⚠️ Art.13 透明性情報の網羅性不足 (-2)

### 8. 保管・削除 (10 → 9)

- ✅ プライバシーポリシー本文に「3 年/退職後 60 日」 (+5)
- ✅ users on delete cascade 設定 (consent_logs → users) (+1)
- ✅ 26_user_offboarding_sop と整合 (+3)
- ⚠️ SOFT_DELETE_GRACE_DAYS=30 との関係未文書化 (M-8, -1)

---

## 100 点に到達するための優先 8 アクション

| 優先度 | アクション | 効果 |
|--------|-----------|------|
| P0 | 撤回 UI + Server Action 実装 (`/settings/privacy/withdraw`) | C-1 解消 (+8) |
| P0 | UPDATE policy を `withdrawn_at` 専用化 (列 GRANT or trigger) | H-1 解消 (+5) |
| P0 | `legal_documents` テーブル + 本文永続化 + R2 WORM | H-2 解消 (+5) |
| P0 | PRIVACY_BODY に越境移転情報を追加 (国名/所在地/SCC) | H-3 解消 (+5) |
| P1 | 取得情報/委託先/保管期間サマリーをチェックボックス直上に常時表示 | H-4 解消 (+5) |
| P1 | TS リテラル本文を `legal_documents` 参照に置換 + CI guard | H-5 解消 (+5) |
| P1 | `sample_data_seeds.org_id` をユーザーの実 org に修正 + RLS with check | H-6 解消 (+5) |
| P2 | Medium 系 (二重情報源・marketing 同意分離・IP保管期間明示等) | +14 |

これらをすべて解消すると 63 + 8×1 + 5×6 + 2×9 = 63 + 8 + 30 + 18 = **119 → 100 cap** で **満点到達可能**。

---

## 法令引用サマリー (本レビューで参照した条文)

| 法令 | 条 | 引用箇所 |
|------|----|----------|
| 個人情報保護法 | 第18条 | 利用目的による制限 |
| 個人情報保護法 | 第21条 | 取得に際しての利用目的の通知等 |
| 個人情報保護法 | 第22条 | 個人データの正確性確保・利用停止等 |
| 個人情報保護法 | 第23条 | 安全管理措置 (改ざん防止含む) |
| 個人情報保護法 | 第27条 | 第三者提供の制限 |
| 個人情報保護法 | 第28条 | 外国にある第三者への提供の制限 |
| 個人情報保護法 | 第35条 | 利用停止・消去等の請求 |
| 個人情報保護法施行規則 | 第17条 | 外国の名称・制度等の情報提供 |
| GDPR | Art.5(1)(f) | Integrity and confidentiality |
| GDPR | Art.6 | Lawful basis (consent) |
| GDPR | Art.7(1) | Demonstrating consent |
| GDPR | Art.7(2) | Clear and plain language |
| GDPR | Art.7(3) | Right to withdraw consent as easily as given |
| GDPR | Art.13(1)(f) | Transfer to third country disclosure |
| GDPR | Art.13(2)(b) | Right to erasure notification |
| GDPR | Art.46 | Transfers subject to appropriate safeguards (SCCs) |
| GDPR | Recital 32 | No pre-ticked boxes / unambiguous consent |

---

## 判定

- **本ラウンドの判定**: **REQUEST CHANGES**
- **理由**: Critical 1 件 (撤回権未実装 / GDPR Art.7(3) 違反) + High 6 件。Big4 監査では一発リジェクト確実。
- **次ラウンド合格条件**:
  - C-1, H-1, H-2, H-3 をすべて解消 (= 法令違反 + 改ざん耐性 + 越境移転告知が満たされる)
  - H-4 (UI 透明性) と H-5 (仮版数 prod 流出 guard) のどちらか + H-6 (org_id ハードコード) を解消
  - Medium のうち M-2 (marketing 別 opt-in), M-7 (org_id with check) は P1 で必須

— Reviewer: Compliance/Privacy (個情法 + GDPR + 社内コンプラ)
