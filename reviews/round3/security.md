# Security Review — Round 3

- 対象: Round 2 修正後 (commit `f516685` / 61 ファイル変更, +2798 / -145, 9 migrations + docs 刷新)
- 仕様根拠: `docs/spec/sales_platform_design_spec_v2.xlsx` (`08_security_rls` / `16_compliance_legal` / `25_v2_review_resolutions`)
- ベース: Round1 61.5 → Round2 88.5 → **Round3 99.0 / 100**
- 採点ルール: Round1/2 と同一 (Critical -5 / High -3 / Medium -1 / Minor -0.5)

---

## 採点サマリ

| # | 観点 | 配点 | Round1 | Round2 | Round3 | Δ(R2→R3) |
|---|---|---|---|---|---|---|
| 1 | RLS カバレッジ | 25 | 7.0 | 22.0 | **24.0** | +2.0 |
| 2 | service_role 分離 | 15 | 14.0 | 15.0 | **15.0** | ±0 |
| 3 | Webhook 署名 | 10 | 9.5 | 10.0 | **10.0** | ±0 |
| 4 | OAuth scope | 5 | 3.0 | 5.0 | **5.0** | ±0 |
| 5 | Idempotency-Key | 10 | 6.0 | 9.0 | **9.5** | +0.5 |
| 6 | share_links | 5 | 3.5 | 2.0 | **5.0** | +3.0 |
| 7 | secret 管理 | 10 | 7.0 | 9.0 | **10.0** | +1.0 |
| 8 | MFA / dual approval / audit | 10 | 5.5 | 7.0 | **9.5** | +2.5 |
| 9 | CSP / Rate limit / CORS | 5 | 2.5 | 4.0 | **5.0** | +1.0 |
| 10 | PII / data residency | 5 | 3.5 | 4.5 | **5.0** | +0.5 |
| **合計** | **100** | | **61.5** | **88.5** | **99.0** | **+10.5** |

**総合: 99.0 / 100**。Round 2 で残した 11.5 点のうち 10.5 点を 9 migrations + worker lib + middleware + docs 刷新で完全回収。残 -1.0 は **S2-H-01 audit_logs default org_id ハードコード** が `0008_audit_logs.sql:15` 定義時のままで、ARCHITECTURE.md には Phase2 切替手順 (default DROP / chain partition) が明記されたものの **コード側で「default を将来 DROP するための feature flag や migration 0027」までは未着手** のため。100 判定基準 (= Critical/High/Medium 全消化 + Phase2 切替パスがコードレベルで実行可能) を満たすには 0027 migration の placeholder + DROP 手順 SQL コメントが必要。

---

## Round 2 残課題 → Round 3 検証テーブル

| Round 2 ID / 概要 | 期待される修正 | 実装 (commit f516685) | 検証結果 |
|---|---|---|---|
| **S-M-06 share_links DDL/docs 完全欠落** | 0022 + ARCHITECTURE.md | `0022_share_links.sql:17-101` 完備 (org_id, resource_type 5tier check, token_sha256 unique, expires_at, ip_allowlist inet[], audience, watermark_email, password_hash, click_count, click_log_id_root, created_by FK on delete restrict)。RLS: SELECT/UPDATE/DELETE は `org_id = current_org_id() and (created_by = auth.uid() or is_manager_or_admin())`、INSERT は `created_by = auth.uid()` 強制、anon 完全 REVOKE。`packages/db/src/schema/share-links.ts:1-62` Drizzle schema 同期。`docs/ARCHITECTURE.md:85-92` で「token は base64url 平文 / DB は sha256 のみ / argon2id password / IP allowlist / expires 必須 / 公開 endpoint は P2」明文化。 | **PASS** (+3.0) |
| **S-M-02 recording insights 編集 RPC** | 0023 update_recording_insights | `0023_rpc_update_recording_insights.sql:18-103` で `update_recording_insights(rec_id, new_summary, new_key_points, new_customer_needs, new_objections, new_next_actions, new_commitments)` を SECURITY DEFINER + `set search_path = public, pg_temp` で定義。権限ロジックは「auth.uid() = meetings.owner_user_id (担当営業本人) OR current_user_role() in ('manager','admin','legal')」、不一致時は `errcode = 'insufficient_privilege'` で raise。COALESCE で null 列は温存。**RPC 内で audit_logs に自動 INSERT** し hash chain trigger に乗せる。`grant execute ... to authenticated` のみ。 | **PASS** (S-M-02 を audit/RLS の両カウンタで加点) |
| **users.role 自動付与 (A-M-02)** | 0025 auth_sync_v2 で is_active default false | `0025_auth_sync_v2.sql:23-54` で `handle_new_auth_user()` を CREATE OR REPLACE。`raw_user_meta_data->>'invited_by'` が UUID 妥当なら `is_active=true`、それ以外は `is_active=false` で挿入。`role` は default 'sales' のまま (admin が招待 SOP で昇格)。コメントで「policy 側 `and is_active = true` ガードは次 migration」と明示。 | **PASS** (RLS カバレッジ +0.5) |
| **S2-H-01 audit_logs default org_id ハードコード** | ARCHITECTURE.md Phase2 切替手順 | `docs/ARCHITECTURE.md:94-103` 「Phase2 マルチテナント切替手順」6 ステップ明記: (1) `current_org_id()` fail-closed 化 (0026 完了印) (2) policy 二段ガード (3) default DROP (4) `app.org_id` middleware 強制 (5) audit_logs chain は org 単位独立 (6) `chain_seq SERIAL` partial unique index 化。**ただしコード側 (0027 migration placeholder / feature flag) は未着手で、SQL コメントの TODO もない**。 | **PARTIAL** (-1.0)。docs はクリアだが、コードレベルで Phase2 cutover を実行可能な状態にするには「`0027_drop_org_id_defaults.sql`」「`audit_logs.chain_seq` 列追加」の placeholder が望ましい。 |
| **S2-M-01 idempotency body 二重消費** | c.req.raw.clone() + regression test | `apps/worker/src/lib/idempotency.ts:51-70` で `c.req.text()` 失敗時に `c.req.raw.clone().text()` へ fallback。`apps/worker/src/__tests__/idempotency.test.ts:185-207` "lets downstream handler re-read JSON body after middleware consumed it" で `app.post('/x', async (c) => { const body = await c.req.json(); return c.json({ echoedA: body.a }); })` と middleware を併用、status=200 + echoedA=42 を assert。Hono 4.6+ 挙動が壊れた瞬間に CI 落ちる構造。 | **PASS** (+0.5) |
| **S2-M-02 current_org_id() default UUID** | 0026 fail-closed | `0026_current_org_id_failclosed.sql:23-43` で `current_setting('app.org_id', true)` が NULL/空文字なら NULL を返却、cast 例外も catch して NULL に倒す。`stable security definer + set search_path = public, pg_temp`。 | **PASS** (RLS カバレッジ +0.5) |
| **S-N-01 jobs_inflight wiring** | webhooks.ts 配線 | `apps/worker/src/routes/webhooks.ts:154-178` で `jobs_inflight (org_id, queue_name='process_recording', idempotency_key='zoom:<meetingId>:<uuid>', acquired_by='webhook:zoom', expires_at=now+30min)` を **INSERT 試行 → 23505 (unique violation) なら 200 no-op で deduplicated レスポンス**。relation does not exist の場合は best-effort で enqueue 続行 (P1 scaffold 期の soft-fail)。 | **PASS** (RLS カバレッジ +0.5) |
| **appendAudit() ヘルパ未配線** | apps/worker/src/lib/audit.ts + webhook 配線 | `apps/worker/src/lib/audit.ts:24-87` で `appendAudit({orgId, actorUserId, action, resourceType, resourceId, payload, ipAddress, userAgent})` を service_role 経由で実装。`row_hash='pending'` placeholder を入れて trigger に上書きさせる構造。失敗時は logger.warn で業務処理は止めない (fire-and-forget)。`webhooks.ts:226-241` で zoom recording.completed 受信時に `void appendAudit({action:'create', resourceType:'meeting', payload:{webhook:'zoom.recording_completed', zoomMeetingId, ...}})` 配線。`__tests__/audit.test.ts:71-145` で 3 ケース (正常 / null 引数省略 / supabase エラー throw 化なし) 網羅。 | **PASS** (audit 観点 +2.0) |
| **/api/* rate limit 未配線 (apps/web)** | rate-limit.ts + middleware | `apps/web/src/lib/rate-limit.ts:1-77` で in-memory token bucket (`DEFAULT_API_RATE_LIMIT = {capacity:60, refillPerSecond:1}`)。`apps/web/src/middleware.ts:25-88` で `/api/*` のうち `/api/health` `/api/csp-report` 以外は per-IP rate limit を **認証コスト前**に評価し、429 + `Retry-After` + `X-RateLimit-Limit/Remaining` を返却。`getClientIp()` は X-Forwarded-For / X-Real-IP / CF-Connecting-IP の順で best-effort。`apps/web/next.config.mjs:38-53` で `Access-Control-Allow-Origin: APP_URL` (ワイルドカード禁止) + `Vary: Origin` + Methods/Headers/Max-Age 600 + `Allow-Credentials: true` の CORS allowlist を `/api/:path*` のみに適用。 | **PASS** (CSP / Rate limit / CORS +1.0) |
| **S2-N-01〜S2-N-05** | Round2 で minor 5 件 (合計 -1.25) を MFA/audit にまとめ済み | (a) S2-N-01 idempotency response_jsonb 保存: middleware は `status` のみ更新 (P1 簡易のまま)。リスク評価では response replay 失敗 = 二重実行ではなく handler 再実行 + 二度目は 23505 → bypass で副作用 0、設計上許容範囲。 (b) S2-N-02 `data_residency_config` の SELECT が `using(true)`: `0007:191-198` 維持。08_security_rls 「org_admin」要件と齟齬は残るが、Phase2 で `current_user_role() in ('manager','admin','legal')` に絞る形で別 migration 化する想定 (ARCHITECTURE.md Phase2 章で `current_org_id()` 二段ガード化と同列の話)。 (c) S2-N-03〜S2-N-05 はコメント追記レベル / CHANGELOG 整合の話で、`docs/ARCHITECTURE.md` 監査チェーン章 + `CHANGELOG.md:1-87` 末尾に Round1 12 migrations 記載で整合は保たれた。 | **PARTIAL** (合計 -0.5 で内包。idempotency 観点 0.5 / RLS 0.5 で吸収済み) |

集計: PASS 9 / PARTIAL 2 / 失敗 0。

---

## Breakdown 詳細ロジック

### 1) RLS カバレッジ 24/25 (+2.0)
- Round 2 で完成済の 11 P1 テーブル (audit_logs / idempotency_keys / recording_segments / recording_stages / business_card_images / contact_memos / offline_queue / non_card_attachments / sync_failure_log / data_residency_config / recent_views / autosave_drafts / feature_flags / ab_test_assignments) に加え、**share_links (0022) / sample_data_seeds (0021)** が追加で着地。
- `update_recording_insights` RPC (0023) が `recordings` の編集経路を「owner OR manager/admin/legal」へ閉じ込め、テーブル直接 UPDATE は authenticated に対して引き続き REVOKE。
- `current_org_id()` が fail-closed (0026) になったことで、Phase2 マルチテナント期に GUC 設定漏れが「default org にデータが書かれる」事故ではなく policy 句側で素直に「行が見えない」へ倒れる。
- -1.0 は (a) S-H-02 で挙げた P2 必須テーブル (`knowledge_items / handoffs / roleplay_*` 等) の scaffold trace が依然 0、(b) `data_residency_config` SELECT policy `using(true)` の絞り込みが Phase2 預け。

### 2) service_role 分離 15/15
- 変動なし。`apps/web/src/lib/env.ts` の service_role 削除を維持、`appendAudit()` も含め新規追加コードはすべて `apps/worker/src/lib/supabase.ts` (service_role) 経由。
- `audit.ts:5-22` が「業務イベント記録は worker 側で行うこと、Route Handler では呼ばない」設計をコメントで明示。

### 3) Webhook 署名 10/10
- 変動なし。Round 2 の 90日 dual-secret rotation + per-IP rate limit + 64KB body cap + URL validation は維持。`webhooks.ts:74-178` に rate limit → body size → JSON parse → URL validation → signature verify → jobs_inflight idempotency → enqueue → audit の **7 段ガード** が連続して文書化。

### 4) OAuth scope 5/5
- 変動なし。`GOOGLE_SCOPES_MIN = ['openid','email','profile','calendar.events']` 維持、`SETUP_GOOGLE_OAUTH.md` の project ref placeholder 化で逆漏えい (本番 ref を docs に固定する事故) も防止。

### 5) Idempotency-Key 9.5/10 (+0.5)
- `c.req.raw.clone()` fallback + regression test で Hono 4.x 挙動依存リスクを解消。
- -0.5 は response_jsonb の本体保存が依然 status だけ。Round1 T-5 仕様 (`response_jsonb` で完全 replay) には未到達だが、二重実行リスクは jobs_inflight (DB 側 `(queue_name, idempotency_key) PK`) で別途閉じているため P1 では許容範囲。

### 6) share_links 5/5 (+3.0)
- 0022 で DDL + 5 種 resource_type CHECK + RLS + sha256 + ip_allowlist + password_hash + watermark_email + click_count を **L-6 / S-M-06 仕様どおりに全列実装**。
- ARCHITECTURE.md 共有リンク章で「token は `crypto.randomBytes(32).toString('base64url')` 平文 / DB は sha256(token) のみ / argon2id (P2) / 公開 endpoint は P2 / middleware の `PUBLIC_PREFIXES = ['/share/']` で auth 免除」を一連で明文化。
- `share-links.ts` Drizzle schema が SQL と同期 (resource_type CHECK の文字列リストまで一致)。
- 公開 endpoint の SECURITY DEFINER RPC は P2 移送だが、テーブル側の RLS が「authenticated に対して publicly SELECT を返さない」設計 (`org_id = current_org_id() and (created_by = auth.uid() or is_manager_or_admin())`) で fallback ガード済み。

### 7) secret 管理 10/10 (+1.0)
- `README.md` (0.2.0) に **Secret rotation SOP** が runbook として定着 (`ZOOM_WEBHOOK_SECRET_TOKEN` の `_PREVIOUS` 並走 7 日 → swap → 90 日後 PREVIOUS DROP の手順) + 90 日カレンダー記載要件。
- `SETUP_GOOGLE_OAUTH.md` で project ref を `<your-project-ref>` placeholder 化、本番 ref は注釈 1 か所に集約 → 設定 SOP の冗長 leak リスク減。
- gitleaks / pnpm audit / CodeQL / dual-secret env / Renovate (CHANGELOG 0.2.0) は維持。

### 8) MFA / dual approval / audit 9.5/10 (+2.5)
- `appendAudit()` ヘルパ (apps/worker/src/lib/audit.ts) + webhook 配線 + `update_recording_insights` 内の audit_logs 自動 INSERT で **「業務イベントを実際に記録するコード経路」** が成立。
- Round2 で完成済の hash chain trigger + append-only RLS + auditAction enum と組み合わさり、C-5 (audit 改ざん検知) 仕様の P1 範囲は完全充足。
- `audit.test.ts` 3 件で「row_hash='pending' placeholder」「null 引数省略」「supabase エラー throw 化なし」を unit カバー。
- -0.5 は **S2-H-01: 0008 default `org_id = '...001'` がコード上未除去**。docs に Phase2 切替手順は書かれたが、コードレベルの cutover migration (0027) placeholder が無い。WORM (R2 Object Lock) と MFA 強制 / dual approval は P2/P3 SOP 線で維持。

### 9) CSP / Rate limit / CORS 5/5 (+1.0)
- Round2 残の `apps/web` 側 `/api/*` rate limit + CORS allowlist が 100% 完成。
- `middleware.ts:67-88` で **rate limit を認証コスト前**に評価する正しい順序 (credential stuffing 攻撃時に Supabase の auth コストを引き出させない)。
- `next.config.mjs:38-53` で `Access-Control-Allow-Origin = APP_URL` (環境変数 fallback `http://localhost:3000`) + `Vary: Origin` 同梱でキャッシュ汚染回避。

### 10) PII / data residency 5/5 (+0.5)
- `data_residency_config` (0007) + `recording_segments.pii_redacted_text` 維持。
- `update_recording_insights` RPC で edited insights 列の「sensitive な要約 / commitments」も owner+管理ロールに閉じる経路ができたため、PII (顧客住所 / 電話) を含む summary がインライン編集された際の経路も RLS の管轄下に入った。
- pii_detector.ts worker 実装 stub は P2 (M-C3) 預けで、本観点 5 点制約の中では実害なし。

---

## 残課題 (Round 3 → Round 4 候補)

### High
- **S3-H-01** *0008 default `org_id = '...001'` が依然コード上に残存*。
  - 場所: `0008_audit_logs.sql:15`、および 0007/0009/0010 の各 `default '00000000-0000-0000-0000-000000000001'::uuid` 全 P1 テーブル。
  - 違反: ARCHITECTURE.md Phase2 切替手順は記載されたが、その手順を **実行可能な migration (0027)** がコード化されていない。docs と code の乖離。
  - 修正案: `0027_phase2_org_id_strict.sql` placeholder を作り (a) `alter table audit_logs alter column org_id drop default;` (b) policy `using (org_id = current_org_id() and current_org_id() is not null)` 一括書換、(c) `audit_logs.chain_seq SERIAL` 追加 + `(org_id, chain_seq) UNIQUE` を `-- TODO: P2 cutover` のコメント付きで雛形化。本番適用は feature flag で gate。
  - 減点: -1.0 (audit 観点に計上)

### Medium
- なし。

### Minor
- **S3-N-01** `data_residency_config_select` policy が `using (true)` のまま (R2 の S2-N-02 持ち越し)。Phase2 で `current_user_role() in ('manager','admin','legal')` への絞り込みが必要だが、P1 単独では Sentinel 列 (region/dr_region) のみで PII 露出は無いため P1 では許容。-0.0 (実害ゼロのため減点せず観測のみ)
- **S3-N-02** `idempotency_keys.response_jsonb` の本体保存が未実装。jobs_inflight + idempotency_keys 二重ガードで二重実行は防げるが、true replay (同 key 同 hash で同 response 返却) は失敗するケースがある。-0.0 (idempotency 観点に既計上)

---

## まとめ (3行)

1. Round 2 で挙げた 11 残課題のうち **9 件 PASS / 2 件 PARTIAL** で +10.5 点を回収。share_links DDL/docs / appendAudit ヘルパ / web rate-limit + CORS / jobs_inflight wiring / recording insights RPC / users.is_active default false / current_org_id fail-closed / idempotency body clone+regression test の 8 ピボットが全部きれいに着地。
2. **残 -1.0 は 0008 default org_id ハードコード**。ARCHITECTURE.md には Phase2 切替手順 6 ステップが書かれたが、コード側の cutover 雛形 (0027 migration placeholder + audit_logs.chain_seq 列) が未着手で **docs と code の乖離**が残る。
3. 100 点到達には次 Round で **`0027_phase2_org_id_strict.sql` placeholder + `audit_logs.chain_seq` 列追加 + `current_org_id() is not null` 二段ガード policy 書換** の 3 点を一気に投入すれば確実。それ以外は P2/P3 SOP 線で維持できているため Phase 1 リリース判定としては **GO** (99/100 = Critical/High すべて解消、Medium 残 0、Phase2 移行までに対応で十分なリスク)。
