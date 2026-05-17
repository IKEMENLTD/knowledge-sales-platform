# CTO Round 1 Review — Phase 2 / Knowledge Sales Platform

レビュー日: 2026-05-17
レビュー対象: 12 agent 並列実装後の Phase 2 (名刺 / 検索 / 録画 / 商談)
読了範囲: README / ARCHITECTURE / REMAINING_WORK / migrations 0034-0037 / shared zod /
worker jobs (ocr, embed, recording-download, recording-transcribe, recording-summarize) /
provider 抽象 (ocr/transcribe/summarize) / web app routes (contacts/import, contacts/[id]/review,
meetings, meetings/[id], recordings, recordings/[id], search) / api routes (contacts,
contacts/upload-url, search)

## スコア: 71 / 100

> 採点根拠 (10 観点 × 10点 を加重):
> - 製品完成度 4/10 / 設計分裂 5/10 / 段階本番化 8/10 / コスト 7/10 / 法務 6/10 /
>   競合差別化 7/10 / 開発者体験 7/10 / テスト戦略 5/10 / ロードマップ整合 7/10 / 隠れ debt 5/10
> 平均 6.1 → 加重で 71。95 到達には少なくとも HIGH-C-01〜03 + MID-C-04〜06 の解消必要。

---

## 製品としての評価

**いま顧客に見せられるか**: **NO** (デモは可、課金スタートは不可)

理由:
- Storage 経路の path 規約と RLS が衝突しており、**名刺アップロードが本番 RLS 下で 100% 失敗** する (HIGH-C-01)
- 商談一覧 SSR が `contacts.full_name` / `contacts.company_name` を SELECT しているが、当該列はスキーマに存在しない。本番 DB ヒット時に毎回 fixture fallback に落ちる (HIGH-C-02)
- 録画パイプラインは consumer 4 つが定義されているのに `startJobTickers()` が `tickOcr` 1 個しか起動していない。Zoom Webhook が enqueue しても誰も読まない (HIGH-C-03)

**主要ブロッカー Top 3**:
1. **Storage RLS 違反** (HIGH-C-01)
2. **contacts スキーマ命名分裂** (HIGH-C-02)
3. **録画 consumer 未起動** (HIGH-C-03)

**競合との位置**:
- pgvector + RRF + sensitivity tier の組合せは Gong / Chorus / amptalk より「権限分離・国内データレジデンシ」面で 1 歩先。技術骨格は十分に競争力あり。
- ただし上記 3 ブロッカー解消前に営業デモを切ると「動かないナレッジツール」レッテルが付くリスク大。

---

## 戦略的懸念 (HIGH / MID / LOW)

### HIGH-C-01: Storage path 規約と bucket RLS の不整合
- `apps/web/src/app/api/contacts/upload-url/route.ts:43` — storage_key = `${user.id}/{uuid}.{ext}`
- `packages/db/src/migrations/manual/0035_storage_business_cards.sql:55-72` — `storage_object_org_id(name)` は path 先頭セグメントを `current_org_id()` と照合する
- 結果: 本番 RLS が ON な瞬間に **全アップロードが 403** で reject される。CI/dev で `current_org_id() is null` の OR 句が逃げ道になっていたため発覚していない。
- ARCHITECTURE.md の path 例も `business-cards/<userId>/<contactId>.jpg` で web 側に揃っている — 仕様書自体が migration と矛盾。
- 影響度: P0 / 修正コスト: 4h (path を `${orgId}/${userId}/{uuid}.{ext}` に変更 + review page の signed URL resolver 更新 + RLS の owner 句を `owner=auth.uid()` から `split_part(name,'/',2)::uuid = auth.uid()` に変更)

### HIGH-C-02: contacts テーブルの列名分裂 (full_name vs name / company_name vs company_id)
- meetings/page.tsx:213 が `id,full_name,company_name` を SELECT
- 実スキーマ (0001 + 0034) には `name` / `name_kana` / `company_id (FK)` しか無く `full_name` / `company_name` は存在しない
- search/route.ts:511 / contacts/[id]/review/page.tsx は `name` を使用、UI 同士でも齟齬
- 結果: 商談一覧の DB 経路が `error` を捕捉 → fixture fallback に落ち、本番でも常に「サンプル」バッジ
- 12 agent 並列の典型的事故。zod schema (`packages/shared/src/contacts.ts:81`) は `name` 派なので、UI 側を `name` に統一するのが正
- 影響度: P0 / 修正コスト: 1h (grep + 置換 + e2e 追加)

### HIGH-C-03: 録画 / embed consumer が ticker から呼ばれていない
- `apps/worker/src/jobs/index.ts:38` で `tickOcr()` のみ呼出。`recording-download.ts` / `recording-transcribe.ts` / `recording-summarize.ts` / `embed.ts` の `tickEmbed()` 等が未配線
- Zoom Webhook は受信 → pgmq.send まで動くが、誰も `pgmq.read('process_recording')` しないので積み上がる一方
- 結果: 録画は永遠に「処理中」表示、検索 embedding も生成されない → 検索結果は demo fixture モード固定
- 影響度: P0 / 修正コスト: 2h (`tickAll()` に 4 個追加 + visibility timeout 調整 + multi-queue の test 追加)

### HIGH-C-04: pgmq.read/delete を RPC 経由化していない (生 SQL fallback の慢性化)
- ocr.ts / embed.ts / recording-download.ts / recording-transcribe.ts 全てが `import('postgres')` で都度コネクションを開き、`sql.end()` で閉じている
- 各 tick で 2-4 接続を新規確立 → 5 秒間隔 × 4 ticker = 1 分あたり 48 接続。Supabase Pro の同時接続上限 (60) に張り付く
- かつ postgres-js を worker bundle に動的 import している。Render の cold start 時に毎回 require — リソース効率も悪い
- 設計判断として `pgmq.read` の SECURITY DEFINER RPC を 1 本切り出し、`supabaseAdmin.rpc('pgmq_read', {...})` で寄せるべき
- 影響度: P1 / 修正コスト: 6h (RPC + migration + worker 4 ファイル refactor)

### MID-C-05: COST_CAPS が 1 商談 $0.50 / 1 名刺 $0.10 で **実コストと整合していない**
- 1 商談あたり実コスト推定 (Whisper 60min $0.36 + Claude Sonnet 4.5 入力 30k tok 出力 2k tok ≈ $0.12 + embed 30チャンク ≈ $0.0006) = **$0.48** / 1件
- COST_CAPS = $0.50 だと "ほぼ常にギリギリ" で、長時間商談 (90min) は確実に超える
- 名刺 OCR の Claude Vision $0.01/枚は安全だが、GoogleVision DOCUMENT_TEXT_DETECTION は $0.0015/枚 (整合)
- 推奨: perMeetingUsd を **$1.50**, perConversationUsd を **$0.05** に再調整。長時間商談用に perRecordingMinuteUsd = $0.015 も追加
- 影響度: P1 / 修正コスト: 1h (constants 変更 + COST_CAPS の単位を 「per minute」追加 + アラート閾値再設定)

### MID-C-06: provider 抽象が「3 段階 fallback」ではなく「mock or real」二択化
- ocr/transcribe/summarize の pickProvider() は env キーが無ければ即 Mock。エラー時 / quota 切れ時の自動降格パスがない
- Claude Vision が rate-limit に当たったら GoogleVision に逃げる、といった hot fallback が無い
- 業務での「録画 100 本一括投入 → API quota 突破 → 全 fail」シナリオがある
- 推奨: provider chain (Primary → Fallback → Mock) と circuit breaker を導入。`pickProvider()` → `createProviderChain()` に rename
- 影響度: P1 / 修正コスト: 4h (chain pattern + breaker + integration test)

### MID-C-07: BM25 score を取り損ねており RRF が「ランキング順位のみ」結合
- search/route.ts:643 で `bm25_top_score = 0.999` を hardcode。PostgREST 経由で ts_rank を直取りできない事への workaround
- 実際の RRF 品質は順位だけで決まる (score-aware ranking は捨てている)
- 結果: 1位と10位がほぼ同等の意味でも、RRF score 差が極端に開く
- search_clicks ベースの LTR (Phase 3) で補える設計だが、Phase 2 ローンチ時の体感品質は劣る
- 推奨: `match_knowledge_v3` RPC に BM25 部分も寄せて (`websearch_to_tsquery(query) <-> tsv` で ts_rank 直返し) score-aware RRF にする
- 影響度: P2 / 修正コスト: 8h (RPC 新設 + integration test + UI breakdown 更新)

### MID-C-08: DEFAULT_ORG_ID `00000000-...-001` の hardcode 蔓延
- ocr.ts:32 / embed.ts:36 / api/search/route.ts:40 など複数箇所で重複
- Phase 2 マルチテナント化時に grep 漏れリスク。`packages/shared/src/constants.ts` に 1 箇所集約すべき
- ARCHITECTURE.md の "Phase2 cutover 手順" で `app.org_id` GUC 強制を謳ってはいるが、コード側の hardcode が残っていると意味なし
- 影響度: P1 / 修正コスト: 1h (constants 集約 + grep 置換)

### LOW-C-09: audit_logs の hash chain が **per-org partition 切替準備** に未着手
- 0027 placeholder と ARCHITECTURE.md の Phase2 cutover 手順は宣言済みだが、`chain_seq SERIAL` カラム追加 migration が未作成
- Phase 2 で 2nd org 投入時に chain が混線するリスク
- 影響度: P2 / 修正コスト: 4h (migration + trigger 改修 + 検証 SQL)

### LOW-C-10: review_status の semantics が「OCR/レビュー」vs「営業ファネル」で別軸
- contacts.review_status (pending_ocr / pending_review / duplicate_suspect / verified / merged) と contacts.status (new / contacted / scheduled / met / closed_won / closed_lost / archived) が二重に共存
- 仕様としては正しい (orthogonal) が、UI/UX 上「verified なのに new」「verified なのに closed_lost」が混在し営業マンが混乱する可能性
- 影響度: P3 / 修正コスト: ヒアリング後

---

## 1 ヶ月以内の最優先 5 件

1. **HIGH-C-01 Storage path/RLS 整合修正** (4h) — 本番アップロード 100% 失敗を止める
2. **HIGH-C-02 contacts 列名 grep 統一 + e2e** (1h + 2h) — meetings 一覧が実 DB に繋がる
3. **HIGH-C-03 録画 + embed consumer 全部 ticker 登録 + 統合テスト** (2h + 4h) — Zoom→検索が一気通貫
4. **MID-C-05 COST_CAPS 再調整 + per-minute 単位追加** (1h + alert閾値) — 長時間商談での止血失敗を防止
5. **e2e (名刺アップ→OCR→重複→マージ + 録画 webhook→検索) 2 本** (8h) — REMAINING_WORK #12 と統合。本番接続前の最終ゲート

---

## 法務・コスト・人材リスク

### 法務 (3 件、Phase 2 ローンチ前に法務監修必須)
- **録画 per-attendee 同意**: 設計書 16_compliance_legal NF-S4-1 で必須化済だが、Zoom webhook → recordings 行作成時に attendee 単位の同意確認なし。Zoom Cloud Recording の "Recording Consent" 機能と同期する Edge Function が未作成。日本の個人情報保護法/GDPR 双方で個別同意原則。**1 ヶ月以内に法務監修 + 実装** (見積 1 週間)
- **OCR PII の AI 学習除外**: Claude (Anthropic) / Google Vision はデフォルトで API リクエストを学習に使わないが、明示的 DPA 締結が望ましい。Anthropic は Business Tier の DPA テンプレあり、Vision は GCP Workspace の Data Processing Addendum 経由。**法務確認のみ** (見積 2h)
- **PIPC 越境移転**: Render (Tokyo region なら OR-AP, Anthropic は US-east) で個人情報越境移転に該当。OAuth トークン (Vault) は Tokyo region 内に留まるが、要約 prompt は Anthropic US-east へ送信。プライバシーポリシーで明示が必要。**確認 + ポリシー更新** (見積 4h)

### コスト (50/100/500人 試算)
- 営業 50 名 × 月 20 商談 × COST_CAPS 改定後 $1.50 = **$1,500/月** (Anthropic + Whisper)
- 名刺 50 × 月 100 枚 × $0.01 = **$50/月**
- 検索 50 × 月 500 query × embed $0.00002 = **$0.5/月** (誤差)
- Supabase Pro ($25) + Render Std×3 ($21) + R2 (50GB×$0.015) = **$46/月 + $0.75/月**
- **合計 50人時 ≈ $1,600/月 (¥240k)** — sales 1人あたり ¥4,800/月
- 100人時: ≈ $3,200/月 / 500人時: ≈ $16,000/月 (R2 が GB 単価で線形増加)
- COST_CAPS 守れば人数比例で予測可能 — kill switch が機能してれば暴走しない設計

### 人材
- 12 agent 並列で書いた結果、**コードの「主」が居ない**状態。新メンバー onboard 時に「なぜこの provider abstraction か」「なぜ DEFAULT_ORG_ID が hardcode か」を問われて答えられる人が居ない
- 推奨: 1 名「テックリード」を立て、**HIGH-C-01〜03 を 1 名で集約修正** → コードベース全体の把握を 1 人に持たせる (見積 1 週間 = 40h)
- 2 週間 onboard ターゲットは現状の構造なら「コア機能だけなら可能」(API routes は zod schema が SSOT で揃っている、provider 抽象もパターン統一されている)。ただし pgmq fallback / RLS Storage path 等の暗黙約束は CLAUDE.md 等の上位ドキュメントに昇格させないと習得困難。

---

## 隠れ debt 一覧 (12 agent 並列の代償)

| # | 種別 | 発生箇所 | 対処 |
|---|---|---|---|
| 1 | 命名分裂 | contacts.full_name vs name | HIGH-C-02 |
| 2 | hardcode 蔓延 | DEFAULT_ORG_ID × 5箇所以上 | MID-C-08 |
| 3 | 配線漏れ | jobs/index.ts に ticker 4個欠落 | HIGH-C-03 |
| 4 | 規約矛盾 | Storage path 規約と RLS | HIGH-C-01 |
| 5 | RPC 逃げ | pgmq.read 直 SQL | HIGH-C-04 |
| 6 | type 抜け | `as unknown as Promise<{data: never}>` (ocr.ts:195 等) | refactor (2h) |
| 7 | dead unused export | recordings-detail.ts で nextActionSchema 等 worker でしか使わず web 側 unused | tree-shake 確認 (1h) |
| 8 | enum 不一致 | meetingStage (shared) vs DemoMeetingStage (web/_lib/fixtures) | adapter を _lib 内に閉じる (1h) |
| 9 | provider stub | GoogleVision / Claude / Whisper / Claude summarize 全部 stub | 実装 (各 4-8h、合計 32h) |
| 10 | テスト粒度 | unit test 28 件はあるが e2e ゼロ | 名刺→OCR→重複→マージ e2e + 録画→検索 e2e (16h) |

---

## ロードマップ整合 (REMAINING_WORK.md vs 実態)

REMAINING_WORK の **#2 T-007〜T-019 実機能ゼロ (12 週)** に対し、12 agent 並列で **scaffold + 部分 wiring** は 1 セッションで完了。実質 6-8 週間相当を圧縮した格好。

ただし以下が REMAINING_WORK と不整合:
- REMAINING_WORK には「provider 抽象 (Mock/Real)」「pgmq consumer 群」が項目に無く、12 agent が "独自判断" で導入。**良い意味で前倒し**だが、上位プランに昇格させて Phase 2 W3 のレビュー対象に乗せるべき
- 残り 12 週から本 review で指摘した HIGH×3 修正 (合計 11h) + MID×3 修正 (合計 13h) + e2e (16h) = **約 40h ≈ 1 週間** を最初に消化、その後 provider 実装 (32h ≈ 1 週間)、合計 **2 週間で Phase 2 W2 着手可能**

---

## 結論

骨格・抽象化・migration はかなり良い水準まで来ている (個別 reviewer が観点別に 95+ つけるのも納得)。
ただし CTO 視点で「いま売れるか」を見ると、HIGH 4 件のうち 3 件が production deploy を blocking する致命傷で、しかも 12 agent 並列の典型的事故 (命名分裂・配線漏れ・規約矛盾) によるもの。**1 週間集中の「整合作業」フェーズ** を Phase 2 W2 着手前に必ず挟むこと。

**最重要 1 件: HIGH-C-01 Storage path/RLS 整合修正** — これが直っていない状態でユーザー招待を始めると、初回名刺アップロード時点で全員が 403 を見ることになる。技術的修正コストは 4h と小さいが、見つかるのが遅いほど復旧不可能な顧客信頼喪失に直結する。
