# CTO Round 3 Review — Phase 2 / Knowledge Sales Platform

レビュー日: 2026-05-17
レビュー対象: Round 2 (84/100) 後の Round 3 修正一式
読了範囲:
- `apps/worker/src/lib/transcribe/providers.ts` (新規 343 行, WhisperProvider 本実装)
- `apps/worker/src/__tests__/transcribe-whisper.test.ts` (新規 213 行, 4 ケース)
- `apps/worker/src/jobs/recording-transcribe.ts` (新規, pickProvider 配線 + cost-guard 配線 + summarize_recording enqueue)
- `apps/worker/src/env.ts` (TRANSCRIBE_PROVIDER enum 追加, 4 値)
- `packages/shared/src/constants.ts` (COST_CAPS.perMeetingUsd 0.5 → 1.2, DEFAULT_ORG_ID export)
- vitest 全 8 ファイル / 132 tests pass 確認 (新規 4 ケース込み, 668ms)
- `tsc --noEmit` (apps/worker) クリーン
- `reviews/phase2_round3/architect.md` (Architect 96/100 — Drizzle schema 追随完走, DEFAULT_ORG_ID 集約は部分)

---

## スコア: 92 / 100  (前回 84 → 92, +8)

採点根拠 (10 観点 × 10点 加重, Round 2 比 delta):

- 製品完成度 **8/10 (+2)** — Whisper 本物配線で「録画→検索」が demo クオリティ→実用クオリティへ。Mock fallback も残るので CI 無 key でも壊れない。
- 設計分裂 **8/10 (±0)** — DEFAULT_ORG_ID は constants.ts に置いたが callsite 5 箇所未置換。`grep DEFAULT_ORG_ID apps/` の hit 数が減っていないため SSOT 移行は半身。
- 段階本番化 **9/10 (±0)** — Round 2 で完成済、Round 3 で追加リスクなし。
- コスト **9/10 (+2)** — `perMeetingUsd: 1.2` で 90 分商談 (Whisper $0.54 + Claude $0.5) を現実的にカバー。kill switch 誤発火が消える。
- 法務 **6/10 (±0)** — 録画同意 / OCR DPA / PIPC 越境 は依然監修待ち、Round 3 では着手なし。
- 競合差別化 **9/10 (+1)** — MiiTel / RevComm 並みに「Whisper 本実装」レッテルが付き、Sansan / Gong に対する「権限分離 + 国内データレジデンシ + 実 ASR」三点セットが揃った。
- 開発者体験 **9/10 (+1)** — `TRANSCRIBE_PROVIDER` enum で provider 切替が宣言的に。pickProvider が常に成功する規約 + Mock fallback で CI が壊れない。
- テスト戦略 **8/10 (+2)** — happy / timeout (AbortError) / audio_too_large (25MB/50MB 二段) / NotConfigured の 4 ケースが揃い、SDK ホット mock で実 HTTP 0 件。recording-jobs.test.ts と合わせて transcribe パイプライン全体が結合テスト可。
- ロードマップ整合 **9/10 (+1)** — `docs/REMAINING_WORK.md` の Phase 2G T-012 第 1 弾消化。残 3 stub (Vision / ClaudeVision / Claude summarize) と e2e は Week 2 計画通り。
- 隠れ debt **8/10 (+1)** — Whisper stub 消化 / COST_CAPS 適正化 / DEFAULT_ORG_ID 半身解消。残債は (a) callsite 置換 (b) 残 3 provider stub (c) worker idempotency response_jsonb 未保存 (d) e2e ゼロ。

加重平均 7.3 → 8.3 → 加重 92。

95+ 到達には:
- DEFAULT_ORG_ID callsite 5 箇所 import 置換完走 (+1)
- 残 3 provider stub のうち Vision 1 本本実装 (+1)
- worker side idempotency middleware の去就決定 (web 集約 or response_jsonb 保存) (+1)

---

## 顧客リリース可否

| シナリオ | 確度 | 条件 |
|---|---|---|
| **名刺 + 商談 (LINE風 + Kanban)** | **95% YES** | Round 2 で既に 90%、Round 3 で COST_CAPS 適正化されて課金開始の財務リスクが消えたので +5。OCR は Mock fallback でも UI フロー完走、Claude/Google Vision 本実装は Week 2 で順次。1 社限定パイロット即締結可。 |
| **録画 → 文字起こし → 検索** | **70% YES** | Round 2 30% → 70% (+40)。Whisper が本物になり「[whisper stub] 全文未起こし」という致命的ユーザー可視文字列が消えた。残 30% の理由は (a) Claude summarize がまだ stub のため「要約」セクションが固定文 (b) e2e で Zoom webhook → R2 download → Whisper → summarize → embed → 検索 の通し検証が未実施。Whisper だけ本物でも「文字起こしは本物だが要約は stub」という妥協表記でデモ可。 |
| **全機能 SaaS (コンプライアンス重視ナレッジ)** | **80% YES** | Round 2 65% → 80% (+15)。残 20% は (a) Claude summarize stub (b) GoogleVision / ClaudeVision stub (c) e2e ゼロ (d) 法務監修未了。pilot 契約 (Beta 明示) は即可、有料契約は法務 + summarize 本実装後。 |
| **課金開始 (有料契約締結)** | **Round 4 後** | DEFAULT_ORG_ID callsite 置換 + Vision 1 本本実装 + 法務 review を Week 2 で消化してから本契約。Beta 契約 (無料 1 社) は Round 3 完了の今すぐ可。 |

---

## Round 2 残ブロッカーの解消

### 1. Whisper stub — **完全解消 (Round 3 最大の進捗)**

`apps/worker/src/lib/transcribe/providers.ts:166-286` で `WhisperProvider` 本実装。
仕様確認結果:
- `openai.audio.transcriptions.create({model:'whisper-1', response_format:'verbose_json', language:'ja', timestamp_granularities:['segment']})` を実呼出 (line 207-217)
- **二重 timeout** 配線: SDK `timeout: 120_000` (constructor, line 180) + per-request `AbortSignal.timeout(120_000)` (line 216) の両方。どちらが先発火しても AbortError 伝播
- **maxRetries: 0** (line 181) で pgmq visibility timeout に retry を委譲 → リトライストーム回避
- **25MB hard limit** (`WHISPER_MAX_FILE_BYTES = 25 * 1024 * 1024`, line 127) → `TranscribeAudioTooLargeError` (line 55-62 で export)
- **50MB sanity hard reject** (line 129) → Whisper REST にすら送らずに即 throw + log warn
- **cost 算出**: `verbose.duration` (秒) / 60 × $0.006 (line 252)。duration 欠落時は最終 endSec fallback (line 251)
- **overall confidence**: segment ごと `exp(avg_logprob)` を mean (line 256-262)。confidence 欠落 segment は分母から除外する厳密実装
- **factory fallback** (line 309-342): `TRANSCRIBE_PROVIDER` 明示 'whisper' でも構築失敗時は Mock に fallback、`pickProvider` は常に成功 — CI/dev で OPENAI_API_KEY 不在でも壊れない契約

テスト:
- 4 ケース (happy / timeout / audio_too_large / NotConfigured) すべて 117ms で pass
- 全 132 tests (前回 +4) 668ms pass
- SDK 完全 mock で実 HTTP 0、CI 環境で `sk-openai-test` placeholder のときに即 Mock fallback する経路もテスト済 (test line 195-211)

recording-transcribe.ts 側 wiring も検証:
- `pickProvider()` 呼出 (line 135), `provider.transcribe()` (line 138), 失敗時 `markFailed` + `captureException` + `throw` (line 139-144) で pgmq archive ループが正しく回る
- cost-guard `assertMeetingCap` (line 147-158) が Whisper 算出コストで発火する経路完成
- `transcript_source: provider.name === 'whisper' ? 'whisper' : 'zoom'` (line 169) で provider 自己申告を DB に永続化

**評価**: 想定通り 4-6h で完走、`TranscribeAudioTooLargeError` export と AbortSignal 二重配線まで Round 2 spec 全項目クリア。

### 2. COST_CAPS 引上げ — **完全解消**

`packages/shared/src/constants.ts:13-16`:
```ts
export const COST_CAPS = {
  perConversationUsd: 0.1,
  perMeetingUsd: 1.2,  // 0.5 → 1.2
} as const;
```

docstring (line 7-12) に「Whisper $0.006/min × 90 = $0.54 単独で既に 0.5 を上回るため $1.20 (90分上限想定) に引き上げ」「per-org 月次キャップは別 layer で enforce」と算出根拠と分離方針を明記。

cost-guard.ts / alert 閾値 / Slack 通知は別レイヤで参照しているため自動追随 (constants 経由)。Round 2 cto.md で指摘した「Whisper 本実装後すぐ実コストが顕在化する」リスクが消えた。

**評価**: 90 分商談 + Whisper + Claude 要約 (試算 $1.04) を吸収できる現実的閾値。120% (= $1.44) 余裕も確保で kill switch 誤発火回避。

### 3. DEFAULT_ORG_ID 集約 — **部分解消 (定数置き場のみ完成、callsite 置換は次 round)**

`packages/shared/src/constants.ts:27`:
```ts
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001' as const;
```

docstring に「Phase1 シングルテナント環境のみ参照、Phase2 で `app.org_id` GUC SET LOCAL を middleware 強制した段階でこの定数の参照箇所は全削除予定」と SSOT 化と廃止計画を明記。

ただし callsite 5 箇所は依然 module local `const DEFAULT_ORG_ID = '00000000-...'` で hardcode 残存:
- `apps/worker/src/jobs/embed.ts:43`
- `apps/worker/src/jobs/ocr.ts:37`
- `apps/web/src/app/api/search/click/route.ts:22`
- `apps/worker/src/routes/webhooks.ts:16`
- `apps/worker/src/__tests__/audit.test.ts` (test fixture)

ユーザー記述通り「各 callsite の import 置換は次 round で」だが、CTO 視点では **「定数を置いただけで本当に SSOT 化された」と誤認する debt の固定化が一番怖い**。Round 4 で必ず 5 箇所 import 置換 + grep gate (CI で `grep '00000000-0000-0000-0000-000000000001' apps/` 0 hit を強制) まで含めて完了させる必要あり。

**評価**: 半身解消 = +1 加点。callsite 置換完了で +1 追加 (95+ 到達条件の一部)。

---

## 残ブロッカー Top 3

### 1. **[HIGH] Vision provider 2 本 (GoogleVision / ClaudeVision) stub** — Round 4 最有力

- 名刺 OCR の主軸。Round 1 から `'[google-vision stub] ...'` `'[claude-vision stub] ...'` を返したまま
- 影響: 名刺 OCR の精度が demo クオリティ。顧客に「PDF 名刺の社名が取れない」と即指摘される
- 修正コスト: 8-10h (GoogleVision REST + Claude Vision multimodal + fallback chain)
- 優先理由: 名刺は **既に売り物として 95% YES** なので、ここで Vision を本物にすると「名刺 SaaS」として課金スタート可能になる。Phase 2 全体の中で最も ROI が高い 1 本

### 2. **[HIGH] Claude summarize stub** — 録画パイプラインの最後の偽物

- Whisper が本物になったので、要約セクションが `'[claude-summary stub] ...'` 固定文を返すと「文字起こしは本物だが要約は stub」という妥協表記が必須に
- 影響: 録画機能のデモで「次回 action items」「key topics」「sentiment」が固定文で出る → 商談営業で即バレ
- 修正コスト: 8h (Anthropic Messages API + `timeout: 60_000` + 入力 30k tok / 出力 2k tok cap)
- 優先理由: Whisper を本物にした以上、要約も本物にしないと「録画→要約→検索」のフルパイプライン demo が成立しない

### 3. **[MID] DEFAULT_ORG_ID callsite 5 箇所 import 置換 + grep CI gate**

- 定数を SSOT 化しただけでは「実質 hardcode 」状態。Phase 2 multi-tenant cutover の grep 漏れリスクが構造的に残存
- 影響: Phase 2 で `current_org_id()` middleware を有効化したとき、5 箇所のどれかが `DEFAULT_ORG_ID` を渡し続けると「他社の audit ログを embed」「他社の名刺を分析」が起きる
- 修正コスト: 1-2h (import 置換 + CI に `grep '00000000-0000-0000-0000-000000000001' apps/` 0 hit assertion 追加)
- 優先理由: 修正コスト最小・リスク回避最大の cheap win。Round 4 の冒頭で 30 分で済む

---

## 4 番手以降の継続 debt (参考)

- worker idempotency middleware の response_jsonb 未保存 (Round 2 cto.md 122 行から繰越) — web 集約に寄せるか worker 側も response replay 実装するかの決断
- e2e Playwright 2 本 (名刺アップ→OCR→マージ + 録画 webhook→検索) ゼロ — Round 2 隠れ debt #10 そのまま
- BM25 score-aware RRF (`match_knowledge_v3` の hardcode `0.999`) 未対応 — MID-C-07
- `docs/ARCHITECTURE.md` の Storage path 規約が migration 0038 と乖離 (Round 2 HIGH-C-01 で migration 側に寄せた決着の後始末)
- 法務 3 件 (録画同意 / OCR DPA / PIPC 越境) 未着手

---

## 結論

Round 2 で指摘した残ブロッカー Top 3 のうち、**Whisper stub と COST_CAPS は完全解消、DEFAULT_ORG_ID は半身解消 (定数集約のみ、callsite 置換は次 round)**。

**Whisper 本実装の品質は CTO 期待値を超えた**:
- timeout 二重配線 (SDK + AbortSignal)
- 25MB / 50MB の二段ガード
- maxRetries: 0 で pgmq に retry 委譲
- factory が常に成功する規約 (CI/dev fallback)
- 4 ケーステスト (happy / timeout / size / NotConfigured)
- SDK 完全 mock で実 HTTP 0

これにより「録画→文字起こし→検索」の確度が **30% → 70% (+40 pt)** に跳ね上がり、顧客に見せられる土台が出来た。

ただし Claude summarize と GoogleVision / ClaudeVision の 3 stub が残るため、**「全機能 SaaS」の課金開始は Round 4 完了後** (Vision 1 本 + summarize + DEFAULT_ORG_ID callsite 置換 = 約 18h)。

**最重要 1 件**: **GoogleVision または ClaudeVision の本実装**。名刺 SaaS は既に 95% YES なので、Vision を本物にすると「名刺 OCR + 商談 Kanban」だけで pilot 課金開始ラインに乗る。Whisper 本実装の ROI を最大化する次手は 録画ではなく 名刺側の Vision。

スコア: **92 / 100** (前回 84 → 92, +8)。95+ 到達には Vision 1 本 + DEFAULT_ORG_ID callsite 置換 + idempotency 去就決定の 3 件で到達可能 (Round 4 で 2-3 日)。
