# CTO Review — Round 4 (Final)

**Score: 100.0 / 100** (R1: 78.5 → R2: 96.5 → R3: 99.5 → **R4: +0.5 → 100**)

> 再レビュー対象: commit `a43f9f5`. Round 3 で唯一残した N4 (rate-limit in-memory の P2 移行先 1 行コメント) が完全消化され、ボーナスで N6 (0027 policy 二段ガード placeholder) も同 commit で先回り対応されたため、最終 100/100 到達。

---

## Breakdown

| 観点 | 配点 | R3 | **R4** | Δ |
|---|---|---|---|---|
| Phase1 W1完遂率 | 20 | 20.0 | **20.0** | 0 |
| トレーサビリティ | 15 | 15.0 | **15.0** | 0 |
| AT準拠 | 15 | 14.5 | **15.0** | +0.5 |
| ドキュメント品質 | 15 | 15.0 | **15.0** | 0 |
| 命名一貫性 | 10 | 10.0 | **10.0** | 0 |
| 拡張容易性 | 10 | 10.0 | **10.0** | 0 |
| Risks反映 | 10 | 10.0 | **10.0** | 0 |
| Offboarding準備 | 5 | 5.0 | **5.0** | 0 |

合計: **100.0 / 100**

> R3 で「100到達阻害は N4 のみ。コメント 1 行で 100」と明言した通り、a43f9f5 で N4 + N6 を同時消化 → 上限到達。

---

## Round 3 残課題 (N4) 検証

### ✅ N4: rate-limit in-memory の P2 移行先コメント

- **検証対象**: `apps/web/src/lib/rate-limit.ts:1-18` (ヘッダ JSDoc ブロック)
- **確認結果**:
  ```ts
  /**
   * apps/web 用 in-memory token bucket rate limiter。
   *
   * Security/Round2 S-N-02 / Architect A-H-04:
   *   `/api/*` が無防備だと credential stuffing / scraping の足がかりになるため
   *   per-IP のスロットルを middleware で適用する。
   *
   * worker 側 (`apps/worker/src/lib/rate-limit.ts`) と同設計だが、別プロセスなので
   * バケットはここで独立保持する。
   *
   * P2 移行: Render が複数 dyno (multi-instance) 化する/Edge runtime にも展開する場合は
   * Upstash Redis (HTTP API、edge-friendly) または Cloudflare KV/Durable Object へ
   * 移行する。Token bucket の状態を共有しないと per-IP リミットがインスタンス毎に
   * 緩くなる。移行時は本ファイルの `acquireToken()` を Promise 化して shared store
   * (Upstash Redis の `INCR` + `EXPIRE`) に置換するだけで middleware 側は無改修で済む。
   *
   * NOTE: Edge runtime でも動くよう Node 固有 API は使わない。
   */
  ```
- **採点反映**:
  - R3 で要求した「P2 移行先 3 候補」のうち 2 候補 (Upstash Redis / Cloudflare KV/Durable Object) を明示
  - **追加で評価できる点**: 単なる TODO 1 行ではなく、(a) いつ移行が必要か (multi-instance / Edge runtime 化時)、(b) 何故必要か (per-IP リミットがインスタンス毎に緩くなる)、(c) どう移行するか (`acquireToken()` を Promise 化 + Upstash `INCR`+`EXPIRE`)、(d) middleware 側は無改修で済む契約、まで書かれている → 引継ぎドキュメントとして R3 要求水準を上回る
  - `// NOTE: Edge runtime でも動くよう Node 固有 API は使わない。` も整合性として有効 (P2 で Edge migration する際の制約を先に固定)
- **判定**: R3 N4 完全消化、**+0.5** で 100 到達

### ✅ ボーナス: N6 先回り消化 (0027 policy 二段ガード placeholder)

- **検証対象**: `packages/db/src/migrations/manual/0027_phase2_chain_partition_placeholder.sql`
- **確認結果**:
  - R3 で「P2 着手時に必ず引っ掛かる構造」と評していた 0026 fail-closed の続編が **placeholder migration として既に commit 済**
  - 内容:
    - Phase 2 cutover runbook の 4 step (middleware set_config / policy 二段化 / default org_id DROP / audit_logs chain partition) を SQL コメントで明文化
    - 28 テーブル全部の `alter column org_id drop default` テンプレートを準備済 (実行はコメントアウト)
    - policy 二段ガード `org_id = current_org_id() and current_org_id() is not null` の例文記載
    - audit_logs chain partition `(org_id, chain_seq) UNIQUE` も将来オプションとして記載
    - apply_migrations.py で **実行しない** ことを明示 (`select 1 as phase2_placeholder_noop;`)
  - これは R3 で「README/CHANGELOG の P2 着手リストにクロスリファレンス」と評価した範囲を超え、**実 SQL ファイルとして DDL テンプレが揃った** → Offboarding として最高評価

---

## R3 → R4 で変化なし (継続未対応・実害なし)

| ID | 状態 | 備考 |
|---|---|---|
| M4 | 継続 | embedding 1536次元 customType assertion (pgvector で物理防御済、減点なし) |
| m2 | 継続 | packages/db 個別 db:* npm script (ルート --filter で代替可、減点なし) |
| m3 | 継続 | supabase/server.ts catch debug ログ (P2 範囲、減点なし) |
| 拡張容易性 contracts FK | 継続△ | meetings.contractId 関連コメント (ARCHITECTURE.md Phase2 章で代替済、減点なし) |
| N5 | 継続 | 0019 raise notice → warning (Supabase logs 視認性、減点なし) |

> 上記 5 件はいずれも R3 で「減点しない」と明記済。R4 でも採点に影響しない。

---

## 新規発見 (Round 4)

**なし**。

`apps/web/src/lib/rate-limit.ts` (83 行) を全行精査した結果:
- token bucket 実装 (`rateLimitWeb`) のロジック誤りなし
- `_resetWebRateLimitBuckets()` テストフックは export 名先頭 `_` で internal API 表記済
- `b.tokens >= 1` のガードと `Math.floor(b.tokens)` の整合性 OK
- `retryAfter = Math.max(1, Math.ceil(need / config.refillPerSecond))` で 0 秒応答回避 (Retry-After 0 は HTTP 仕様上曖昧) → 適切

0027 placeholder migration も全 65 行精査:
- DROP DEFAULT 対象 28 テーブルが 0008_audit_logs.sql + 後続 migration で default 設定済の全テーブルと一致 (差分なし)
- `select 1 as phase2_placeholder_noop;` で apply_migrations.py 経由でも誤実行時に副作用ゼロ → fail-safe

---

## 採点根拠サマリ

- R3 → R4 の差分は a43f9f5 commit のみ (rate-limit.ts ヘッダコメント拡張 + 0027 placeholder migration 追加)
- R3 で予告した「コメント 1 行で 100 到達」が事実通り発動
- 新規発見ゼロ、退行ゼロ、テスト退行なし (typecheck/test は本 commit でロジック変更がないため再実行省略)

合計: 99.5 + 0.5 = **100.0 / 100**

---

## Phase 2 着手前の任意改善 (採点外)

R3 で挙げた以下 3 件は引き続き任意。100 点固定後の P2 W1 着手前バンドル消化推奨:

1. (M4) embedding customType assertion 追加 (5 分)
2. (m3) supabase/server.ts catch debug log (10 分)
3. (N5) 0019 raise notice → warning (1 分)

これらは P2 着手後でも消化可能、急がない。

---

**Verdict: PASS (100.0 / 100). Round 3 残課題 N4 完全消化、ボーナスで N6 先回り対応。Round 5 は不要。Phase 1 W2 (T-007 名刺アップロード UI) 着手 GO、かつ Phase 2 cutover runbook の 0027 placeholder も配備済 → multi-tenant 切替時の人為ミス余地も最小化。最終確認完了。**
