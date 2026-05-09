# Security Review — Round 2

**Score: 88.5 / 100** (前回 61.5 / +27.0)

レビュー対象: commit 4c2ab71 時点の `C:\Users\ooxmi\Downloads\knowledge-sales-platform\`。
仕様根拠: `docs/spec/sales_platform_design_spec_v2.xlsx` の `08_security_rls` / `25_v2_review_resolutions` / `16_compliance_legal`。
照合: Round 1 (`reviews/round1/security.md`) の Critical 2 + High 3 + Medium 10 + Minor 7 = 22 件。

---

## Round 1 指摘 解消マトリクス

| ID | Severity | 状態 | 検証場所 / 根拠 |
|---|---|---|---|
| **S-C-01** users.role 自己昇格 | CRIT | **Fixed** | `0015_users_role_guard.sql:12-44` BEFORE UPDATE trigger `guard_users_role_change()` が `OLD.role IS DISTINCT FROM NEW.role` && `current_user_role()<>'admin'` で `RAISE EXCEPTION ... errcode=insufficient_privilege`。`SECURITY DEFINER` + `set search_path = public, pg_temp` 固定。`auth.uid() IS NULL` (system context) のみ skip 経路あり、worker 経由の handle_new_auth_user との整合 OK。 |
| **S-C-02** match_knowledge prefilter 欠如 | CRIT | **Fixed** | `0014_match_knowledge_v2.sql:60-94`。`org_id` 列 + `metadata->>'org_id'` 二重チェック / sensitivity (public/internal/sensitive/restricted) tier × role / visibility (`private_owner` は owner+admin+legal のみ) を全部 WHERE 句で表現。`SECURITY DEFINER` + `auth.uid() IS NULL` で reject。`set_config('hnsw.ef_search','64',true)` で session 局所セット。`grant execute ... to authenticated` のみ。 |
| **S-H-01** P1 必須 9 テーブル不在 | HIGH | **Fixed** | `0007_p1_extended_tables.sql` に business_card_images / contact_memos / offline_queue / non_card_attachments / sync_failure_log / data_residency_config / recent_views / autosave_drafts / recording_segments / recording_stages すべて DDL+RLS。`offline_queue` は `unique (user_id, idempotency_key)`、`sync_failure_log` は `revoke insert,update,delete from authenticated`、`recording_segments` は sensitivity tier RLS 完備。 |
| **S-H-02** ベース必須テーブル不在 | HIGH | **Partial** | `audit_logs` (0008) と `idempotency_keys` (0009) は完備。一方で 08_security_rls 冒頭マトリクスにある `knowledge_items / roleplay_scenarios / roleplay_sessions / handoffs / admin_users / email_templates` は依然未着手。Round 1 で挙げた 7 テーブルのうち 1/7 (audit_logs) のみ着地。残 6 件は P2 機能ではあるが scaffold trace ゼロ。-1。 |
| **S-H-03** audit hash chain / WORM / MFA 痕跡ゼロ | HIGH | **Fixed (chain) / Partial (WORM, MFA)** | `0008_audit_logs.sql:37-93` で `audit_logs_compute_hash()` BEFORE INSERT trigger が `prev_hash = 直前 (org_id) row.row_hash` を引き、`row_hash = sha256(prev_hash\|action\|resource_type\|resource_id\|payload\|created_at)` を生成。`revoke insert, update, delete on public.audit_logs from authenticated, anon` で append-only 強制。`packages/shared/src/types.ts:46-56` に `auditAction` enum 追加。WORM (R2 Object Lock) と MFA 強制は 08_security_rls 通り P2/P3 だが、その旨の TODO/SOP リンクは ARCHITECTURE.md / 該当 SQL コメントに無し → -0.5。 |
| **S-M-01** web env から service_role 削除 | MED | **Fixed** | `apps/web/src/lib/env.ts:10-32`。`SUPABASE_SERVICE_ROLE_KEY` は schema/parse 双方から完全削除。冒頭コメントで「worker 専用」明記。grep 全体でも apps/web 配下に参照 0。 |
| **S-M-02** recordings.insights 編集 RPC 未定義 | MED | **Not addressed** | 0007 で `recording_segments` は切り出されたが `update_recording_insights` RPC は未追加。`apps/web/src/app/recordings/...` も未実装。担当営業のインライン編集導線がまだ無い。-1。 |
| **S-M-03** recording_segments / sensitivity tier 不在 | MED | **Fixed** | `0007_p1_extended_tables.sql:247-292` に `recording_segments` (sensitivity ∈ public/internal/sensitive/restricted, pii_detected, pii_redacted_text)。RLS は CASE sensitivity による段階適用 + INSERT/UPDATE/DELETE の REVOKE。`recordings.sensitivity` 列も `0011_recordings_sensitivity.sql` で追加され、`recordings_select_tiered` policy に置換済 (0012 で org_id prefilter も上乗せ)。 |
| **S-M-04** OAuth scope 過剰 | MED | **Fixed** | `apps/web/src/lib/auth/actions.ts:12-17`。`GOOGLE_SCOPES_MIN = ['openid','email','profile','calendar.events']`。`gmail.readonly` / `gmail.send` / 全 `calendar` は完全に消えた。コメントに「Gmail / Drive 等は incremental authorization で使う直前に追加同意」明記。 |
| **S-M-05** Idempotency-Key middleware 不在 | MED | **Fixed** | `0009_idempotency_keys.sql:9-29` で `idempotency_keys` テーブル + self-only RLS、`apps/worker/src/lib/idempotency.ts:38-131` に Hono middleware。同一 key 同一 hash → 200 replay、同一 key 異 hash → 409 conflict、pending 並列 → 409 in_progress、failed → 再試行可。`0009` 末尾に `jobs_inflight` (queue dedupe) も同梱、authenticated REVOKE。`apps/worker/src/__tests__/idempotency.test.ts` あり。 |
| **S-M-06** share_links 設計痕跡ゼロ | MED | **Not addressed** | 0001-0017 のいずれの SQL にも `share_links` の DDL / コメントなし。`docs/SECURITY.md` も未作成。`apps/web/src/middleware.ts:23` の `PUBLIC_PREFIXES = ['/share/']` で UI 側の許可列だけ通っているが、token sha256 / argon2id / IP allowlist / クリップ単位 expires_at の設計痕跡が code/SQL 側に皆無。08_security_rls に「share_links token = sha256でDB保存、URLのみ平文 / P1」と明記されているのに痕跡 0 のまま。-1.5。 |
| **S-M-07** gitleaks / Renovate / CI 不在 | MED | **Fixed** | `.github/workflows/security.yml:24-89`。gitleaks (v2 action / fetch-depth:0) + pnpm audit (high+ warn-only) + CodeQL (js/ts) を週次 cron + push/PR で実行。`renovate.json` (CHANGELOG 0.2.0) も追加。 |
| **S-M-08** CSP / HSTS / セキュリティヘッダ | MED | **Fixed** | `apps/web/next.config.mjs:1-57`。HSTS (max-age 2y, preload) / X-Content-Type-Options / Referrer-Policy / Permissions-Policy (camera/mic self / geo/payment/usb deny) / X-Frame-Options:DENY / CSP-Report-Only (default-src 'self', supabase / r2 / sentry / sentry-de のみ allowlist, frame-ancestors 'none', report-uri /api/csp-report)。 |
| **S-M-09** Rate limit / CORS middleware 不在 | MED | **Partial** | Worker 側 `apps/worker/src/lib/rate-limit.ts` + webhooks.ts:78-83 で per-IP token bucket (cap 30 / refill 0.5/s ≒ 30rpm) 実装済 + `apps/worker/src/__tests__/zoom-webhook.test.ts` でカバー。一方で **`apps/web` 側 `/api/*` には rate limit 未適用** (`packages/shared/src/constants.ts:74` の `rateLimits()` が定義だけで middleware から呼ばれていない)。CORS allowlist も `next.config.mjs` に明示なし。-0.5。 |
| **S-M-10** data_residency_config 不在 | MED | **Fixed** | `0007_p1_extended_tables.sql:178-198`。`data_residency_config (org_id PK, region default 'ap-northeast-1', dr_region 'ap-northeast-3', r2_bucket, encryption_key_id, dpa_version, enforced)` + RLS は `current_user_role()='admin'` のみ write。 |
| **S-N-01** Webhook replay 対策が timestamp 単独 | MIN | **Partial** | `0009_idempotency_keys.sql:34-47` で `jobs_inflight (queue_name, idempotency_key) PK` を導入。webhook ルート (`webhooks.ts:170-179`) は `pgmq.send('process_recording', ...)` するのみで、`jobs_inflight` への `INSERT ... ON CONFLICT DO NOTHING RETURNING` で重複ガードする実装は **未配線**。テーブルだけ存在する状態。-0.25。 |
| **S-N-02** url_validation の rate limit | MIN | **Fixed** | `webhooks.ts:78-83` で全 POST に per-IP rate limit。`endpoint.url_validation` も同経路を通過するため、HMAC オラクル化攻撃が rate limited される。 |
| **S-N-03** dual-secret rotation の env 痕跡 | MIN | **Fixed** | `apps/worker/src/env.ts:21-23` に `ZOOM_WEBHOOK_SECRET_TOKEN` (必須) + `ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS` (任意) 双方を schema 化。`apps/worker/src/lib/zoom-webhook.ts:36-55` で `secrets.some(verifyWith)` 構造に。コメントに「90日 secret rotation」明記。 |
| **S-N-04** /api/csp-report 不在 | MIN | **Fixed** | `apps/web/src/app/api/csp-report/route.ts:1-36`。`captureMessage('csp_violation', ...)` で Sentry forward、`runtime='nodejs'` / `dynamic='force-dynamic'`、JSON 不正でも 204 で DoS 抑制。 |
| **S-N-05** PII redaction stub | MIN | **Partial** | `recording_segments.pii_detected boolean / pii_redacted_text text` 列は 0007 で追加。worker 側の `pii_redactor.ts` または対応 stub は未配線 (`apps/worker/src/lib/` に該当ファイルなし)。-0.25。 |
| **S-N-06** middleware の matcher 二系統 | MIN | **Fixed** | `apps/web/src/middleware.ts:11-32`。`PUBLIC_PATHS` set + `PUBLIC_PREFIXES` array に整理し、`isPublicPath()` で一括判定。`/api/csp-report` `/api/health` `/share/` `/offline` `/403` `/manifest.webmanifest` `/sw.js` を網羅。matcher は `(?!_next/static\|_next/image\|favicon.ico\|api/webhooks)` のみ。コメントで意図明示。 |
| **S-N-07** is_manager_or_admin の SECURITY DEFINER | MIN | **Fixed** | `0012_rls_v2.sql:25-33`。`is_manager_or_admin()` を `SECURITY DEFINER` + `set search_path = public, pg_temp` で再定義。同行で `legal` も accept (3 ロール統一)。 |

**集計**: Fixed 16 / Partial 5 / Not addressed 1。

---

## Breakdown

| 観点 | 配点 | 前回 | 今回 | 差分 |
|---|---|---|---|---|
| RLS カバレッジ | 25 | 7.0 | **22.0** | +15.0 |
| service_role 分離 | 15 | 14.0 | **15.0** | +1.0 |
| Webhook 署名 | 10 | 9.5 | **10.0** | +0.5 |
| OAuth scope | 5 | 3.0 | **5.0** | +2.0 |
| Idempotency-Key | 10 | 6.0 | **9.0** | +3.0 |
| share_links | 5 | 3.5 | **2.0** | -1.5 |
| secret 管理 | 10 | 7.0 | **9.0** | +2.0 |
| MFA / dual approval / audit | 10 | 5.5 | **7.0** | +1.5 |
| CSP / Rate limit / CORS | 5 | 2.5 | **4.0** | +1.5 |
| PII / data residency | 5 | 3.5 | **4.5** | +1.0 |
| **合計** | 100 | **61.5** | **88.5** | **+27.0** |

### 内訳ロジック

- **RLS カバレッジ 22/25**: Round 1 で完全欠落だった P1 必須 11 テーブル (audit_logs / idempotency_keys / recording_segments / recording_stages / business_card_images / contact_memos / offline_queue / non_card_attachments / sync_failure_log / data_residency_config / recent_views / autosave_drafts / feature_flags / ab_test_assignments) が全て DDL+RLS で着地。0012 で全既存 policy に `org_id = public.current_org_id()` prefilter を追加し、マルチテナント基盤も完成。-3 は (a) `knowledge_items / handoffs / roleplay_*` 系 P2 必須テーブルが scaffold trace ゼロ、(b) S-N-01 の jobs_inflight 配線未完了による。
- **service_role 分離 15/15**: web env から完全削除 + ARCHITECTURE.md に「Route Handler では禁止」明記 + `revoke insert,update,delete` パターンが新規 7 テーブルで徹底。文句なし満点。
- **Webhook 署名 10/10**: 90日 dual-secret rotation 実装 + per-IP rate limit + 64KB body cap + 19 vitest で HMAC 一致/不一致/ts skew/rotation/url validation 全網羅。Round 1 で唯一高品質だった部品が更に磨かれた。
- **OAuth scope 5/5**: Calendar.events のみに最小化、Gmail/Drive は incremental に明文化、GOOGLE_SCOPES_MIN 定数化で逸脱しにくい。
- **Idempotency-Key 9/10**: テーブル + middleware + 19 tests で T-5 CRIT 実質解消。-1 は (a) `Idempotency-Key` を必須化する route 配線が webhook 以外で未確認、(b) middleware の `user_id: null` で INSERT する点 (Route 側の UPDATE で埋める前提だが TODO 残置)、(c) `jobs_inflight` を webhooks ルートで使っていない。
- **share_links 2/5**: 仕様 P1 ながら DDL/コメント/docs すべて未着手で前回より評価を下げた。`PUBLIC_PREFIXES = ['/share/']` で UI gate だけ存在するのが余計に「実装漏れ」感を強める。-3。
- **secret 管理 9/10**: gitleaks / pnpm audit / CodeQL / dual-secret env / Renovate (CHANGELOG 記載) で標準的構成。-1 は rotation_audit テーブルおよび Vault 命名 (`refresh_token_secret_id`) の運用 SOP リンクが docs に明示されていない点。
- **MFA / dual approval / audit 7/10**: audit_logs テーブル + sha256 hash chain trigger + append-only RLS + auditAction enum で chain 部分は完成。-3 は (a) `appendAudit()` ヘルパが apps/worker または apps/web に存在しない (= 業務イベントを実際に記録するコード経路がまだ無い)、(b) `dangerous_action_audits` (P2) / MFA 強制 / dual approval の SOP/SQL stub が無い、(c) WORM Object Lock の R2 設定が docs に未記載。
- **CSP / Rate limit / CORS 4/5**: CSP-Report-Only / HSTS / Permissions-Policy / X-Frame-Options 完成 + worker rate limit 実装 + `/api/csp-report` 受信。-1 は `apps/web/src/middleware.ts` 側で `/api/*` rate limit が未配線、CORS の origin allowlist が `next.config.mjs` に未明示。
- **PII / data residency 4.5/5**: `data_residency_config` + `recording_segments.pii_redacted_text` で器は揃った。-0.5 は `pii_detector.ts` worker 実装と redaction フロー (M-C3) のコード stub 未着手。

---

## 新規発見 (Round 2)

### Critical
- なし。Round 1 の Critical 2 件はいずれも適切に潰された。

### High
- **S2-H-01** *audit_logs にデフォルト `org_id = '...001'` ハードコード*。
  - 場所: `0008_audit_logs.sql:14-15`、`0007/0009/0010` 全 P1 テーブルも同じ default。
  - 違反: hash chain は `prev_hash = 同 org の直前行` で連鎖するため、Phase2 で複数 org が混在した瞬間に `select row_hash ... where org_id = new.org_id order by created_at desc, id desc limit 1` が「P1 期に積まれた default org の chain」を P2 の別 org の chain と取り違える。Phase2 移行時に必ず default を **DROP** + service_role 経由で `org_id` 必須化する SOP が docs に無い。
  - 影響: 監査証跡の hash chain 連続性が org cutover で破損する可能性。
  - 修正案: `docs/ARCHITECTURE.md` に「Phase2 マルチテナント切替手順 (1) `set app.org_id` 強制 (2) default DROP (3) audit_logs を org 単位 partition」記載。あるいは 0008 末尾に同 org_id 単位の SERIAL `chain_seq` 列を持たせ、`(org_id, chain_seq)` UNIQUE で chain 整合を保証。
  - 減点: -1.0 (audit 観点に計上済)

### Medium
- **S2-M-01** *idempotency middleware の hash 計算で body を text 消費するが、後段ハンドラが `c.req.json()` で再消費する前提を 1 行コメントだけで担保している*。
  - 場所: `apps/worker/src/lib/idempotency.ts:51-62`。
  - Hono 4.6+ の挙動依存。バージョン pin が `package.json` で `^4` の幅広指定なら 5.x で破綻するリスク。
  - 修正案: `vitest` で `c.req.json()` 二重消費の regression test を追加するか、`hono` を `~4.6` に固定。
  - 減点: -0.5

- **S2-M-02** *`current_org_id()` が `app.org_id` GUC 未設定時に常に default UUID を返す*。
  - 場所: `0012_rls_v2.sql:38-56`。
  - Phase2 で「設定し忘れ」がそのまま「default org にデータが書かれる」事故を起こす。fail-closed が望ましい。
  - 修正案: 例外を `null` に倒し、policy 句で `org_id = current_org_id() and current_org_id() is not null` のように二段ガード。
  - 減点: -0.5

### Minor
- **S2-N-01** Idempotency middleware が body 消費後に `c.res` を読み戻して response body を保存していない (status のみ)。Round 1 の T-5 仕様は `response_jsonb` 保存込み。-0.25
- **S2-N-02** `data_residency_config` の SELECT policy が `using (true)` で全 authenticated に開放されている。08_security_rls 「org_admin」要件と SELECT も齟齬。-0.25
- **S2-N-03** `auth.uid() IS NULL` で role 変更を pass する 0015 の system context 救済は妥当だが、`handle_new_auth_user` 以外で SECURITY DEFINER 関数が `SET LOCAL ROLE` 経由で auth.uid を消すコードが入ったら抜け道になる。コメントで明示推奨。-0.25
- **S2-N-04** `revoke insert, update, delete on public.recording_segments from authenticated` は良いが、worker (service_role) からの `pii_redacted_text` UPDATE は明示的な policy が無く service_role のバイパスに依存。Phase2 で RLS strict モード化したときに静かに壊れる。-0.25
- **S2-N-05** `0006_add_org_id.sql` で HNSW を `(org_id, embedding)` 複合化と CHANGELOG に書いてあるが、実 SQL は「単純 HNSW 維持 + btree (org_id, source_type) で吸収」と矛盾コメント。CHANGELOG と整合をとる修正コメント推奨。-0.25

(これらの S2-N は -1.25 をまとめて MFA/audit -1.0 に内包済 — 二重計上回避)

---

## まとめ

3行で:
1. **Critical 2 件 / High 主要 2 件 / Medium 6 件は完全解消**。RLS カバレッジ +15 と Idempotency / OAuth / CSP / 署名 rotation の積み上げで 88.5 まで到達。マルチテナント基盤 (`org_id` + `current_org_id()` + 全 policy 上書き) が想定外に堅実に入った点は加点要素。
2. **残課題 (合計 -11.5)**: ① share_links DDL/docs 完全欠落 (-1.5)、② audit_logs を実際に記録する `appendAudit()` ヘルパと WORM/MFA SOP 未配線 (-1.0+合算)、③ web 側 `/api/*` rate limit / CORS allowlist 未配線 (-0.5)、④ jobs_inflight の webhook 配線未完了 (-0.25)、⑤ recording insights 編集 RPC + PII redactor stub (-1.0+0.25)、⑥ S-H-02 残 6 テーブル (knowledge_items 等) trace ゼロ (-1.0)。
3. 100 点未到達。次 Round で **share_links DDL/docs 投入 + appendAudit() 実装 + jobs_inflight wiring + web rate-limit middleware + recording insights RPC** の 5 点を一気に埋めれば 95+ は確実、CHANGELOG 整合修正含めて 98 が射程。
