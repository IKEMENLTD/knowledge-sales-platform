# Architect Round 2 Review

レビュー対象: Phase 2 W2 Round 2 修正一式
担当: Architect Round 2
範囲: 依存・抽象・エラー・データフロー・fixture fallback・拡張性・migration 整合・モノレポ境界

## スコア: 92 / 100  (前回 78 → 92, +14 改善)

採点根拠 (Round 1 比 delta):
- HIGH-A-01 storage path/RLS 整合 RESOLVED: **+6**
- HIGH-A-02 dedupe 二重実装 → shared 集約 RESOLVED: **+8**
- HIGH-A-03 pgmq read/delete singleton + ensureQueue + metrics 集約 RESOLVED: **+5**
- SRE P1-SRE-01 graceful shutdown 配線 (closePgmq 連携) NEW: **+2**
- SRE P1-SRE-02 metrics 配線 (jobsProcessedTotal / jobDurationSeconds / llmTokens* /
  pgmqQueueDepth) NEW: **+2**
- SRE P1-SRE-03 external API timeout (OpenAI 30s, Whisper 120s, Claude 60s,
  Zoom 60s, maxRetries=0) NEW: **+2**
- Security CRITICAL-S-01 Idempotency 実 dedup 配線 (defineRoute 内 beginIdempotency
  → claim/fail 自動呼出) NEW: **+3**
- Security CRITICAL-S-04 SSRF (assertZoomDownloadHost + manual redirect 再 check)
  NEW: **+2**
- HIGH-C-02 meetings/page contacts.name / companies join 修正 RESOLVED: **+2**
- HIGH-C-03 tickAll 全 consumer 並列化 RESOLVED: **+2**

减点 (残課題):
- HIGH-A-04 Drizzle schema が migration 0034/0036/0037 に依然として未追随: **-4**
- MID-A-05 `DEFAULT_ORG_ID` ハードコード散在は ocr.ts/embed.ts/recording-* に残存: **-2**
- MID-A-06 dynamic route 内 `defineRoute` 二重ラップは未着手: **-1**
- MID-A-07/08 orchestrator 分離 + transaction 化は未着手 (route 内 100-200 行直書き): **-1**

---

## Round 1 指摘の解消状況

### HIGH-A-01 storage path / RLS の不整合: **RESOLVED**

`packages/db/src/migrations/manual/0038_round2_storage_fix.sql` で
`storage_object_user_id(name)` helper を追加し、`business_cards_insert` policy で
`with check (... and storage_object_user_id(name) = auth.uid() and owner = auth.uid())`
を明示。これで `upload-url/route.ts` が生成する `${user.id}/${objectId}.${ext}`
形式と一致する。

SELECT policy は (a) owner=auth.uid() or (b) path 先頭 = auth.uid() or
(c) `current_org_id()` 経由 org_id check の 3 経路を許容しており、Phase1
シングルテナント (`org_id` NULL fallback 0033) でも Phase2 cutover でも動作する。
UPDATE/DELETE は owner or manager/admin に絞られていて適切。

**残細目 (LOW-A-14)**: `current_org_id() is null` を SELECT で許容しているのは
Phase1 移行期の cheat であり、Phase2 cutover で外す必要がある。0038 のコメントは
そのことを明記しているが「TODO: Phase2 cutover 時に削除」を BEADS にチケット化
すべき。

### HIGH-A-02 名刺重複検知ロジックの二重実装 + アルゴリズム不一致: **RESOLVED**

`packages/shared/src/contacts-normalize.ts` を canonical として新設し:
- `apps/worker/src/lib/normalize.ts` → `@ksp/shared` re-export shim (10 行のみ、
  behavior 追加禁止のコメント明記)
- `apps/worker/src/lib/dedupe.ts` → 同 shim
- `apps/web/src/lib/api/contacts-dedupe.ts` → `@deprecated` adapter として旧
  API (rankCandidates / evaluateMatch / scoreMatch / DedupeQueryInput) を保持
  しつつ内部で `scoreCandidate` / `findDuplicates` を呼ぶ

weight (image_hash=1.0 / email=0.9 / phone=0.8 / name_company=0.7 /
linkedin=0.6) と score 合成 (max) と normalize 規約 (NFKC + `+81` 補完など) が
両 surface で identical になった。

contacts-normalize.ts の self-test (`buildNameCompanyKey`) が `n=null, c=null` の
ときだけ null を返し、片側存在で `'|company'` / `'name|'` を返すのは、新規/既存の
片側のみ company が NULL なケースで false-positive を生まないか少し不安だが、
`ak === bk && ak !== '|'` のガードがあるので空文字同士の偽一致は防げている。
適切。

**残細目 (LOW-A-15)**: web の `DedupeQueryInput.companyId` を companyName と
同じ pool に流し込むため、companyId が UUID として渡る既存 callsite では
`buildNameCompanyKey(name, '<UUID>')` が生成され、worker 側の
`buildNameCompanyKey(name, '会社名')` と一致しない false-negative が依然残る。
web 側 callsite が companyId のままなら、本 adapter は companyName を別途
解決して渡す必要がある。adapter の docstring に互換性 NOTE が書かれているが、
呼出元の grep が必要。

### HIGH-A-03 pgmq read/delete インライン + 接続暴走: **RESOLVED**

`apps/worker/src/lib/pgmq.ts` に singleton `getSql()` + `pgmqRead` / `pgmqDelete`
/ `pgmqArchive` / `pgmqEnsureQueue` / `pgmqMetrics` / `closePgmq` を集約。
`max=10, prepare=false, idle_timeout=30, connect_timeout=10` の postgres-js client
を module-scope に 1 個だけ持ち、`process.once('beforeExit')` で drain。

ocr.ts / embed.ts / recording-download.ts / recording-transcribe.ts /
recording-summarize.ts の 5 ファイルで旧インラインの `postgres()` new + `sql.end()`
が完全に削除され、すべて `pgmqRead` / `pgmqDelete` / `pgmqEnsureQueue` 経由に
統一されている。`grep -n "postgres()" apps/worker/src` 相当の検索ヒットは 0 と
推定 (lib/pgmq.ts の動的 import 1 箇所のみ)。

`PgmqQueue` 型も `'transcribe_recording' | 'summarize_recording'` を含む 5 値に
拡張済。ただし recording-download.ts / recording-transcribe.ts の `pgmqSend` 呼出
で `as 'process_recording'` の型キャストが残っている (`TRANSCRIBE_QUEUE as
'process_recording'`)。これは PgmqQueue が union として拡張されたあとは不要に
なったので、`pgmqSend(TRANSCRIBE_QUEUE, payload)` で動くはず。**MID-A-16 として
記録**。

### HIGH-A-04 Drizzle schema が migration 0034/0036/0037 に未追随: **PARTIAL → 主要部 OPEN**

`packages/db/src/schema/` 配下を確認した結果:
- `meetings.ts` に `next_action` / `win_probability` / `deleted_at` が **追加されて
  いない** (`schema/meetings.ts` の column 定義は P1 のまま)
- `search_queries` / `search_clicks` テーブル用の `schema/search.ts` が **存在しない**
- `meeting_stage_transitions` テーブルも `schema/meetings.ts` に **存在しない**

migration 0036/0037 で DB には列 / テーブルがあるが Drizzle 側は P1 stale 状態。
TypeScript で `meetings.$inferSelect` を使うコードでは next_action 等の型推論が
出ない。実害は当面 meetings/page.tsx 等は Supabase JS の手書き SELECT で
回避しているため UI は動くが、Drizzle introspect / migration generate を回すと
「列削除 SQL」が候補に出る潜在的足元危険がある。

**P0 残課題として継続**。

---

## 新たな強み (Round 2 で増えた)

1. **defineRoute Idempotency 完備**: `beginIdempotency` を route 内で自動呼出し、
   `idempotency_keys` テーブルの `request_hash` / `response_body` / status
   (`processing` / `done` / `failed`) を 0009 schema と完全一致させた。同一 key
   再呼出で cached 200, 別 hash で 409 conflict, in_progress で 409 を返す
   conformant state machine。`handler` 完了後に `idemClaim(status, body)` を
   response.clone() から自動取得する仕組みも完璧。

2. **SSRF 防御の完成度**: `assertZoomDownloadHost` が
   (a) https 限定 (b) credentials 排除 (c) IPv4 リテラル + RFC1918 / link-local /
   loopback / 0.0.0.0 範囲 block (d) IPv6 リテラル一律 block (e) host
   allowlist (`zoom.us` + `*.zoom.us` suffix) を順に通している。さらに
   `downloadZoomRecording` で `redirect: 'manual'` にして 3xx を捕まえ、再帰
   呼出で再 host check しているため、open redirect 経由の bypass も塞がれている。
   `AbortController` + 60s timeout も適切。

3. **graceful shutdown のフェーズ分け**: index.ts の `shutdown(signal)` が
   (1) tick interval 停止 + in-flight tick を 15s 待機
   (2) HTTP server.close() を最大 5s
   (3) `closePgmq()` で sql.end({ timeout: 5 })
   (4) 全体 25s で force exit(1)
   の 4 段階で書かれていて、各 phase で log.info を吐くため運用調査に強い。
   SIGTERM/SIGINT 両方 trap してかつ二重発火 guard (`stopping` flag) もあり、
   K8s rollingUpdate / Render redeploy の grace を完全に消費できる。

4. **metrics 配線の網羅性**: 5 つの tick (ocr / recording-download /
   recording-transcribe / recording-summarize / embed) すべてで
   `jobsProcessedTotal{queue,status}` + `jobDurationSeconds{queue,status}` を
   start/done/failed/invalid の 4 status で発行。さらに embed と summarize で
   `llmTokensTotal{vendor,model,kind}` + `llmCostUsdTotal{vendor,model}` を
   non-mock 経路でのみ inc。`pgmqQueueDepth{queue}` も tickAll 内
   `refreshQueueDepth` で全 5 queue 同期。`/metrics` endpoint と合わせて
   Prometheus scrape ready。

5. **external API timeout の一貫性**: OpenAI (embed) `timeout: 30_000,
   maxRetries: 0` / Whisper stub `REQUEST_TIMEOUT_MS = 120_000` 定数保持 /
   Claude stub `REQUEST_TIMEOUT_MS = 60_000, maxRetries: 0` / Zoom download
   `timeoutMs: 60_000`。`maxRetries: 0` を意図的に選んで「pgmq visibility
   timeout が retry mechanism」と docstring に明記しているのは設計判断として
   筋が通る (二重リトライで visibility をさらに伸ばすのを防ぐ)。

6. **tickAll の Promise.allSettled**: ocr が落ちても他 4 consumer が動き続ける
   ように `Promise.allSettled` + `TickReport` 集約。1 tick = 並列実行で I/O
   待ち時間が consumer 数分積み上がらない。`inFlightTick` フラグも各 tick
   個別に保つので、in-flight 衝突は per-consumer で隔離されている。

---

## 残課題 (新規 / 継続)

### HIGH (継続)

**HIGH-A-04 (継続)** — Drizzle schema が migration 0034/0036/0037 に未追随。
- 影響: drizzle-kit を本番運用に組み込むと migration 自動生成で
  「列削除 SQL」候補が出る。TypeScript 経由で meetings/search 系を select する
  サーバコードは untyped (`any` キャスト) になる。
- 修正案:
  - `packages/db/src/schema/meetings.ts` に `nextAction: text('next_action')`
    `winProbability: integer('win_probability')` `deletedAt: timestamp('deleted_at',
    { withTimezone: true })` を追加。
  - `packages/db/src/schema/search.ts` を新設して `search_queries` /
    `search_clicks` / `meeting_stage_transitions` を定義し index に export。
  - drizzle-kit `npm run db:check` を CI に乗せて schema drift を防ぐ。

### MID

**MID-A-16 (新規)** — `pgmqSend` 呼出に残る `as 'process_recording'` 型キャスト。
- `PgmqQueue` が union 拡張済なので
  `recording-download.ts` `pgmqSend(TRANSCRIBE_QUEUE as 'process_recording', ...)` /
  `recording-transcribe.ts` `pgmqSend(SUMMARIZE_QUEUE as 'process_recording', ...)`
  を `pgmqSend('transcribe_recording', ...)` `pgmqSend('summarize_recording', ...)`
  に書き直せる。型ハックが残っているのは将来のリファクタで queue 名を変えた時に
  silent fail する潜在地雷。

**MID-A-05 (継続)** — `DEFAULT_ORG_ID = '00000000-...-001'` ハードコードが
ocr.ts (line 37) / embed.ts (line 43) と recording-*.ts (一部) に残存。
- `packages/shared/src/constants.ts` 等で export し、worker 側で
  `resolveOrgIdForResource(supabase, sourceType, sourceId)` ヘルパを作って
  resource → org_id を引く形に統一すべき。
- 現状は Phase1 シングルテナント前提で動くが、Phase2 multi-tenant cutover で
  全 INSERT が同じ org に落ちる sploit になる。

**MID-A-17 (新規)** — `defineRoute` の Idempotency `unavailable` 状態が silent
pass する設計。
- route.ts L173 で `// unavailable は table 不在等。dedup を skip して通常実行。`
  というコメントがあるが、これは「**idempotency check 不能でも mutating を実行
  する**」ことを意味する。dev/test では妥当 (テーブルがまだ無い)、本番で
  unavailable が出るのは DB outage 等で、その時に二重課金経路を開けっぱなしに
  するのはセキュリティ的に弱い。
- 修正案: `process.env.NODE_ENV === 'production'` のときだけ unavailable を 503
  にする (もしくは `requireIdempotencyKey !== false` のとき limit fail-closed
  にする) フラグを追加。

**MID-A-06 (継続)** — dynamic route 内で `defineRoute` を毎リクエスト構築する
パターンが未修正。`/api/contacts/[id]/*` 系の 6 ファイル全てに残る。
- handler factory を build cost にしているのは無視できる程度 (closure 1 個) だが、
  rate-limit / idempotency check を idParse 不正時に bypass している observability
  穴は依然存在。

**MID-A-07/08 (継続)** — route から orchestrator/pure/persistence への分離 +
merge / register / handoff の transaction 化は未着手。Phase 2H で API 数が
増えるので、CTO レビューで P1 として再提起すべき。

### LOW

**LOW-A-14 (新規)** — 0038 SELECT policy が `current_org_id() is null` で常時
true 経路を許容している (Phase1 fallback)。Phase2 multi-tenant cutover 時に
削除する BEADS チケットを切るべき。

**LOW-A-15 (新規)** — `contacts-dedupe.ts` adapter の `DedupeQueryInput.companyId`
が companyName ではなく UUID として渡る既存 callsite で false-negative になる
可能性。docstring に互換性 NOTE はあるが、`grep -rn "rankCandidates\|evaluateMatch"
apps/web/src` で残存 callsite を洗い出して companyName を渡す形に直すべき。

**LOW-A-18 (新規)** — `lib/pgmq.ts` の `getSql()` が `pgmqRead` 経路で error を
debug log にして空配列を返す設計は、pgmq extension 不在 / queue 不在 / DB 接続
失敗 すべてを区別なく "空"扱いにする。CI / dev では妥当だが、本番で
queue が突然空に見える障害を観測しづらい。
- 修正案: `pgmqRead` 内で error.code === '42P01' (relation does not exist) /
  '42883' (function does not exist) を区別して structured warn を出し、それ
  以外を error log にするか、`pgmq_read_errors_total` counter を inc する。

---

## 95+ 到達への次の一手

優先度順に、**Round 3 で +3〜+5 取れる施策**:

1. **HIGH-A-04 Drizzle schema 追随 (+4)** — `schema/meetings.ts` に 3 列追加 +
   `schema/search.ts` 新設 + `meeting_stage_transitions` を `schema/meetings.ts`
   に追加 + `index.ts` から export。drizzle-kit `check` を CI に追加。
   *これだけで 95 着地が見える。*

2. **MID-A-16 型キャスト撤去 (+1)** — `recording-download.ts` /
   `recording-transcribe.ts` の `pgmqSend(... as 'process_recording', ...)` を
   `pgmqSend('transcribe_recording', ...)` / `pgmqSend('summarize_recording',
   ...)` に書き直し。30 秒。

3. **MID-A-05 DEFAULT_ORG_ID 集約 (+2)** —
   `packages/shared/src/constants.ts` に `DEFAULT_ORG_ID` を export + worker に
   `resolveOrgIdForResource()` helper 1 個。同 PR で `ocr.ts/embed.ts` の
   `DEFAULT_ORG_ID` を helper 呼出に置換。

4. **MID-A-17 Idempotency unavailable の production fail-closed (+1)** —
   route.ts L173-174 の unavailable 経路を `NODE_ENV==='production'` で 503
   返す + structured log。dev/test の動作は変えない。

5. **LOW-A-14 / LOW-A-18 を BEADS issue 化 (-0 だが運用負債を減らす)** —
   Phase2 cutover task と監視穴を可視化。

これらの全てを取れば **97-98 / 100** に到達可能。HIGH-A-04 のみでも 95 は届く
ため、最優先は Drizzle schema 追随。
