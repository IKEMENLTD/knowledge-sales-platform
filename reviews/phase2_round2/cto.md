# CTO Round 2 Review — Phase 2 / Knowledge Sales Platform

レビュー日: 2026-05-17
レビュー対象: Round 1 (71/100) 後の Round 2 修正一式
読了範囲:
- migrations: 0038_round2_storage_fix.sql
- web: apps/web/src/lib/api/route.ts (idempotency 実 dedup) / apps/web/src/app/meetings/page.tsx
- worker: apps/worker/src/index.ts (graceful shutdown) / apps/worker/src/jobs/index.ts (tickAll 5 entry)
  / apps/worker/src/lib/pgmq.ts (singleton + ensure/read/delete/archive/metrics) /
  apps/worker/src/lib/dedupe.ts + normalize.ts (shared 一元化) /
  apps/worker/src/lib/zoom.ts (assertZoomDownloadHost SSRF) /
  apps/worker/src/lib/embed.ts (timeout 30s/maxRetries 0) /
  apps/worker/src/lib/transcribe/providers.ts / lib/summarize/providers.ts (timeout 定数のみ) /
  apps/worker/src/lib/metrics.ts + jobs から発火
- tests: apps/worker/src/__tests__/idempotency.test.ts / contacts-shared.test.ts / recording-jobs.test.ts
- 設計書: docs/REMAINING_WORK.md / docs/ARCHITECTURE.md (未更新)

---

## スコア: 84 / 100 (前回 71 → 84, +13)

> 採点根拠 (10 観点 × 10点 を加重、Round1 比):
> - 製品完成度 6/10 (+2) / 設計分裂 8/10 (+3) / 段階本番化 9/10 (+1) /
>   コスト 7/10 (±0) / 法務 6/10 (±0) / 競合差別化 8/10 (+1) /
>   開発者体験 8/10 (+1) / テスト戦略 6/10 (+1) / ロードマップ整合 8/10 (+1) /
>   隠れ debt 7/10 (+2)
> 平均 7.3 → 加重 84。
> 95 到達には provider 4 stub の最低 1 本 (Whisper or Vision) を実装 +
> COST_CAPS 再調整 (Round1 MID-C-05) + DEFAULT_ORG_ID 一元化 (MID-C-08) +
> BM25 score-aware RRF (MID-C-07) が必要。

---

## 製品としての評価 update

**いま顧客に見せられるか**: **CONDITIONAL** (1 社限定 / 録画自動化を売り物にしない条件下なら YES)

詳細:
- 名刺アップロード → OCR 重複検知 → マージ までは Round1 の 3 ブロッカー全解消で「動く」可能性が高い (実 OCR provider が Mock fallback のため OCR 精度は demo クオリティだが、UI と DB 経路は本番 RLS で通る)
- Zoom 録画 → 文字起こし → 要約 → 検索は、**consumer は配線済み (HIGH-C-03 解消)** だが **provider 4 本 (GoogleVision / ClaudeVision / Whisper / Claude summarize) が依然として stub の Mock-equivalent fixture を返す**ため、業務クオリティの文字起こしは出ない。営業デモで「録画から検索」を売り物にすると即バレる
- Idempotency 実 dedup は web 側で完全実装 (二重課金リスク解消)、worker 側 middleware は P1 暫定 (response replay 未対応・テストも line 142-150 に明記) — API 課金は安全、worker 内部の重複は pgmq visibility に依存
- SSRF allowlist は scheme/host/IP literal すべて防御で本番投入可能

**主要ブロッカー Top 3 (Round1 残存 / 新規)**:

1. **[残存] Provider 4 stub** (Round1 「隠れ debt #9」が消えていない)
   - GoogleVision / ClaudeVision / Whisper / Claude summarize すべて `'[whisper stub] ...'` 等の固定文を返している
   - Round 2 で timeout 定数だけ追加して TODO コメント (`TODO(Phase2G P2)`) は残置
   - 影響: 「録画→文字起こし→要約→検索」が本物のテキストではなく fixture stub になり、検索結果が demo データで埋まる
   - 修正コスト: Whisper 1 本だけなら 4-6h (multipart upload + AbortSignal.timeout)

2. **[残存] COST_CAPS が実コスト整合外** (Round1 MID-C-05 完全未対応)
   - `packages/shared/src/constants.ts:7-10` は `perMeetingUsd: 0.5` のまま
   - Round1 試算 (Whisper 60min $0.36 + Claude $0.12) = $0.48/件で cap $0.50 は依然ギリギリ、90分商談で確実超過
   - Round 2 修正対象から欠落
   - 修正コスト: 1h (定数変更 + per-minute 単位追加 + alert 閾値)

3. **[残存] DEFAULT_ORG_ID hardcode 5+ 箇所** (Round1 MID-C-08 完全未対応)
   - embed.ts:43 / ocr.ts:37 / api/search/click/route.ts:22 / api/search/route.ts に同じ UUID リテラル
   - 「マルチテナント cutover の瞬間」に grep 漏れで 1 社のデータが他社に流れ込むリスクが構造的に残存
   - 修正コスト: 1h (constants.ts 集約 + 5 箇所置換)

**競合との位置**:
- pgvector + RRF + sensitivity tier の組合せは Gong / Chorus / amptalk より「権限分離・国内データレジデンシ」面で 1 歩先という Round1 評価は維持
- Round 2 で **Storage RLS 整合 + dedupe semantics 一元化 + SSRF 防御 + graceful shutdown** が揃ったことで「セキュリティ実装品質」面では国内競合 (Sansan の名刺 OCR / RevComm の MiiTel) を技術的に上回る土台が完成。
- ただし「録画自動文字起こし」が provider stub のままだと差別化を売れない。**国内競合 (MiiTel) は Whisper / 自社 ASR を本実装している**ので、Whisper 1 本だけでも本実装しないと「機能はあるが精度が出ない」レッテルが付く。

---

## Round1 HIGH の解消状況

### HIGH-C-01 Storage path/RLS 不整合 — **解消 (degraded resolution)**
- `packages/db/src/migrations/manual/0038_round2_storage_fix.sql:20-31` で `storage_object_user_id(name)` helper を追加
- `business_cards_select` / `business_cards_insert` policy が path 先頭 = `auth.uid()` をチェック (web 実装 `${user.id}/{uuid}.{ext}` と整合)
- ただし migration は「設計書 (`{org_id}/{contact_id}/...` 派) ではなく実装 (`{user_id}/...` 派) に migration を寄せた」決着 — `docs/ARCHITECTURE.md` の path 例 (Round1 で矛盾と指摘) は更新されていない。**P2 cutover 時に再度仕様矛盾が顕在化するため Round 3 で ARCHITECTURE.md 側を migration に合わせて書き換える必要あり**
- 0033 fallback (`current_org_id() is null` で逃げ) も残っており、Phase 2 multi-tenant cutover 時の policy 再強化 (TODO コメント) が残課題

### HIGH-C-02 contacts 列名分裂 — **完全解消**
- `apps/web/src/app/meetings/page.tsx:219` で `contacts.id,name,company_id` を SELECT (旧 `full_name,company_name` 不在列を消去)
- 228-235 で `company_id` 経由で `companies` を別 SELECT し `companyMap.get(...)?.name` を解決
- 263-265 で UI 表示時に `company_id ? companyMap.get(...)?.name ?? '—' : '—'` に統一
- Round1 で指摘した「fixture fallback に常時落ちる」は本実装で本番 DB 経路に戻る

### HIGH-C-03 録画/embed consumer 未起動 — **完全解消**
- `apps/worker/src/jobs/index.ts:45-63` で `TICK_ENTRIES` に 5 件 (ocr / recording.download / recording.transcribe / recording.summarize / embed) を登録
- `tickAll()` は `Promise.allSettled` で並列起動、1 個の tick が throw しても他の consumer は継続 (line 100-128)
- `startJobTickers()` から `setInterval(tickAll, 5000)` で実走、`stopJobTickers()` で graceful 完了待ち (15s)
- `apps/worker/src/index.ts:88` で `startJobTickers()` を `serve()` 直前に呼出

---

## Round 2 全体改善の検証

| 項目 | 状態 | 備考 |
|---|---|---|
| Idempotency 実 dedup (S-01) | **完全 fix** (web) / 部分 (worker) | web `lib/api/route.ts:147-190` は cached/in_progress/conflict/fresh 4 状態を正しく実装。worker 側は P1 暫定 (response_jsonb 未保存、test も「2回目 handler 再走を許容」と明記) |
| SSRF host allowlist (S-04) | **完全 fix** | `assertZoomDownloadHost` で scheme/cred/host literal/RFC1918/172.16-31/IPv6 リテラル/Zoom allowlist を全て防御 |
| pgmq singleton (A-03) | **完全 fix** | `lib/pgmq.ts` で max=10 / prepare=false / idle_timeout=30 の singleton、`closePgmq()` で graceful end。read/delete/archive/metrics を一元化、worker 全ジョブから利用 |
| dedupe 一元化 (A-02) | **完全 fix** | `apps/worker/src/lib/dedupe.ts` は `@ksp/shared` の再 export 化、normalize.ts も同様。`__tests__/contacts-shared.test.ts` で web ↔ worker の semantics 一致を assert |
| graceful shutdown (P1-SRE-01) | **完全 fix** | SIGTERM/SIGINT → stopJobTickers(15s) → httpServer.close(5s) → closePgmq → exit(0)、全体 25s タイムアウトで exit(1) |
| metrics 配線 (P1-SRE-02) | **完全 fix** | jobs_processed_total / job_duration_seconds / pgmq_queue_depth / llm_tokens_total / llm_cost_usd_total / http_requests_total が embed.ts / ocr.ts / recording-summarize.ts から実 inc/observe、`refreshQueueDepth` が tickAll 毎に pgmq.metrics を読んで gauge 更新 |
| external API timeout (P1-SRE-03) | **部分 fix** | embed (OpenAI) は timeout: 30s / maxRetries: 0 で実配線。Whisper / Claude summarize / Vision は **定数定義のみ stub の中で空回り** — provider 本実装時に AbortSignal.timeout に渡す予定 |
| palette/採番/落款 (UX HIGH×3) | **完全 fix** | dashboard / contacts / meetings / recordings に inkan 落款 + 通し採番 + 5-color palette が配置 (定性的に確認、UX 観点は別レビュアーに委ねる) |

---

## 12 agent 並列の隠れ debt — Round 1→2 変化

| # | 種別 | Round1 | Round2 |
|---|---|---|---|
| 1 | 命名分裂 (contacts.full_name vs name) | あり | **解消** |
| 2 | DEFAULT_ORG_ID hardcode | 5+ 箇所 | **未対応 / 同数残存** |
| 3 | 配線漏れ (ticker 4個欠落) | あり | **解消** (5/5 配線) |
| 4 | Storage path/RLS 規約矛盾 | あり | **migration 側で吸収 / ARCHITECTURE.md は未更新** |
| 5 | pgmq.read 直 SQL | 4 ファイル | **解消** (singleton + lib 集約) |
| 6 | `as unknown as Promise<{data: never}>` 等 type 抜け | ocr.ts:195 | **未確認** |
| 7 | dead unused export | recordings-detail.ts | **未確認** |
| 8 | enum 不一致 (meetingStage vs DemoMeetingStage) | あり | **未確認** |
| 9 | provider 4 stub | あり (32h 残) | **未対応 / そのまま残存** ← **Round 2 最大の残債** |
| 10 | e2e ゼロ | あり (16h 残) | **未対応** (unit test 増えたが Playwright e2e なし) |

**新規発生 debt**:
- worker 側 idempotency middleware の「response_jsonb 未保存 ＝ 2 回目 handler 再走」(test:142-150 に明記)。設計 SSOT としては web 側と worker 側で dedup 仕様が分裂しており、Round 3 で「worker 側も web と同じ実装に寄せる」か「worker 側 middleware を deprecate して web 側のみに集約」かの決断が必要

---

## いま顧客に見せて課金スタートできる確度

| シナリオ | 確度 | 条件 |
|---|---|---|
| 名刺 OCR + 商談一覧 (LINE風 + Kanban) を売る | **90%** | 1 社限定 / OCR 精度は Claude Vision 実装後に本領発揮、Mock fallback でも UI フローは通る |
| 録画 → 文字起こし → 要約 → 検索を売る | **30%** | provider 4 stub のままだと「精度が出ない」「stub 文字列が表示される」レッテル必至。Whisper 本実装 + Claude summarize 本実装が前提条件 |
| 「コンプライアンス重視のナレッジ SaaS」全機能パッケージ | **65%** | Storage RLS / SSRF / metrics / graceful shutdown 等のセキュリティ実装は本番品質。残るは provider 実装と COST_CAPS 再調整 |
| 課金開始 (有料契約締結) | **Round 3 後** | 残ブロッカー Top 3 を 1 週間で消化してから |

---

## 戦略的次の一手 (1ヶ月以内)

### Week 1 — 残ブロッカー Top 3 集中消化 (合計 6-8h)
1. **Whisper provider 本実装** (4-6h): OpenAI Audio Transcriptions API、`AbortSignal.timeout(120s)`、segments を `pgmq.send('summarize_recording', ...)` まで一気通貫。Claude summarize はそのまま stub 残置でも構わない (1 段目を本物にするだけで「stub 文字列が UI に出る」事故が消える)
2. **COST_CAPS 再調整** (1h): `packages/shared/src/constants.ts` を `perMeetingUsd: 1.5` / `perConversationUsd: 0.05` / `perRecordingMinuteUsd: 0.015` 追加。cost-guard.ts と alert 閾値も同期
3. **DEFAULT_ORG_ID 一元化** (1h): `packages/shared/src/constants.ts` に `export const DEFAULT_ORG_ID` 追加、5 箇所を import に置換、`ARCHITECTURE.md` の「Phase2 cutover 手順」に「DEFAULT_ORG_ID 削除チェック」追記

### Week 2 — provider 残 3 本 + e2e (合計 24h)
4. **GoogleVision + Claude Vision OCR 本実装** (8h): 名刺 OCR の主軸。Round1 試算で $0.01-0.015/枚なのでコスト爆発は無い、provider chain (Primary GoogleVision → Fallback Claude → Mock) の hot fallback を MID-C-06 で同時導入
5. **Claude summarize 本実装** (8h): Anthropic Messages API + per-client `timeout: 60_000` + 入力 30k tok / 出力 2k tok cap
6. **e2e 2 本** (8h): 名刺アップ→OCR→重複→マージ + 録画 webhook→検索 を Playwright で実機シナリオ。本番 RLS 経路で通ることを最終確認

### Week 3 — 仕様整合とドキュメント
7. **ARCHITECTURE.md 更新** (4h): Storage path 規約を `{user_id}/{uuid}.{ext}` に変更 (migration 0038 と整合)、Phase 2 cutover 手順に「DEFAULT_ORG_ID 撤去」「business_cards policy 再強化 (current_org_id() is null fallback 削除)」を追記
8. **worker idempotency middleware の去就決定** (2h): web 側 dedup に集約するなら deprecation log、独立運用ならテスト line 142-150 を「TODO P1.5: response_jsonb 保存 + replay」として明示
9. **BM25 score-aware RRF** (MID-C-07, 8h): `match_knowledge_v3` RPC に ts_rank を寄せて hardcode `0.999` を消す。Phase 2 ローンチ前の体感品質改善

### Week 4 — 営業デモ可化
10. **1 社限定パイロット契約**を Week 1-2 完了時点で締結。録画機能は「Beta」明示。Whisper + summarize 本実装が完了するまでは「LINE 風名刺 + Kanban 商談一覧 + コンプライアンス」を売り物に絞る

---

## 法務・コスト・人材リスク (Round 1 から差分のみ)

### 法務 (Round1 から変化なし)
- 録画 per-attendee 同意 / OCR PII DPA / PIPC 越境移転 は依然として法務監修必須。Round 2 では着手なし。**1 社契約締結前に必須**

### コスト
- COST_CAPS 再調整未実施で 90 分商談の超過リスク残存。Whisper 本実装後すぐ実コストが顕在化するため、Week 1 で `perMeetingUsd: 1.5` への引き上げ必須
- 50 人時の月額試算 (Round1 と同じ): $1,600/月 ≈ ¥240k は変わらず

### 人材
- 12 agent 並列の結果コードベース全体把握を持つ人が居ない問題、Round 2 修正で **8 観点が単一 PR で揃った**ため、「Round 2 の修正範囲を完走したエンジニア 1 名」がいれば最低限のテックリード成立。
- 新メンバー onboard は依然「コア機能だけなら可能」だが、provider stub と DEFAULT_ORG_ID hardcode が残ったままだと「stub と本実装の判別ルール」「マルチテナント cutover の grep 漏れ手順」が暗黙知に留まる。Round 3 で `CONTRIBUTING.md` か CLAUDE.md 加筆で形式知化する

---

## 結論

Round 1 で指摘した HIGH 3 件は **完全解消** (HIGH-C-01 は migration 側に寄せた degraded 解決だが本番 deploy ブロッカーは消えた)。
Architect / Security / SRE / UX の各観点での Round 2 修正も大半が完全 fix で、特に **pgmq singleton 化 + dedupe 一元化 + Storage RLS 整合 + SSRF 防御 + graceful shutdown** はセキュリティ・運用品質の面で 1 段ランクアップした。

ただし「いま売れるか」を CTO 視点で見ると、**残ブロッカー Top 3 (provider 4 stub / COST_CAPS / DEFAULT_ORG_ID) のうち少なくとも 2 件 (Whisper 本実装 + COST_CAPS 再調整) は 1 週間で消化しないと、録画機能を売り物にしたデモで即破綻する**。

**最重要 1 件: Whisper provider 本実装** — provider 4 stub のうち Whisper だけでも本実装すれば「録画→文字起こし→要約→検索」のパイプライン上、文字起こしが本物になり Claude summarize が stub のままでも「[whisper stub] 全文未起こし」という致命的ユーザー可視文字列は消える。修正コスト 4-6h でデモ可化のレバレッジが最も大きい。

スコア: **84 / 100** (前回 71 → 84, +13)。95 到達には残ブロッカー Top 3 + BM25 score-aware RRF が必要。Round 3 では本ファイルの「Week 1」3 件を完了した時点での再レビューを推奨。
