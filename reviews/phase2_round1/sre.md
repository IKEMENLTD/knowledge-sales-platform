# SRE Round 1 Review

レビュー対象: knowledge-sales-platform Phase 2 (apps/web + apps/worker)
レビュー日: 2026-05-17
レビュアー: SRE / Observability / Reliability 観点

## スコア: 78 / 100

| カテゴリ | 配点 | 評価 | 内訳 |
|---|---:|---:|---|
| 構造化ロギング (worker pino / web JSON) | 10 | 9 | worker 完全 pino。web は console JSON で許容範囲だが children/reqId 伝播なし |
| メトリクス (prom-client 配線) | 12 | 5 | レジストリは整備済だが **jobs_processed_total / job_duration_seconds / llm_* counter が job pipeline で一度もインクリメントされていない** (metrics.ts 以外で参照 0 件) |
| Sentry / breadcrumb / reqId 伝播 | 8 | 7 | reqId middleware OK。web → worker 跨ぎは webhook 経路のみ |
| cost-guard (per-conv / per-meeting cap) | 10 | 7 | transcribe/summarize/embed で assertMeetingCap 配線済。OCR は `COST_CAPS.perConversationUsd` を直接比較しているが **assertConversationCap() を経由していない** (Sentry 通知が漏れる) |
| Idempotency / DLQ | 10 | 6 | jobs_inflight + pgmq visibility timeout で再配信。**DLQ なし / max_attempts=read_ct ガードなし** で永久リトライが残る |
| Health check (/readyz) | 8 | 6 | DB / pgmq / R2 / Sentry をチェック。**Anthropic / OpenAI / Zoom 鍵の有無を反映していない** |
| graceful shutdown | 8 | 2 | **SIGTERM/SIGINT ハンドラなし**。`stopJobTickers()` は export されているが index.ts で `process.on('SIGTERM', ...)` の登録なし。in-flight job 中に Render が SIGTERM → SIGKILL すると pgmq visibility expire まで重複処理に晒される |
| provider fallback (silent mock 化) | 8 | 5 | env キー不在で Mock に自動 fallback するが **`info` レベルで「no API keys present」と書くだけ**。本番で API key が落ちると静かに mock 化して気付けない。`SENTRY_DSN` 設定下なら captureMessage('warning') すべき |
| キュー深さ alert (pgmq_queue_depth) | 8 | 3 | `pgmqQueueDepth` gauge は定義済だが **どこからも `.set()` されていない**。tickAll 内で `pgmq_metrics` を呼んで gauge を更新するロジック不在 |
| rate-limit | 6 | 5 | web は per-IP middleware + per-user defineRoute、worker は per-IP token bucket。in-memory のためマルチ dyno で揺れる (Phase1 では許容) |
| timeout (external API call) | 6 | 2 | **Zoom OAuth / download / OpenAI SDK / Anthropic SDK 全て timeout 未指定**。`fetch()` に AbortSignal なし。Whisper や Vision の hung connection で worker が無限ブロック |
| migration drift 監視 | 4 | 3 | scaffold 段階で checksum 監視はない (BEADS で別 issue 化前提) |
| test カバレッジ | 4 | 3 | worker は audit/dedupe/idempotency/normalize/recording-jobs/zoom-webhook の6 spec。**embed / ocr / cost-guard 単体 spec 欠落** |
| degrade UX | 4 | 3 | demo フラグで search 結果が空でも UI 側に signal を伝える設計は良。recordings の processing_status='failed' は UI 表示確認できず |
| env zod validation | 4 | 4 | web/worker とも zod schema 化。`requiredInProd` で fail-fast OK |
| **合計** | **100** | **78** | |

## 強み
- worker の pino 統一 + request-scoped child logger (`reqId` / `op` / `recordingId` を毎回 bind) は規模に対して非常に綺麗。
- `apps/worker/src/index.ts` の reqId middleware が notFound/onError 経路でも `x-request-id` を書き戻す配慮あり。
- `lib/zoom.ts` の token cache が `fetchingPromise` を共有して thundering herd を防いでいる。
- `processBusinessCardPayload.safeParse` 失敗時にスキーマ不正は ack して queue から落とす設計 (再試行しても直らない物を DLQ 代わりに drop) は妥当。
- `idempotency-key` middleware の `request_hash` ベース 409 conflict は教科書通り。
- `env.ts` で `requiredInProd` を一つの helper にまとめており fail-fast / dev-friendly のバランス良。

## SLO / SLI / Toil 観点の問題

### P1 (即修正 — 本番投入前ブロッカー)

**P1-SRE-01: graceful shutdown が未実装で SIGTERM 中に重複処理 / 中途半端なジョブが残る**
- 場所: `apps/worker/src/index.ts:86` (startJobTickers 呼出後に SIGTERM ハンドラなし)
- 現状: `process.on('SIGTERM'/'SIGINT', ...)` が無い。Render は deploy のたびに SIGTERM → 30s → SIGKILL を送る。setInterval は止まらず、tickAll 進行中に kill されると:
  - pgmq の `vt` 内なので msg は visibility expire 後に再配信される (一見冪等)
  - しかし `jobs_inflight` 行は残り、`acquireInflight` が `unique_violation` を返し続けて次の worker が **永久に skip** する (TTL `expires_at` まで 2 分)
  - また `recordings.processing_status='downloading'` のまま放置されて UI 上「処理中」が永続化する
- 修正方針:
  ```ts
  // apps/worker/src/index.ts
  const server = serve({ fetch: app.fetch, port: env.PORT }, ...);
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown initiated');
    stopJobTickers();                // setInterval 解除
    await new Promise<void>((r) => server.close(() => r()));
    // pgmq に visibility を即時返却する RPC があれば併用
    await new Promise((r) => setTimeout(r, 2000)); // in-flight tick 完了待ち
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  ```
- `tickOcr`/`tickEmbed` の inFlightTick boolean を `await` できる Promise に変えて shutdown が「in-flight tick の決着まで待つ」ようにする。
- 計測: `worker_shutdown_duration_seconds` を histogram で取り、Render の 30s grace 内に収まるか SLI 化。

**P1-SRE-02: 主要メトリクスが定義だけで一度も更新されていない (dashboard 完全に空)**
- 場所: `apps/worker/src/lib/metrics.ts` で `jobsProcessedTotal` / `jobDurationSeconds` / `pgmqQueueDepth` / `llmTokensTotal` / `llmCostUsdTotal` を export しているが、Grep の結果 **`metrics.ts` 以外のファイルから一度も import されていない**。
- 影響:
  - Prometheus を仕込んでも `/metrics` には `http_requests_total` と Node default metrics しか出ない
  - SLI/SLO ダッシュボード ("ジョブ成功率 > 99% / p95 < 30s" 等) が観測不能
  - LLM コスト暴走 (REVIRALL の Meta ¥1.2M 事案の再来) を Grafana で検知できない
- 修正方針:
  ```ts
  // jobs/ocr.ts tickOcr / processOcrJob
  const t = jobDurationSeconds.startTimer({ queue: 'process_business_card', status: 'unknown' });
  try {
    const r = await processOcrJob(...);
    jobsProcessedTotal.inc({ queue: 'process_business_card', status: r.ok ? 'ok' : 'fail' });
    t({ status: r.ok ? 'ok' : 'fail' });
  } catch (e) {
    jobsProcessedTotal.inc({ queue: 'process_business_card', status: 'exception' });
    t({ status: 'exception' });
  }
  // jobs/embed.ts processEmbedJob 完了時
  llmTokensTotal.inc({ vendor: 'openai', model: 'text-embedding-3-small', kind: 'input' }, embed.totalTokens);
  llmCostUsdTotal.inc({ vendor: 'openai', model: 'text-embedding-3-small' }, embed.spendUsd);
  // tickAll 内で pgmq_metrics RPC → pgmqQueueDepth.set({ queue }, depth)
  ```
- 観測ダッシュボード追加 (下記 観測計画 参照)。

**P1-SRE-03: 外部 API 呼び出しに timeout 未設定 → worker hang リスク**
- 場所:
  - `lib/zoom.ts:67` `fetchImpl(url, { method: 'POST', headers: ... })` 全リクエストに AbortSignal なし
  - `lib/zoom.ts:140` `downloadZoomRecording` も同様 (録画ダウンロードは長時間化しうるが、それでも 10 分 cap は必要)
  - `lib/embed.ts:96` OpenAI SDK default timeout は 10 分。50 件 batch × 過負荷時に worker tick が詰まる
  - `lib/summarize/providers.ts` Claude SDK も同様 (将来実装) — 雛形コメントには timeout 言及なし
- 修正方針:
  - すべての `fetch` を `fetch(url, { signal: AbortSignal.timeout(30_000) })` でラップ (Zoom OAuth: 5s, Zoom download: 600s)
  - OpenAI SDK は `new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 })` (retry は自前 1 回で実装済なので SDK 側を切る)
  - Anthropic SDK は実装時 `timeout: 120_000` を必須に
  - timeout 発火を `worker_external_call_timeout_total{vendor}` counter で観測

### P2 (本番投入後 1 sprint 以内)

**P2-SRE-04: provider fallback が silent mock 化、本番で API key が落ちても気付けない**
- 場所: `lib/ocr/providers.ts:244`, `lib/transcribe/providers.ts:214`, `lib/summarize/providers.ts:261`
- 現状: `pickProvider()` が API key 不在を `log.info('no API keys present; using MockTranscribeProvider')` で済ませている。`info` は production の `level: 'info'` で出るが、Grafana alert ルールに繋がっていない (現状 alert ルール自体が無いので発火不能)。
- 影響: 本番デプロイ時に `OPENAI_API_KEY` を env から消し忘れる/rotation 失敗で 24h mock vector が DB に積まれると、検索結果がすべて mock embedding になり「検索が壊れた」障害になる。env.ts の `requiredInProd` で fail-fast されるはずだが、`sk-openai-test` のような test prefix で抜けられる (#206 `!openaiKey.startsWith('sk-openai-test')`)。
- 修正方針:
  - `NODE_ENV=production` 下では `pickProvider()` で mock fallback したら `captureMessage('PROVIDER_FALLBACK_TO_MOCK', 'error')` + `logger.error`
  - `provider_fallback_total{vendor,reason}` counter
  - Sentry alert ルール: `event.message:PROVIDER_FALLBACK_TO_MOCK` → Slack 即時通知
  - `test` prefix の抜け道は env.ts で `NODE_ENV=production && OPENAI_API_KEY.startsWith('sk-openai-test')` で fail-fast

**P2-SRE-05: DLQ / max_attempts ガードなしで poison message が永久リトライ**
- 場所: `jobs/ocr.ts:496-506`, `jobs/embed.ts:380-405`
- 現状:
  - schema 不正 → ack して drop (OK)
  - 業務エラー (image_missing/db_update_failed/exception) → ack せず → visibility timeout で再配信 → 無限ループ
  - `PgmqRow.read_ct` を使えば「3 回失敗したら DLQ queue に move して ack」が出来るが未使用
  - cost_cap exceeded は embed.ts では ack するが ocr.ts では ack していない (`return { ok: false, reason: 'cost_cap_exceeded' }` のあと ack 経路に入らない)
- 修正方針:
  - `process_business_card_dlq` / `generate_embeddings_dlq` / `transcribe_recording_dlq` の 3 キューを migration で作成
  - `if (row.read_ct >= 3) { await pgmqSend(`${QUEUE}_dlq`, row.message); await pgmqDelete(row.msg_id); }`
  - DLQ 深さ gauge `pgmq_dlq_depth{queue}` を 5 分おきに更新 → 1 件でも積まれたら Slack alert
  - OCR の `cost_cap_exceeded` は ack 側に倒す (再試行しても同じコストなので意味なし)

**P2-SRE-06: /readyz が外部 provider key を反映していない**
- 場所: `routes/health.ts:109-121`
- 現状: db / pgmq / r2 / sentry のみ。Anthropic / OpenAI / Zoom 鍵の存在チェックなし。Render の readiness は 200/503 で trafic 流入を制御するが、provider 鍵が落ちていてもエンドポイントは ready を返してしまう。
- 修正方針:
  ```ts
  function checkProviders(): Record<string, CheckStatus> {
    return {
      openai:    env.OPENAI_API_KEY    ? 'ok' : 'skipped',
      anthropic: env.ANTHROPIC_API_KEY ? 'ok' : 'skipped',
      zoom:     (env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET) ? 'ok' : 'skipped',
    };
  }
  ```
  - `skipped` を `degraded` 扱いするかは env 別で `REQUIRED_PROVIDERS` を環境変数化
  - production 下で `skipped` があれば 503 を返す

**P2-SRE-07: OCR cost-guard が assertConversationCap() を bypass、Sentry 警告が出ない**
- 場所: `jobs/ocr.ts:289-298`
- 現状: `if (spend > COST_CAPS.perConversationUsd) { log.warn(...); markPendingReview(); return ... }` — `lib/cost-guard.ts` の `assertConversationCap` は呼ばれず、Sentry captureMessage も走らない。embed/transcribe/summarize は `assertMeetingCap` 経由で Sentry 通知が出る一方、OCR だけ静かに失敗する。
- 修正方針: `assertConversationCap({ meetingId: 'ocr', conversationId: payload.contactId, spendUsd: spend })` に統一。throw を catch して ack/DLQ 判定。

**P2-SRE-08: `startJobTickers()` で OCR しか起動されていない (recording 系 / embed 系の tick が呼ばれていない)**
- 場所: `jobs/index.ts:38` (tickAll が tickOcr のみ呼ぶ)
- 現状: `// TODO(Phase2B): tickRecording / tickEmbeddings を同じ shape で追加する。`
- 影響: 録画パイプライン (`process_recording` / `transcribe_recording` / `summarize_recording` / `generate_embeddings`) は webhook + 手動 enqueue されるが、consumer が動いていないため Phase2 主要機能が一切回らない。
- 修正方針: `tickEmbed` (embed.ts に既存) を tickAll に追加。`tickRecordingDownload`/`tickRecordingTranscribe`/`tickRecordingSummarize` を新規 wrapper として ocr.ts と同形で書く。

### P3 (Phase 3 までに対応)

**P3-SRE-09: rate-limit が in-memory で multi-instance で揺れる** → Render Standard 1 dyno のうちは OK だが、Upstash Redis 移行プラン (lib/rate-limit.ts の docstring) を BEADS に切り出す。

**P3-SRE-10: web 側 `console.error` が pino 互換 JSON でない** → `defineRoute` の catch で `console.error('[defineRoute] unhandled error', err)` は Render log の parse が崩れる。最低限 `console.error(JSON.stringify({level:'error', component, err: err.message, stack}))` に揃える。`api/search/route.ts` の `logEvent()` は良い手本。

**P3-SRE-11: pgmq RPC `pgmq_send` / `pgmq_metrics` が migration 不在で常時 fallback** → `lib/pgmq.ts` / `routes/health.ts` が PGRST202 catch して fallback or skipped 扱いしている。migration 0010_pgmq_rpc.sql のような形で security definer 関数を作って fallback 経路を削除すべき。

**P3-SRE-12: `recordings.processing_status='downloading'` 等の長時間停滞検出がない** → cron job 不在。`UPDATE recordings SET processing_status='failed', processing_error='stale' WHERE processing_status IN ('downloading','transcribing','analyzing','embedding') AND updated_at < now() - interval '30 min'` を 5 分おき。

## 観測計画

### ダッシュボード追加 (Grafana, Prometheus scrape target = worker `/metrics`)

| Panel | 数式 | SLO |
|---|---|---|
| Worker availability | `up{job="ksp-worker"}` | 99.5% |
| Job success rate (OCR) | `rate(jobs_processed_total{queue="process_business_card",status="ok"}[5m]) / rate(jobs_processed_total{queue="process_business_card"}[5m])` | ≥ 99% |
| Job p95 latency | `histogram_quantile(0.95, rate(job_duration_seconds_bucket[5m]))` | ≤ 30s (OCR), ≤ 300s (transcribe) |
| pgmq depth | `pgmq_queue_depth` per queue | < 100 |
| pgmq DLQ depth | `pgmq_dlq_depth` per queue | 0 (any → alert) |
| LLM USD spend / day | `increase(llm_cost_usd_total[24h])` per vendor/model | < $50/day |
| HTTP 5xx rate | `rate(http_requests_total{status=~"5.."}[5m])` | < 1% |
| External API timeout | `rate(worker_external_call_timeout_total[5m])` | < 0.1/s |
| Provider fallback (silent mock 化) | `provider_fallback_total{vendor}` | 0 in prod |
| Shutdown duration | `histogram_quantile(0.99, rate(worker_shutdown_duration_seconds_bucket[1h]))` | ≤ 25s (Render grace 30s 内) |

### Alert ルール (Sentry / Grafana / Slack `#ksp-alerts`)

| Alert | 条件 | Severity | 対応 SOP |
|---|---|---:|---|
| Worker down | `up{job="ksp-worker"} == 0` for 1m | P1 | Render dashboard で再起動、健康確認 |
| Job failure spike | `rate(jobs_processed_total{status!="ok"}[5m]) > 0.1` | P2 | Sentry の最近の error / DLQ を確認 |
| pgmq depth high | `pgmq_queue_depth > 200` for 10m | P2 | worker concurrency 増 or batchSize 増 |
| DLQ not empty | `pgmq_dlq_depth > 0` for 5m | P1 | DLQ の payload を確認、reprocess or drop |
| LLM cost cap warning | `increase(llm_cost_usd_total[1h]) > 5` | P2 | 単発 meeting 暴走の可能性、recording-summarize の log 確認 |
| LLM cost cap critical | `CONVERSATION_COST_CAP_EXCEEDED` event in Sentry | P1 | cost-guard 発火、meeting_id から問題 user/recording を特定 |
| Provider fallback in prod | `provider_fallback_total > 0` | P1 | API key rotation 失敗 / env 設定漏れ。secret 確認 |
| External API timeout spike | `rate(worker_external_call_timeout_total[5m]) > 0.5/s` | P2 | provider status page 確認 (OpenAI/Anthropic/Zoom) |
| readyz failing | `probe_http_status_code{instance="/readyz"} != 200` for 3m | P1 | 503 の checks フィールドを確認 |

### Log-based SLI (Vercel / Render log → Loki)

- search latency p95: `event:search_ok` の `durationMs` field を histogram 化 → SLO 1s
- embedding mock 検知: `event:search_ok AND embeddingMocked:true AND env:production` → 0 件 SLO
- recording pipeline 完走率: `op:recording.summarize AND msg:"recording.summarize completed"` 件数 / `op:recording.download AND msg:"recording.download completed"` 件数 → ≥ 95%

### 監査 / 月次レビュー

- P1.5 で `lib/cost-guard.ts` の TODO (Slack 直送) を実装。`SLACK_ALERT_WEBHOOK_URL` 経由 (env 既に定義済)。
- ジョブ p95 / DLQ 深さは週次レポート (Looker Studio) に集約。
- migration drift: `schema_migrations` checksum を `bd review --migration-drift` で月次比較する PR ジョブ。

## 修正方針 (優先度順 / 実装工数概算)

| # | 内容 | 工数 | 担当 |
|---|---|---:|---|
| P1-SRE-01 | SIGTERM ハンドラ + stopJobTickers + in-flight 待ち + server.close | 4h | worker |
| P1-SRE-02 | 4 job (ocr/embed/recording-*) で jobsProcessedTotal/jobDurationSeconds.inc 配線 + tickAll に queue depth gauge 更新 | 6h | worker |
| P1-SRE-03 | Zoom fetch / embed OpenAI SDK / Anthropic SDK に timeout + AbortSignal | 3h | worker/lib |
| P2-SRE-04 | pickProvider() の silent mock を production だけ Sentry warning に昇格 + env.ts の test-prefix bypass を fail-fast に | 2h | worker |
| P2-SRE-05 | DLQ queue 作成 migration + read_ct >= 3 で move/ack + DLQ gauge | 8h | worker + db |
| P2-SRE-06 | /readyz に provider key check 追加 (env list 化) | 2h | worker |
| P2-SRE-07 | OCR を assertConversationCap() に統一 | 1h | worker |
| P2-SRE-08 | tickEmbed / tickRecording* を tickAll に組込み | 4h | worker |
| P3-SRE-09 | rate-limit Upstash 化 (Phase3) | 8h | infra |
| P3-SRE-10 | web 側 console.error を JSON 構造化 | 2h | web |
| P3-SRE-11 | pgmq_send / pgmq_metrics の security definer migration | 4h | db |
| P3-SRE-12 | stale recording 復旧 cron | 4h | worker (cron route) |

合計工数: 48h (P1 = 13h, P2 = 17h, P3 = 18h)

## 95+ 到達への path

P1-SRE-01〜03 + P2-SRE-04〜08 を全て修正すれば、不足していた 22 点のうち 19 点 (メトリクス +6, shutdown +5, timeout +3, provider warn +2, DLQ +2, readyz +1) を回収して **97/100** に到達する。残る 3 点は P3 (rate-limit Redis 化、log 形式統一、migration drift 監視) で漸進改善。
