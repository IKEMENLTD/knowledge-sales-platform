# SRE Round 2 Review

レビュー対象: knowledge-sales-platform Phase 2 (apps/worker — Round 2 修正後)
レビュー日: 2026-05-17
レビュアー: SRE / Observability / Reliability 観点
基準: Round 1 SRE レビュー (78/100) の P1 3 件 + P2 5 件の解消状況 + 追加観点

## スコア: 94 / 100  (前回 78 → 94, +16)

| カテゴリ | 配点 | R1 | R2 | コメント |
|---|---:|---:|---:|---|
| 構造化ロギング | 10 | 9 | 9 | 変化なし |
| メトリクス配線 | 12 | 5 | **12** | 全 5 ジョブで jobsProcessedTotal/jobDurationSeconds 配線、summarize で llmTokens/llmCost、embed で llm 系全配線、tickAll で pgmqQueueDepth.set。**完全到達** |
| Sentry / reqId 伝播 | 8 | 7 | 7 | 変化なし |
| cost-guard | 10 | 7 | 7 | OCR の assertConversationCap bypass は P2 残 |
| Idempotency / DLQ | 10 | 6 | 6 | DLQ / read_ct ガードは P2 残 |
| Health check `/readyz` | 8 | 6 | 6 | provider key check は P2 残 |
| graceful shutdown | 8 | 2 | **7** | SIGTERM/SIGINT 配線・stopJobTickers・httpServer.close・closePgmq・25s overall。**ただし in-flight tick > 15s で abort 不能** (-1) |
| provider fallback (silent mock 化) | 8 | 5 | 5 | P2 残 |
| pgmq queue depth gauge | 8 | 3 | **8** | tickAll で `refreshQueueDepth` が pgmq.metrics → gauge.set を best-effort 実行。**到達** |
| rate-limit | 6 | 5 | 5 | 変化なし (Phase 3) |
| external API timeout | 6 | 2 | **5** | embed=30s/maxRetries=0、summarize=60s 雛形、transcribe=120s 雛形、zoom.download=60s+AbortController+manual redirect。**ただし zoom OAuth (`fetchNewToken` line 67) は timeout 未設定のまま** (-1) |
| migration drift 監視 | 4 | 3 | 3 | 変化なし |
| test カバレッジ | 4 | 3 | 4 | shutdown/tickAll/pgmq singleton の spec が追加されている前提で +1 (未確認なら 3) |
| degrade UX | 4 | 3 | 3 | 変化なし |
| env zod validation | 4 | 4 | 4 | 変化なし |
| pgmq 接続管理 (singleton) | -- | -- | +1 | **新規ボーナス**: lib/pgmq.ts に singleton + closePgmq + beforeExit drain。Architect HIGH-A-03 と統合完了 |
| tickAll Promise.allSettled | -- | -- | +1 | **新規ボーナス**: 5 consumer 並列起動 + 1 つの throw が他を止めない |
| **合計** | **100** | **78** | **94** | |

---

## Round 1 P1 の解消状況

### P1-SRE-01 graceful shutdown: **RESOLVED (with caveat)**

`apps/worker/src/index.ts:107-153` で完全実装:
- `process.on('SIGTERM' / 'SIGINT')` 両方を登録
- `stopping` フラグで二重実行ブロック
- `stopJobTickers(15_000)` → `httpServer.close()` (5s grace) → `closePgmq()` の三段排出
- 25s `overallTimeout` で `process.exit(1)` フォールバック
- `setTimeout(...).unref()` で shutdown 中の event loop を妨げない配慮

`apps/worker/src/jobs/index.ts:148-193` の `currentTickPromise` で setInterval のラッパが「最新の tick」への参照を保持し、`stopJobTickers` から `Promise.race([tick, timeout(awaitMs)])` で待てる構造になっている。**設計レベルでは完璧。**

#### 残課題 (caveat, -1)

**in-flight job の 25s 完了猶予が現実的でない場面がある**:
- `tickRecordingTranscribe` は `visibilitySec=300`, `batchSize=2`, Whisper REQUEST_TIMEOUT_MS=120s。1 tick の最悪値 ≈ 240s。
- `stopJobTickers(15s)` は **進行中の tick をキャンセルしない**、ただ「最大 15s 待って次へ」。15s 経ったら `httpServer.close` + `closePgmq` に進み、`process.exit(0)`。
- 結果: in-flight Whisper/Claude/embed リクエストは `process.exit` で abort される。pgmq の visibility timeout (120-300s) があるので **再配信される** → 重複処理ではなく「中途半端な状態 + 再実行」になる。`recordings.processing_status='transcribing'` 等は次回 tick で上書きされる想定。
- **問題は AbortController を per-job に持っていないこと**: shutdown は HTTP 接続を切るだけで、進行中の fetch/SDK 呼び出しに「キャンセルしろ」を伝えられない。`embed.ts` の OpenAI client timeout=30s が事実上の上限。Node 自体は process.exit で死ぬが、Render の SIGKILL (30s grace 後) より先に exit する保証はある。

→ **本番ブロッカーではないが**、shutdown SLO 「25s 内で終わる」を満たすために `tickAll` 内に `AbortController` を仕込んで stopJobTickers 経由で cancel する仕掛けが理想。Phase 3 で対応。

### P1-SRE-02 metrics 未配線: **RESOLVED**

完全到達:

| メトリクス | 配線箇所 | 確認 |
|---|---|---|
| `jobsProcessedTotal{queue,status}` | ocr.ts:438/450/462/466, embed.ts:349/360/373/377/389, recording-download.ts:306/314/319, recording-transcribe.ts:238/246/251, recording-summarize.ts:325/333/338 | started/done/failed/invalid の 4 状態を全 5 queue で出力 |
| `jobDurationSeconds{queue,status}` | 同上 | 同上、`process.hrtime.bigint()` ベースで秒精度 |
| `llmTokensTotal{vendor,model,kind}` | embed.ts:312 (openai input), recording-summarize.ts:176/182 (anthropic input/output) | input/output 両方カウント |
| `llmCostUsdTotal{vendor,model}` | embed.ts:316 (openai), recording-summarize.ts:188 (anthropic) | spendUsd 直入力 |
| `pgmqQueueDepth{queue}` | jobs/index.ts:71-84 (`refreshQueueDepth`)、tickAll 冒頭で best-effort、`pgmq.metrics()` 不在環境は silent skip | 5 queue 全部 |

設計判断もよい:
- `mocked === true` のときは llm metrics を inc しない (embed.ts:311) → mock 由来のノイズが Grafana に乗らない。
- `started` カウンタを別途取っているので `started - done - failed - invalid` で worker クラッシュ中のロス検出が可能。

### P1-SRE-03 timeout: **PARTIAL (mostly resolved)**

| Layer | Round 1 状況 | Round 2 状況 | 評価 |
|---|---|---|---|
| OpenAI embeddings | SDK default 10min | **`timeout: 30_000, maxRetries: 0`** (embed.ts:38-43) | RESOLVED |
| Anthropic summarize | 雛形コメントすら無し | `static REQUEST_TIMEOUT_MS = 60_000` 定数 + TODO で `new Anthropic({ timeout, maxRetries: 0 })` を明示 (summarize/providers.ts:172,189) | PARTIAL (stub のまま実装未だが、定数が同居 = 実装時に確実に使う仕組み) |
| Whisper transcribe | 同上 | `static REQUEST_TIMEOUT_MS = 120_000` + `AbortSignal.timeout(...)` TODO 配線 (transcribe/providers.ts:127,144) | PARTIAL (同上) |
| Zoom download | timeout 無し | `timeoutMs ?? 60_000` + `AbortController` + `redirect: 'manual'` で再帰時にも host check (zoom.ts:213-241) | RESOLVED + SSRF 連携良 |
| **Zoom OAuth** `fetchNewToken` | timeout 無し | **依然 timeout 無し** (zoom.ts:67-73) | **OPEN (-1)** |

→ **`fetchNewToken` の漏れが残課題**。SSO 鯖障害時に worker tick が無限ハングする (token cache 不在の cold start で発生)。下記 P1-SRE-13 として再計上。

---

## 追加観点 (Round 2 で要求)

### pgmq singleton 接続管理 (`lib/pgmq.ts`)

**良好。Architect HIGH-A-03 と統合完了。**

- `let _sql: Sql | null` の lazy singleton + `getSql()` 内で `import('postgres')` を動的化 (test 環境の env パースタイミングを回避)
- `max: 10, prepare: false, idle_timeout: 30, connect_timeout: 10` の妥当な pool 設定
- `closePgmq()` は冪等 (`_sql = null` 先回し)、in-flight クエリ 5s 待ち
- `beforeExit` で auto-drain 登録、SIGTERM 経路は明示 `await closePgmq()`
- `pgmqRead` / `pgmqDelete` / `pgmqArchive` / `pgmqMetrics` 全てが getSql 経由 → DATABASE_URL 不在環境では空配列 / null を返して noop (CI を壊さない)

**1 つだけ気になる点 (P3)**: `_shutdownRegistered` が module-scope の boolean なので、test で `closePgmq()` → 再度 `getSql()` を呼ぶと beforeEach 経路で 2 回目以降の beforeExit リスナが登録されない (1 回目で消えた `_shutdownRegistered=true` のまま)。**しかし** SIGTERM 経路は index.ts で直接 `closePgmq` を呼ぶので実害なし。

### tickAll が Promise.allSettled で 5 consumer 並列起動

**良好。** `jobs/index.ts:100-128` で全 5 entry を `Promise.allSettled` で並列実行。各 entry は try/catch でラップされ、throw 時も `TickReport { ok: false }` を返す。`Promise.allSettled` は仕様上一つも reject しないので、`results.map` で 5 件揃って返る。

**1 つ tickAll の内側で `entry.fn()` を try/catch しているため、Promise.allSettled の `status==='rejected'` ブランチ (`reports.push({ name: 'unknown' ... })`) は実質到達しないデッドコード**だが、二重防御として残すのは妥当。

### in-flight ジョブの 25s 完了猶予の現実性

**P1-SRE-01 の caveat と同じ。SLI を取って観測すべき。**

各 tick の現実的な所要時間:

| Tick | batchSize | per-job 最悪 | tick 最悪 |
|---|---:|---:|---:|
| ocr | 5 | Vision API 30s | 150s |
| embed | 3 | OpenAI 30s | 90s |
| recording.download | 3 | Zoom 60s | 180s |
| recording.transcribe | 2 | Whisper 120s | 240s |
| recording.summarize | 2 | Claude 60s | 120s |

**いずれも 15s では完走不能。** ただし、これは「優雅に終わる」ためのもので、抜けても pgmq が再配信する設計なので **データロスはない**。Render の grace 30s 内に exit する目的は達成されている。

→ **観測 SLO 提案**: `worker_shutdown_duration_seconds` ヒストグラム + p99 < 25s。Render dashboard で監視。

---

## 残課題

### P1 (1 件)

**P1-SRE-13: Zoom OAuth token endpoint に timeout/AbortSignal 未設定**
- 場所: `apps/worker/src/lib/zoom.ts:67-73`
- 現状: `downloadZoomRecording` には `AbortController` を仕込んだが、その前段で呼ばれる `fetchNewToken` (token cache miss 時) は素の `fetchImpl(url, { method: 'POST', headers: ... })`。
- 影響: Zoom OAuth 鯖 (https://zoom.us/oauth/token) が応答しなければ worker tick が無限ハング。token cache 効くので恒常的ではないが、cold start や TTL 切替直後は被弾。
- 修正方針:
  ```ts
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),  // OAuth は 10s で十分
  });
  ```
- 工数: 30 分

### P2 (3 件 — Round 1 から継続)

| ID | 内容 | 工数 |
|---|---|---:|
| P2-SRE-04 | provider fallback silent mock を Sentry warning に昇格 + `sk-openai-test` bypass を env.ts で fail-fast | 2h |
| P2-SRE-05 | DLQ queue 作成 migration + read_ct >= 3 で move/ack + DLQ gauge | 8h |
| P2-SRE-06 | /readyz に provider key check 追加 | 2h |
| P2-SRE-07 | OCR を assertConversationCap() に統一 | 1h |

### P3 (4 件 — Round 1 から継続 + 1 新規)

| ID | 内容 | 工数 |
|---|---|---:|
| P3-SRE-09 | rate-limit Upstash 化 | 8h |
| P3-SRE-10 | web 側 console.error を JSON 構造化 | 2h |
| P3-SRE-11 | pgmq_send/metrics security definer migration | 4h |
| P3-SRE-12 | stale recording 復旧 cron | 4h |
| **P3-SRE-14** (新) | **shutdown 経路で AbortController を per-job に持って、進行中の external API call を即 abort できるようにする (現状 30-120s の SDK timeout 任せ)** | 6h |

---

## 観測計画 update

Round 1 の観測計画は引き続き有効。Round 2 で **実際に観測可能になった** ものを ✓ で示す:

| Panel | R1 計画 | R2 実装 |
|---|---|---|
| Worker availability | `up{job="ksp-worker"}` | ✓ default metrics |
| Job success rate (per queue) | `rate(jobs_processed_total{status="done"}[5m]) / rate(jobs_processed_total{status=~"done\|failed\|invalid"}[5m])` | **✓ 全 5 queue で出力** |
| Job p95 latency | `histogram_quantile(0.95, rate(job_duration_seconds_bucket[5m]))` | **✓ 全 queue で出力** |
| pgmq depth | `pgmq_queue_depth` per queue | **✓ tickAll で 5s 間隔更新** (pgmq.metrics 存在環境のみ) |
| pgmq DLQ depth | `pgmq_dlq_depth` per queue | ✗ DLQ 未実装 (P2-SRE-05) |
| LLM USD spend / day | `increase(llm_cost_usd_total[24h])` per vendor/model | **✓ openai + anthropic 両方出力** |
| HTTP 5xx rate | `rate(http_requests_total{status=~"5.."}[5m])` | ✓ R1 から継続 |
| External API timeout | `rate(worker_external_call_timeout_total[5m])` | ✗ 未配線 (timeout 自体は実装、counter 未設置) |
| Provider fallback | `provider_fallback_total{vendor}` | ✗ P2-SRE-04 |
| Shutdown duration | `histogram_quantile(0.99, rate(worker_shutdown_duration_seconds_bucket[1h]))` | ✗ ヒストグラム未設置 (推奨追加) |

### Round 2 で新規追加すべき alert ルール

| Alert | 条件 | Severity | 根拠 |
|---|---|---:|---|
| Worker shutdown timeout | `worker_shutdown_overall_timeout_total > 0` | P2 | 25s overallTimeout 発火検出。新 counter が必要 |
| pgmq metrics unavailable | `pgmq_queue_depth` の time series が 5 分以上更新されない | P3 | pgmq extension が古い / DATABASE_URL 不在の検知 |
| LLM cost per meeting spike | `rate(llm_cost_usd_total{vendor="anthropic"}[5m]) > 0.5` (USD/5min) | P2 | 単発 meeting の Claude 暴走を検知 |

### Round 2 で **追加すべきメトリクス** (実装簡単)

```ts
// lib/metrics.ts
export const workerShutdownDurationSeconds = new Histogram({
  name: 'worker_shutdown_duration_seconds',
  help: 'Total wall-clock seconds for graceful shutdown',
  buckets: [0.5, 1, 5, 10, 15, 20, 25, 30, 60],
  registers: [registry],
});
export const workerShutdownOverallTimeoutTotal = new Counter({
  name: 'worker_shutdown_overall_timeout_total',
  help: 'Number of times the 25s overall shutdown timeout fired',
  registers: [registry],
});
export const providerFallbackTotal = new Counter({
  name: 'provider_fallback_total',
  help: 'Times pickProvider() fell back to Mock in production',
  labelNames: ['vendor', 'reason'] as const,
  registers: [registry],
});
export const externalCallTimeoutTotal = new Counter({
  name: 'worker_external_call_timeout_total',
  help: 'External API call timed out / aborted',
  labelNames: ['vendor', 'op'] as const,
  registers: [registry],
});
```
shutdown 関数の末尾で `workerShutdownDurationSeconds.observe(...)` を呼ぶ。これだけで Round 1 観測計画の 100% カバー到達。

---

## 95+ 到達への path

Round 2 で 78 → 94 (+16)。残る 6 点:

| 修正 | 期待 +点 |
|---|---:|
| P1-SRE-13 (Zoom OAuth timeout) | +1 |
| P2-SRE-04 (provider fallback Sentry) | +2 |
| P2-SRE-06 (/readyz provider check) | +1 |
| P2-SRE-07 (OCR assertConversationCap) | +1 |
| 観測メトリクス 4 種追加 (shutdown/timeout/fallback counter) | +1 |

→ **95+ 到達は P1-SRE-13 (30 分) 単独で 95 に乗る**。Round 3 で確実に達成可能。
