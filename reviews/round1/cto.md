# CTO Review — Round 1

**Score: 78.5 / 100**

> Reviewed against `docs/spec/sales_platform_design_spec_v2.xlsx` (v2.2 / 30 sheets) and the W1 scaffold at commit `26b2441` (HEAD: docs OAuth guide).
> Phase1 W1 タスク T-001/T-003/T-004/T-005/T-006 はテキスト的に「揃って」いるが、設計書 v2.1 (シート 25) で導入された **マルチテナント org_id / 副作用 API 冪等性 / audit append-only+hash chain / sensitivity tier** という Round1 で「Critical」判定されたハードニングが、コード側ではほぼ未反映。テスト雛形ゼロも痛い。

---

## Breakdown
- Phase1 W1完遂率: **17.5 / 20**
- トレーサビリティ: **12 / 15**
- AT準拠: **6 / 15**
- ドキュメント品質: **13.5 / 15**
- 命名一貫性: **9 / 10**
- 拡張容易性: **8.5 / 10**
- Risks反映: **7 / 10**
- Offboarding準備: **5 / 5**

合計: 17.5 + 12 + 6 + 13.5 + 9 + 8.5 + 7 + 5 = **78.5**

---

## Critical (-5)

### C1. `org_id` がどのテーブルにも無い (T-1, RD-30 系) — 設計書 v2.1 の最大の Critical 修正と乖離
- 該当: `packages/db/src/schema/users.ts:7-22` 以下、全 schema ファイル / `packages/db/src/migrations/manual/0001_init_schema.sql` 全体 / `0003_rls_p1.sql` 全 RLS policy
- 設計書 25_v2_review_resolutions 行 #7 (Tech CRIT T-1) に明記:「全テーブルに org_id uuid NOT NULL を追加し、RLSの基本句を `(org_id = current_setting('app.org_id')::uuid AND ...)` に統一、pgvector HNSW を `(org_id, embedding)` で前置」。
- README に「シングルテナント運用」と書かれているが、設計書 13_risks_decisions O-10 は「**当面**シングル」と保留扱い。v2.1 で **org_id 必須化** が CRIT として `採用` ステータスで確定済み → ここは "今は要らない" ではなく **P1 で型を入れておかないと P2/P3 で全テーブル ALTER が必要** になる。スコア最大の減点理由。
- 修正案:
  1. `packages/db/src/schema/_shared.ts` を新設し、`orgId: uuid('org_id').notNull()` を返すヘルパー定義
  2. 全テーブルに `org_id` 追加 + `(org_id, ...)` 複合 index
  3. `0001_init_schema.sql` も同期 / 既存環境は `0006_add_org_id.sql` を起こして `add column org_id uuid not null default '<single-tenant-default>'::uuid` で埋める
  4. `0003_rls_p1.sql` で `using (org_id = current_setting('app.org_id', true)::uuid AND ...)` に書き換え
  5. `0005_auth_sync_trigger.sql` の `handle_new_auth_user()` で `org_id` を `auth.users.raw_app_meta_data->>'org_id'` から拾うか、env の `DEFAULT_ORG_ID` で埋める

### C2. AT-RLS-1/2/3, AT-Idem-1/2 のテスト雛形が一切ない
- 該当: ルート全体に vitest/pgTAP/playwright config 無し (`Glob **/vitest.config*` / `**/playwright.config*` 0件)
- 設計書 24_acceptance_test_matrix (v2.1 Round1 追加分) AT-RLS-1〜3, AT-Idem-1/2, AT-LLM-Schema-1, AT-Audit-1 が **P1 範囲**。`apps/worker/package.json:34` に vitest dep だけはあるが、設定/雛形/フォルダゼロ。
- W1 完遂を名乗るには「テスト基盤の枠だけは置く」が CTO 観点では必須。例えば AT-S1-5/AT-S5-1/AT-S13-1/AT-Idem-1 の placeholder describe を 1 ファイルでも置いておきたい。
- 修正案:
  1. `apps/worker/vitest.config.ts` を作成、`apps/worker/src/__tests__/zoom-webhook.test.ts` で `verifyZoomSignature` の HMAC + ts skew を最低限カバー (AT-Idem-2 の素地)
  2. `packages/db/src/__tests__/rls.pg.test.ts` placeholder (pgTAP or `pg-tap-node`) を切る (AT-RLS-1〜3)
  3. `playwright.config.ts` をルートに、`tests/e2e/auth.spec.ts` placeholder (AT-S12-1: 7 step オンボーディング)

---

## High (-3)

### H1. 副作用 API 冪等性 (T-5 CRIT) のフックが未着手
- 該当: `apps/web/src/app/auth/callback/route.ts` / `apps/worker/src/routes/webhooks.ts:16-46` / `packages/db/src/migrations/manual/*` (idempotency_keys テーブル無し)
- 25_v2_review_resolutions #11 で `idempotency_keys(key,user_id,request_hash,response_jsonb,status,expires_at) + middleware` を CRIT として採用。Zoom webhook も `T-3` で「ON CONFLICT DO NOTHING RETURNING」での吸収必須。
- 現状 `webhooks.post('/webhooks/zoom')` は署名検証のみ、`recording.completed` の二重受信吸収無し → P1 ローンチ時 Zoom リトライ嵐で `recordings` 重複作成リスク。
- 修正案:
  1. `0006_idempotency_keys.sql` で `idempotency_keys` + `jobs_inflight` を起こす
  2. `apps/worker/src/lib/idempotency.ts` に Hono middleware を用意 (TTL 24h)
  3. webhook ハンドラ内で `zoom_event_id` を key に upsert ON CONFLICT DO NOTHING、insert 0 行なら "already_processed" ログ

### H2. audit_logs append-only + hash chain (C-5 CRIT) が未実装
- 該当: `packages/db/src/migrations/manual/0003_rls_p1.sql` (audit_logs テーブル自体ゼロ)
- 設計書 08_security_rls 行 41「audit_logs append-only(全role REVOKE UPDATE/DELETE、service_role INSERT のみ)、prev_hash sha256 hash chain」。
- P1 では当面ログ流入が少なくても、テーブルとトリガーは初期で作っておかないと、後から chain 化するのは事実上不可。
- 修正案:
  1. 0001_init_schema に `audit_logs (id, actor_user_id, action, target_type, target_id, payload, prev_hash, hash, created_at)` 追加
  2. INSERT 前トリガーで `hash = sha256(prev_hash || action || target_id || payload || created_at)` 計算
  3. RLS で `revoke update, delete from public.audit_logs from authenticated, anon;` 明示
  4. `packages/db/src/schema/audit.ts` も合わせて足す

### H3. recordings の sensitivity tier prefilter が空 (M-C3 CRIT)
- 該当: `packages/db/src/migrations/manual/0003_rls_p1.sql:166-168` `recordings_select_all USING (true)`
- 25_v2_review_resolutions #19/53 で「sensitive=owner+admin+legal のみ」「個人名はデフォルト mask」が CRIT で採用。現コードは「全 authenticated に SELECT」だけ。
- これは Phase1 で運用が始まったあとに RLS を厳しくすると **既存のクエリが壊れる**。スキーマに `sensitivity tier` 列がそもそも無いのも問題 (recordings.transcript_full に直アクセスのまま)。
- 修正案:
  1. `recordings` に `sensitivity text not null default 'internal' check (in 'public','internal','sensitive','restricted')` 追加
  2. RLS に sensitivity 分岐を入れる: `using (sensitivity in ('public','internal') or owner = auth.uid() or current_user_role() in ('admin','legal'))`
  3. `users.role` enum に `'legal'` を追加 (L-1)

### H4. apps/worker は `paths` alias を使っているが、tsc コンパイル後に `@/...` が解決できない
- 該当: `apps/worker/tsconfig.json:9-15`、`apps/worker/src/index.ts:4-7`、`apps/worker/src/routes/webhooks.ts:3-5` ほか
- `package.json:8` `"start": "node dist/index.js"`。 `tsc` は `paths` を **エミットしない** ので、`dist/index.js` 内に `from '@/env'` のまま残り、Render 起動時に `MODULE_NOT_FOUND` で死ぬ。
- `tsx watch` (dev) は `tsx` が自動で alias を解決するため気付きにくい。
- 修正案: 以下のどれかに統一
  - (a) `tsconfig-paths` を runtime に: `"start": "node -r tsconfig-paths/register dist/index.js"`
  - (b) `tsc-alias` をビルド後に: `"build": "tsc && tsc-alias"`
  - (c) **alias を諦め相対 import に書き直す** (W1 段階の最少差分なら C を推奨)

---

## Medium (-1)

### M1. AT-Idem-2 (Webhook 重複) のための pgmq.send が `webhooks.ts` で TODO のまま
- 該当: `apps/worker/src/routes/webhooks.ts:43-44`
- W3 タスク T-011 と同じ書きぶりだが、URL Validation/署名検証だけは P1 W1 範囲として実装した以上、`/webhooks/zoom` の **received → pgmq.send は1コミットで終わる**。中途半端。
- 修正案: `supabaseAdmin.rpc('pgmq_send', { queue: 'process_recording', payload })` の薄いラッパを `apps/worker/src/lib/pgmq.ts` に作って TODO を埋める。

### M2. `users.id` のチェック制約に対する FK 設計が中途半端
- 該当: `packages/db/src/schema/users.ts:8` `id: uuid('id').primaryKey()` (default なし)
- `0005_auth_sync_trigger.sql` で `auth.users.id` を渡す前提だが、Drizzle 側の型を見ると `NewUser.id` は **必須の uuid**。手動 INSERT (テスト等) で誤って `gen_random_uuid()` を別途付けると auth と乖離する。コメントで `-- mirrors auth.users.id` を強制したい。

### M3. RLS の `current_user_role()` 内 self-recursion 防止が薄い
- 該当: `0003_rls_p1.sql:22-30` `current_user_role()` は `select role from public.users where id=auth.uid()` を **authenticated 経由で** 実行。`security definer` で逃しているが `set search_path = public` だけで `users` テーブル自体の RLS は再帰しない (definer ロールに対して RLS 評価される) → 設計書通りだが、単体テスト (AT-RLS-1) を入れて回帰検出する一文をシートに引きたい。

### M4. `embedding` field の Drizzle customType の値範囲チェックが無い
- 該当: `packages/db/src/schema/knowledge.ts:18-25`
- `toDriver` で `[${value.join(',')}]` するが、`value.length === 1536` の assertion なし。dimension drift で `pgvector` 側エラーになるが、開発体験のため `if (value.length !== EMBEDDING_DIM) throw` を入れたい。`@ksp/shared` の `EMBEDDING_DIM` を import する形が綺麗。

### M5. README に「環境変数 `.env.local` 編集」と書かれているが、`.env.example` の `NEXTAUTH_SECRET`/`NEXTAUTH_URL` は使っていない
- 該当: `.env.example:60-62`
- 実装は Supabase SSR (`@supabase/ssr`) で完結しており NextAuth は使っていない。残置すると初日エンジニアが混乱する。
- 修正案: `.env.example` から削除 + `render.yaml` の `NEXTAUTH_SECRET` も削除 (`render.yaml:32-33`)。

### M6. `render.yaml` の Worker サービス が `type: web` (M-13 系)
- 該当: `render.yaml:43`
- 設計書 ARCHITECTURE では「Render Background Worker」と表現。Render 上で「Background Worker」型なら `type: worker` (`/healthz` ヘルスチェック不要) で常駐させるべき。今は `type: web` のため pgmq の long-poll consumer を入れた瞬間 Render の Web idle スリープに食われる可能性。
- 修正案: 当面 `type: web` (Webhook 受信 + healthz) で良いが、**P1 W3 で T-012 (process_recording consumer) を入れる時点で worker 化は必須** とコメントで明記。

### M7. CHANGELOG に T-002 が "Pending" と書いてあるが直前のコミット `43d85fe db: bootstrap migrations applied to arylptrsgxiwcnprzszo` で実は完了している
- 該当: `CHANGELOG.md:30` 「T-002 Supabase 新規プロジェクト作成 (手動)」
- README L86 にも `⏳` のまま。git log/migration 名から既に Supabase ref `arylptrsgxiwcnprzszo` 確定済み。
- 修正案: README/CHANGELOG の T-002 を `✅ (project ref: arylptrsgxiwcnprzszo)` に更新。

---

## Minor (-0.5)

### m1. `apps/web/src/app/page.tsx:36` がパンくずリンクを表示しているが設計書側にこのリンクは存在しない
- README/HomePage の `📘 設計書: ../営業、CS統合管理システム…/sales_platform_design_spec_v2.xlsx` は **本番ビルドでも残る**。社外シェア時に内部パスが漏れる。
- 修正案: 開発ビルド限定 (`process.env.NODE_ENV === 'development'`) で表示するか、`docs/spec/...` の repo パスに変える (実装側はそちらに既にコピー済み: `docs/spec/sales_platform_design_spec_v2.xlsx`)。

### m2. `packages/db/package.json:11-13` に `db:generate`/`db:migrate`/`db:push`/`db:studio` の **npm script が無い** (root package.json にだけある)
- 該当: ルート `package.json:16-19` は `pnpm --filter @ksp/db drizzle-kit ...` を呼ぶ。`packages/db/package.json` にも `"generate": "drizzle-kit generate"` を素で置いた方が `pnpm --filter @ksp/db generate` が直で叩ける。

### m3. `apps/web/src/lib/supabase/server.ts:11-16` の cookieStore.set 内で options を黙って受け取り、`expires` 等の型衝突時に try-catch で握り潰す
- catch 内コメント「middleware が後でセッション更新する」は正しいが、`logger.debug` で記録した方が運用観測上うれしい (Pino を web 側にも入れる課題)。

### m4. SETUP_GOOGLE_OAUTH.md が **特定 Supabase ref `arylptrsgxiwcnprzszo` をハードコード** している
- 該当: `docs/SETUP_GOOGLE_OAUTH.md:31, 83, 112, 117, 149, 224, 227`
- 別のテナント/開発環境を立てる時に都度書き換え。`<your-project-ref>` プレースホルダ + 1ヵ所「ナレッジ HD 本番は `arylptrsgxiwcnprzszo`」と明記する形が望ましい。

### m5. `pnpm-workspace.yaml` に `tools/` のような将来用パスを切っていない
- 拡張容易性 (Phase 2 の Email worker / Whisper worker) を考えると `apps/*` に全部集約する前提のままだが、現状でも問題なし。Minor。

### m6. `0003_rls_p1.sql:177` `knowledge_embeddings` に `enable row level security` した上で **policy を1本も書いていない** (=全 DENY) コメントだけ
- 仕様書 (M-16/T-2) と一致しているので正しいが、`grant select` を意図的に剥がすなら `revoke select on public.knowledge_embeddings from authenticated;` を明示しないと、Postgres デフォルトの authenticated GRANT (Supabase 側の anon/authenticated に既定で table SELECT 与えてる) との挙動を勘違いされる。明示 `revoke` を1行足したい。

### m7. `apps/web/middleware.ts:22` の matcher が `api/webhooks` を除外しているが、リポジトリには `apps/web` 側 webhook が無い (Zoom webhook は worker)
- 設計書 04_api_endpoints AP-50/51 で Gmail Pub/Sub が `apps/web/src/app/api/webhooks/gmail` 想定 (P2)。先回りで matcher を緩めているのは良いが、コメントで「P2 で Gmail Pub/Sub Push を web 側で受ける用に matcher 除外」と書いておきたい。

---

## Phase 2/3 拡張容易性 観点 (採点 8.5/10)

- **○** `knowledgeEmbeddings.sourceType` enum に `meeting_notes`/`email`/`handoff` まで先行で入っている (`packages/db/src/schema/knowledge.ts:27-34`)。P2 で `meeting_notes`/`handoffs` テーブルを足したらすぐ繋がる。 +
- **○** `pgmq.create` で **3 キューだけ** 先に作っており (`0000_setup.sql:25-27`)、P2 で `q_parse_email_reply`/`q_generate_handoff_draft` 等を追加すれば足りる。 +
- **△** `meetings.contractId` (`schema/meetings.ts:64`) を **FK 無しの uuid 単発** で置いている。P2 T-031 で `contracts` テーブル来たときに drizzle の `references()` を後付けで足す migration が必要。コメントで「contracts FK は P2 T-031 で繋ぐ」を残したい。
- **△** `usage_limits` / `feature_flags` / `audit_logs` / `idempotency_keys` のような **横断テーブル** を P1 W1 で先に空テーブルだけ置く方針が無い。後から RLS 含めて入れるとデプロイのタイミングがシビア。

## Risks 反映 観点 (7/10)

- **○** R-04 OAuth refresh 期限切れ → `user_oauth_tokens.expiresAt` あり、Vault 参照 ID 設計あり (`schema/users.ts:31-50`)。
- **○** R-08 退職者トークン残置 → 0005_auth_sync_trigger 由来で `is_active=false` 連動の素地あり。
- **○** R-01 Zoom 3秒制約 → URL Validation 即応答 + 署名検証実装済み (`webhooks.ts:29-41`)。
- **△** R-05 録画動画の大サイズ → R2 マルチパート設計コメント無し。`apps/worker/src/lib/r2.ts` の placeholder 無し。
- **×** RD-32 録画同意 (per-attendee) → `meeting_attendees` には `consent_*` 列なし。P1 で受信だけでも仕込みたい。
- **×** RD-35 admin 削除の MFA + reason → 痕跡なし (audit_logs 自体無し)。

## Offboarding (5/5)

- **○** `users.isActive` ✅
- **○** `user_oauth_tokens.userId on delete cascade` ✅
- **○** `contacts.ownerUserId` 参照のみ → 一括移管 `update contacts set owner_user_id = ...` が走らせやすい構造 ✅
- README/SOP のクロスリンクは無いが、26_user_offboarding_sop の M-1〜M+60 に対応する DB 構造素地はある。

---

## 推奨着手順 (W1 → W2 移行前にやる)

1. (Critical) `0006_add_org_id.sql` + 全 schema に `orgId` 追加 + RLS を `(org_id = current_setting('app.org_id')::uuid AND ...)` に統一
2. (Critical) `apps/worker/__tests__/zoom-webhook.test.ts` 1本 + `vitest.config.ts` + ルート `playwright.config.ts` placeholder
3. (High) `0006_idempotency_keys.sql` + `0007_audit_logs.sql` (append-only + hash chain)
4. (High) Worker `tsc` のパスエイリアス問題: 相対 import に置換 (10ファイル程度)
5. (High) `recordings.sensitivity` 列追加 + RLS 厳格化
6. (Medium) README/CHANGELOG の T-002 を実態 (`arylptrsgxiwcnprzszo`) に合わせる、`render.yaml` の `type` を T-012 着手時に worker へ
7. (Medium) `.env.example` から NEXTAUTH 系を除去、HomePage の設計書パス露出を dev 限定化

これらを片付けると、再採点で **88-92 / 100** に到達できる見込み。
