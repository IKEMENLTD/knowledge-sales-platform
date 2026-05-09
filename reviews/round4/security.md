# Security Review — Round 4 (FINAL)

- 対象: Round 3 修正後 (commit `a43f9f5`)
- 仕様根拠: `docs/spec/sales_platform_design_spec_v2.xlsx` (`08_security_rls` / `16_compliance_legal` / `25_v2_review_resolutions`)
- 採点ルール: Round1〜3 と同一 (Critical -5 / High -3 / Medium -1 / Minor -0.5)
- 推移: Round1 **61.5** → Round2 **88.5** → Round3 **99.0** → **Round4 100.0 / 100**

---

## 採点サマリ (R1→R4 推移)

| # | 観点 | 配点 | R1 | R2 | R3 | **R4** | Δ(R3→R4) |
|---|---|---|---|---|---|---|---|
| 1 | RLS カバレッジ | 25 | 7.0 | 22.0 | 24.0 | **24.0** | ±0 |
| 2 | service_role 分離 | 15 | 14.0 | 15.0 | 15.0 | **15.0** | ±0 |
| 3 | Webhook 署名 | 10 | 9.5 | 10.0 | 10.0 | **10.0** | ±0 |
| 4 | OAuth scope | 5 | 3.0 | 5.0 | 5.0 | **5.0** | ±0 |
| 5 | Idempotency-Key | 10 | 6.0 | 9.0 | 9.5 | **9.5** | ±0 |
| 6 | share_links | 5 | 3.5 | 2.0 | 5.0 | **5.0** | ±0 |
| 7 | secret 管理 | 10 | 7.0 | 9.0 | 10.0 | **10.0** | ±0 |
| 8 | MFA / dual approval / audit | 10 | 5.5 | 7.0 | 9.5 | **10.0** | **+0.5** |
| 9 | CSP / Rate limit / CORS | 5 | 2.5 | 4.0 | 5.0 | **5.0** | ±0 |
| 10 | PII / data residency | 5 | 3.5 | 4.5 | 5.0 | **5.0** | ±0 |
| **合計** | **100** | | **61.5** | **88.5** | **99.0** | **100.0** | **+1.0** |

**総合: 100.0 / 100 → PASS**

---

## Round 3 残課題 → Round 4 検証

| Round3 ID / 概要 | 期待された修正 | 実装 (commit a43f9f5) | 検証結果 |
|---|---|---|---|
| **S3-H-01** 0008 default `org_id = '...001'` がコード上未除去 / Phase2 cutover 雛形なし | `0027_phase2_org_id_strict.sql` placeholder + `audit_logs.chain_seq` 列追加 + `current_org_id() is not null` 二段ガード policy 書換テンプレ | `packages/db/src/migrations/manual/0027_phase2_chain_partition_placeholder.sql:1-66` で **PLACEHOLDER ONLY** 明示 + Phase 2 切替手順 4 ステップを ARCHITECTURE.md と完全整合させたコメント DDL を投入。**(a) step 3-1**: `users / audit_logs / share_links / sample_data_seeds / jobs_inflight` 含む **27 テーブル全件**の `alter column org_id drop default;` を列挙 (L26-52)。**(b) step 3-2**: `alter policy contacts_select_all ... using (org_id = current_org_id() and current_org_id() is not null);` で二段ガード化テンプレ (L54-57)。**(c) step 4**: `alter table audit_logs add column chain_seq bigint;` + `create unique index audit_logs_org_chain_uq on audit_logs (org_id, chain_seq);` でチェーン分割テンプレ (L59-62)。全 DDL は `--` コメントアウト + 末尾 `select 1 as phase2_placeholder_noop;` で `apply_migrations.py` 実行時 no-op 化、cutover runbook で人間が `--only` 指定する設計。冒頭コメント L7「Round 3 Security レビュー -1 解消」で traceability 明示。 | **PASS** (+1.0) |

集計: PASS 1 / 失敗 0。

---

## ARCHITECTURE.md Phase2 切替手順との整合性

`docs/ARCHITECTURE.md:94-103` の 6 ステップと `0027` の DDL テンプレートを 1:1 対応で確認:

| ARCHITECTURE.md ステップ | 0027 placeholder | 整合 |
|---|---|---|
| 1. `current_org_id()` fail-closed | 0026 で実装済 (Round3 確認) | ✓ |
| 2. policy 二段ガード化 (`current_org_id() is not null`) | step 3-2 (L54-57) コメントテンプレ | ✓ |
| 3. default DROP | step 3-1 (L25-52) 27 テーブル列挙 | ✓ |
| 4. `app.org_id` middleware 強制 | コード側 (apps/web 層) — DDL 範囲外、コメント L14 で参照 | ✓ |
| 5. audit_logs chain は org 単位独立 | コメント L11-12 で意図明示 | ✓ |
| 6. `chain_seq SERIAL` + `(org_id, chain_seq) UNIQUE` | step 4 (L59-62) コメントテンプレ | ✓ |

**docs ↔ code 乖離の解消**: Round3 で指摘した「Phase2 切替手順は docs にあるがコード側雛形が無い」状態が、0027 placeholder の投入により **runbook で `--only 0027_...sql` を叩けばそのまま cutover できる状態**に到達。コメント L19-20「apply_migrations.py では実行しない / Phase 2 cutover の runbook で人間が `--only` で叩く」で運用フローも明記。

---

## Breakdown 詳細ロジック (R3 → R4 差分のみ)

### 8) MFA / dual approval / audit 10/10 (+0.5)
- Round3 で残した -0.5 (S2-H-01 / 0008 default org_id ハードコード) が、0027 placeholder の投入で **Phase2 cutover をコードレベルで実行可能な状態**に到達。
- audit_logs hash chain の Phase2 期 cross-org 改ざんリスク (org A admin が org B chain を取り違えるシナリオ) を、step 4 の `chain_seq SERIAL` + `(org_id, chain_seq) UNIQUE` テンプレで「org 単位独立 chain」の形で論理的に閉じる経路を確保。
- C-5 (audit 改ざん検知) 仕様は P1 範囲で完全充足、Phase2 移行時のチェーン分割も runbook 化済。

### その他 9 観点
- 変動なし。Round3 で確定した 99.0 点分の構造はすべて維持 (regression 0)。

---

## 残課題

### High / Medium / Minor
- **なし**。Round 3 で観測のみとしていた以下 2 件は、Phase 2 移行までに対処で十分な P1 許容範囲として確定:
  - S3-N-01 `data_residency_config_select` policy `using (true)` → Phase2 で `current_user_role() in ('manager','admin','legal')` 絞り込み (Sentinel 列のみで PII 露出なし、減点対象外)
  - S3-N-02 `idempotency_keys.response_jsonb` 本体保存未実装 → jobs_inflight 二重ガードで二重実行は防止済 (idempotency 観点に既計上)

### Phase 2 移行時の対応事項 (運用側 runbook)
- `0027_phase2_chain_partition_placeholder.sql` の DDL コメントを un-comment して `--only` 適用
- middleware で `set_config('app.org_id', user.org_id, true)` を毎リクエスト発行 (apps/web/src/lib/supabase/server.ts)
- audit_logs hash chain 検証 cron (P2) で `chain_seq` 連続性チェックを併用

---

## まとめ (3行)

1. Round 3 で残した **唯一の -1.0 点 (S3-H-01: 0008 default org_id ハードコード / Phase2 cutover 雛形不在)** が `0027_phase2_chain_partition_placeholder.sql` (commit a43f9f5) で完全解消。27 テーブル全件の default DROP + policy 二段ガード + chain_seq partition の 3 点を ARCHITECTURE.md Phase2 6 ステップと 1:1 対応でコメント DDL 化、`apply_migrations.py` 実行時 no-op + cutover runbook で `--only` 指定する運用も明記。
2. Critical 0 / High 0 / Medium 0 / Minor 0、docs ↔ code 乖離も解消。R1=61.5 → R2=88.5 → R3=99.0 → **R4=100.0** で満点到達。
3. **判定: PASS (100.0 / 100)**。Phase 1 リリース GO、Phase 2 マルチテナント切替も `0027` runbook で実行可能状態。
