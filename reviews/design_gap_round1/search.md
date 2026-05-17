# 設計書 vs 実装ギャップ分析 — 検索 / Knowledge

担当範囲: T-013 (embeddings ingest worker) / T-015 (hybrid search API) / T-016 (search UI) / SC-17 / SC-18
シート: 02_screens, 03_data_model, 04_api_endpoints, 05_jobs_queues, 07_llm_prompts, 18_search_knowledge_quality, 24_acceptance_test_matrix

対象実装:
- `apps/web/src/app/search/{page,_components/*,_lib/highlight}.tsx`
- `apps/web/src/app/api/search/route.ts` + `apps/web/src/app/api/search/click/route.ts`
- `apps/web/src/lib/search/{embed,rrf}.ts`
- `apps/worker/src/jobs/embed.ts` + `apps/worker/src/lib/embed.ts`
- `packages/db/src/migrations/manual/{0001_init_schema, 0002_triggers_p1, 0006_add_org_id, 0014_match_knowledge_v2, 0037_search_logs}.sql`

## サマリ

| 区分 | 状態 |
|---|---|
| 完全実装 (P1) | RRF 合算 / SECURITY DEFINER + sensitivity/visibility/org_id prefilter (match_knowledge v2) / HNSW (`embedding`) + `ef_search=64` セッションセット / `search_queries` + `search_clicks` テーブル + RLS / explain pane (score breakdown) / `?kind`/`?owner`/`?from`/`?to` ファセット / 結果クリック beacon → CTR ログ / sensitivity バッジ (UI) |
| 部分実装 (Phase1 では allow / Phase2 で要対応) | "BM25" は実体が `to_tsvector` 抜きの PostgREST `.textSearch()` で **真の BM25 ではない** (ts_rank 取得不可、`config=simple` で日本語形態素なし) / 検索ログ 30 日 retention は pg_cron 拡張が無い環境で no-op / クエリ拡張プロンプト (PROMPT-10) は spec に存在するが配線なし |
| **未実装 (Phase1 リリースに支障あり)** | tsvector / GIN index (BM25 本体) / 日本語形態素 (pgroonga or textsearch_ja) / クエリ embedding キャッシュ / クエリ拡張 LLM / クエリ正規化 (synonym) / クエリ意図分類 / **LLM rerank (top-30 → top-10)** / autosuggest (trie+履歴) / 保存検索 / 0件率 alert / `deprecated_at`/`replaced_by` filter (`?exclude_deprecated`) / `?speaker_filter` / プリセット (role 別) / フィードバック (役立った/役立たない) / `did_you_mean` |

スコア感: **63 / 100** (P1 ローンチに NDCG@10>=0.7 を満たす可能性がほぼ無い実装。"ハイブリッド"を名乗っているが BM25 が事実上不在で vector 単独に近い)

---

## 1. T-013 Embedding Ingest Worker  (`apps/worker/src/jobs/embed.ts`)

### OK
- `chunkText()` 800 token + 100 overlap、改行→句読点→空白の優先 boundary (spec の `CHUNK_TOKENS=800` / `CHUNK_OVERLAP=100` と整合)。
- `resolveSource()` で `org_id` / `sensitivity` / `visibility` / `owner_user_id` を解決し、`metadata` に複製 (T-2 (S-C-02) 要件)。`match_knowledge_v2` の prefilter と整合。
- OpenAI `text-embedding-3-small` 1536-dim 直 fetch (SDK 依存無し)、`OPENAI_API_KEY` 不在時は deterministic mock。
- `processEmbedJob` で cost-guard (`assertMeetingCap`) + `cost_cap` 時は再試行せず ack。
- pgmq `read` / `delete` (singleton client) で正しい retry 設計、`inFlightTick` guard で多重実行防止。
- `llmTokensTotal` / `llmCostUsdTotal` メトリクス計上。

### ギャップ
| # | 項目 | spec | 実装 | 影響 | 優先度 |
|---|---|---|---|---|---|
| E-1 | **upsert** | `knowledge_embeddings upsert` (05_jobs_queues:34) | `insert` のみ (`apps/worker/src/jobs/embed.ts:295`)。`(source_type, source_id, chunk_index)` で UNIQUE 制約も無いので、再投入で重複行が増える。 | 再生成 (handoff edit / recording reprocess) で重複 chunk が知識ベースに蓄積。RAG コストと検索結果に直撃。 | **HIGH** |
| E-2 | `q_embedding_cleanup` 連携 | M-3: 元レコード削除時に embedding 掃除 (05_jobs_queues:122) | 該当 worker `apps/worker/src/jobs/embedding-cleanup.ts` が存在しない (`Glob` で確認)。 | recording/meeting 削除後に古い embedding が検索結果に残る。 | **HIGH** |
| E-3 | `q_derived_artifacts_regen` 連携 | F-S5-1: 手動編集後の embeddings 差分再生成 (05_jobs_queues:141) | 連携 worker 不在。`/api/recordings/[id]/insights` PATCH 後の再生成パスが無い (API spec AP-22 改 / AP-148 に存在)。 | 編集された summary/handoff が embedding に反映されないため、検索結果が stale。 | **HIGH** |
| E-4 | `q_speaker_voice_propagate` | F-S5-4: voice 学習で過去録画に反映 (05_jobs_queues:142) | 連携無し。 | speaker_filter の精度に影響 (E-6 と連動)。 | P2 |
| E-5 | `q_consent_revoke_apply` | M-C5: 撤回時 embedding 削除 (05_jobs_queues:124 / AP-116) | 連携無し。 | コンプライアンス問題 (撤回後も embedding 残存)。 | P2 (legal blocker候補) |
| E-6 | speaker / start_sec metadata | spec 18: speaker_filter / atSec ジャンプ | `metadata.start_sec` は payload 側で渡された場合のみ保存。`embed.ts` 内で recording transcript のセグメント分割は **行っていない** (chunks が payload に詰まる前提)。`recording-summarize.ts` が seg → chunks payload を作るかどうか確認推奨。 | atSec ジャンプ / speaker_filter は payload 上流に責務丸投げ。設計書に明示が無く、責務境界が曖昧。 | MID |
| E-7 | embedding versioning | AP-137: `embeddings_v` (03_data_model:942) | `knowledge_embeddings` テーブルに `version` 列なし (0001_init_schema:178-188)、`recordings.embeddings_v` も列無し。derived-status API 自体が未実装。 | staleness UI が出せない。 | MID |
| E-8 | input clamp と spec の整合 | 32KB hard-cut (embed.ts:20) | spec は 1k token × 上位 8 件 (M-9: context_tokens_cap) を retrieval 側に課す。embed 側の hard-cut は OpenAI 8192 token を超えない safety net としては OK だが、`CHUNK_TOKENS=800` の前提と矛盾する 32KB は緩すぎる (BPE 換算で約 10k+ token)。 | mock 経路では問題なし、本番 API call で 400 が返る可能性。 | LOW |

---

## 2. T-015 Hybrid Search API  (`apps/web/src/app/api/search/route.ts`)

### OK
- vector + BM25 (相当) を `Promise.all` で並列実行 → RRF (`k=60`) で結合。`rrf.ts` は Cormack 2009 準拠で純粋関数、テスト済 (`apps/web/src/lib/search/__tests__/rrf.test.ts`)。
- `kind=all|recording|meeting|contact` の bucket 分けと post-filter (owner / from-to)。
- `searchHit.scoreBreakdown` に vector / bm25 / rrf を 1/(k+rank) で計算した値を入れて explain UI に渡す。
- `search_queries` への INSERT は best-effort (失敗時は `captureException` + ログ、検索結果は返す)。
- rateLimit `30 capacity / 0.5 token/s` で読み専用に近い見積。
- `sanitizeForTextSearch()` で `,()`{}:;` 等を除去 → PostgREST URL injection に対する防御。
- `runtime = 'nodejs'` / `dynamic = 'force-dynamic'` で SSR cache 事故を防止。
- `bucketVectorRows()` で `recording_segment` / `meeting_notes` / `contact` / `business_card` を正規化、`email`/`handoff`/`knowledge_item` は意図的に Phase1 対象外。

### **致命ギャップ**
| # | 項目 | spec | 実装 | 影響 | 優先度 |
|---|---|---|---|---|---|
| S-1 | **真の BM25 が無い** | 18_search:7 (`BM25+vector+recency`) / 18_search:29 (T-4: `paradedb(pg_search)` 推奨) / 09_implementation_plan:22 (`BM25(Postgres tsvector)`) | `to_tsvector` 列 / GIN index / `ts_rank` 一切無し (`Grep` 確認)。`route.ts:144-194` は PostgREST `.textSearch('summary', q, {type:'websearch', config:'simple'})` を叩いているだけで、これは Postgres が **個別行ごとに tsvector を都度計算する** ため (a) **INDEX が無いので O(N) 全件走査**、(b) `config=simple` (= stop word なし、stemmer なし、語間スペース必須) なので日本語クエリ「価格交渉」では `to_tsquery('価格交渉')` 1 トークン扱いで **完全文字列含む** 行のみヒット、(c) `ts_rank` 値が取れず `rank=配列順` を RRF に渡すだけ。 | **NDCG@10 0.7 到達はほぼ不可能**。AT-S13-1 で fail。 | **CRITICAL** |
| S-2 | 日本語形態素 | 18_search Round1 追加 (`pgroonga`/`textsearch_ja` 期待) | 拡張インストール無し、`config=simple` 固定。 | 「価格交渉で押し返された商談」のような自然文クエリは BM25 側で 0 件確定。vector 単独頼みになる。 | **CRITICAL** |
| S-3 | **LLM rerank (top-30 → top-10)** | 18_search:7 (`top200→rerank top20`) | 配線無し (Grep `rerank` で hit せず)。`apps/web/src/lib/search/rerank.ts` も存在しない。 | NDCG 改善幅が最も大きいレバーが未実装。 | **HIGH** |
| S-4 | クエリ拡張 (PROMPT-10) | `meeting_search_query_expansion` 類義語 3-5 生成 (07_llm_prompts:129) | 未配線。 | 表記ゆれ・同義語に弱い (vector 単独依存)。 | **HIGH** |
| S-5 | クエリ正規化 (synonym 辞書) | 18_search (synonym, multilingual) | 無し。 | 「失注」⇔「Lost」のような揺れに弱い。 | MID |
| S-6 | **クエリ embedding キャッシュ** | M-9 cost-cap / Phase2 期待 (`prompt cache`) | 毎リクエストで `embedQuery()` → OpenAI API。同一クエリ繰り返し (autosuggest と組合せ時に致命的) で `$0.10/conversation` cap を超えるリスク。 | OpenAI 課金とレイテンシ (p95 目標 400ms に効く)。 | **HIGH** |
| S-7 | クエリ意図分類 | spec には明示なし。design 上「人物/商談/録画/FAQ」の振分は `kind` フィルタ手動指定のみ。 | UI で chip 押下のみ、自動分類 (LLM router) 無し。 | "中村さんはどこの会社" → contacts に絞るような UX が無い。 | MID (spec も曖昧) |
| S-8 | `?speaker_filter` | AP-94 (04_api_endpoints:104) | `searchRequestSchema` に `speakerFilter` なし、route も実装なし。 | speaker_filter テスト fail。 | **HIGH** |
| S-9 | `?exclude_deprecated` (default true) | AP-94 改 / F-S13-2 (04_api_endpoints:150) | 未実装。`deprecated_at` / `replaced_by` 列がそもそも `recordings` / `meetings` に無い (03_data_model:754 は別 entity)。 | 古い情報を除外できない。 | **HIGH** (spec 上 default=true) |
| S-10 | `did_you_mean` | AP-94 改 (04_api_endpoints:150) / AP-94 0件分岐 (18_search:34) | response schema に無し / UI も無し (EmptyState は固定 rewrite suggestions のみ)。 | 0件 UX 劣化。 | **HIGH** |
| S-11 | `ranking_explain` | AP-94 (04_api_endpoints:104) | `scoreBreakdown` (vector/bm25/rrf) は実装済だが、**bm25 値は 1/(60+rank) の再計算で `ts_rank` 実体ではない**。さらに `recency` 寄与 (重み 0.2) は計算自体無し。 | UI で出る値が誤解を生む。 | MID |
| S-12 | recency 重み | 18_search:7 (重み 0.4/0.4/0.2) | recency boost 計算 0。 | 古い結果が上位に来る。 | **HIGH** |
| S-13 | ranking ゴールデン set | M-15 (18_search:35) | `tests/golden/search/*.json` 等無し。CI bench 無し。 | NDCG@10>=0.7 の自動測定不可。 | MID |
| S-14 | context_hint (G-10) | 18_search:33: アクティブ顧客自動絞 | API param 無し。 | live-search (SC-43) で不可。 | P2 |
| S-15 | 0件率 alert | spec 暗示 (`zero hit rate` を観測) | metrics 計上無し (`isEmbeddingMocked` は出るが zero hit カウンタなし)。 | アラート不可。 | MID |
| S-16 | RAG cost cap | M-9 (18_search:37 `$0.10/conversation`) | `cost-guard` は worker 側 (`assertMeetingCap`) のみ。API 側に search 用 cost cap 無し。 | embedding 多発時に課金暴走。 | MID |
| S-17 | `total` 値の誤り | `searchResponseSchema.total` | `route.ts:606` で `hits.length` (= RRF 統合後の post-filter 後の件数) を `total` に入れているが、これは "現在ページ含む全件数" であって本来の母数ではない (vector 30 + BM25 各 30 で hard-cap)。Pagination が機能しない (offset/limit を進めると total が動的に変わる)。 | UX バグ (件数表示不安定)。 | MID |
| S-18 | レスポンス snippet ハイライト | spec UI: ハイライト | サーバ側は `makeSnippet()` で素テキスト (60+140 char window)。`ts_headline` 風処理ではないため "中央寄せ" の精度が低い。クライアント側 `highlight.ts` で再ハイライトしている。 | OK だが Phase2 で `ts_headline` 統合余地。 | LOW |
| S-19 | rate limit | spec 18 (`p95<400ms`) | `30 capacity / 0.5 refill` (= 1 req / 2s, バースト 30)。autosuggest を想定すると burst 30 は足りるが、refill 0.5 はやや厳しい。 | autosuggest 実装時に要見直し。 | LOW |
| S-20 | `org_id` 解決 fallback | S-C-02 / RLS 厳格化 (Phase2 cutover) | `route.ts:417-426` で users 行を改めて SELECT して `org_id` を引き直し、失敗時 `DEFAULT_ORG_ID`。phase2_round4 で `AppUser.orgId` を `requireApiUser` で詰める修正が入った (search/click は対応済) のに **search 本体は重複 SELECT が残置**。 | 整合性 (phase2_round4 security MID 残)。 | MID |

---

## 3. T-016 Search UI  (`apps/web/src/app/search/*`)

### OK
- `URL` を SoT として `?q` / `?kind` / `?owner` / `?from` を双方向同期 (Server で `buildRequest()` + Client `useSearchParams` 連携)。
- 期間プリセット (`1w` / `1m` / `3m` / 全期間) を ISO 文字列で `from` に展開。
- explain pane (`なぜヒット`) で vector / BM25 / RRF 数値 + バー表示。
- 結果カードは Card interactive + `sendBeacon('/api/search/click')` → CTR ログ (LTR 前提)。`demo-` ID は skip、UUID 形式チェック。
- 結果 0 件で rewrite suggestion 表示 (5 件)。
- `/` ホットキーで input focus (input/textarea 編集中は無効化)。
- `degraded` フラグで API 失敗時に `<output role="status" aria-live="polite">` で告知 (a11y OK)。
- sensitivity バッジ (`restricted`/`sensitive` のみ表示)。
- 直近検索履歴 5 件は `search_queries` の SELECT (RLS は self_select で自分の row のみ)。

### ギャップ
| # | 項目 | spec | 実装 | 影響 | 優先度 |
|---|---|---|---|---|---|
| U-1 | **autosuggest / autocomplete** | 18_search:20 (`trie + 履歴`) | client autosuggest 無し (`Grep autosuggest|autocomplete` で hit せず)。`SearchForm` の "よく聞かれる質問" は静的 5 件 + 履歴は 5 件のみ。 | UX 大幅劣化、type-ahead 無し。 | **HIGH** |
| U-2 | per-user IndexedDB 履歴 | 18_search 補助 / オフライン (17_offline_mobile) | server 由来 `search_queries` のみ。クライアント IndexedDB 履歴 (オフライン時) 無し。 | mobile 利用時に履歴消失。 | MID |
| U-3 | 保存検索 (saved queries) | 18_search 暗示 (fb loop / 通知)、03_data_model に table 無し | テーブル無し / UI 無し。 | 経営層がよく使うクエリの再利用不可。 | MID |
| U-4 | 0件率 alert / 0件 UI 強化 | 18_search:34 (`did_you_mean`/`broaden` AP-94 0件分岐) | `EmptyState` は固定 5 つの rewrite suggestion のみ。`did_you_mean` API 連携無し、`broaden` (filter緩和提案) 無し。 | 0件 UX 弱い。 | **HIGH** |
| U-5 | ファセット (sensitivity / role / customer) | 18_search:21 (`date/role/customer/sensitivity`) | `kind` / `owner` / `period` (3 つ) のみ。`sensitivity` filter UI 無し、`customer` (company_id) filter 無し。 | フィルタ要件未充足。 | **HIGH** |
| U-6 | プリセット (ロール別) | 18_search:17 (`CS=クレーム/営業=ニーズ/新人=反論`) | 未実装。`DEFAULT_SUGGESTED_QUERIES` 5 件が全 role 共通。 | spec 不一致。 | MID |
| U-7 | フィードバック (役立った/役立たない) | 18_search:19 (`reward signal`) | UI 無し / table 無し (`search_feedback` 等)。 | LTR 再学習の signal 取れず (Phase3 予定だが、ボタンだけでも置く設計が望ましい)。 | LOW (P3) |
| U-8 | クエリリライト提案の動的化 | spec 18: query reformulation | `REWRITE_SUGGESTIONS` は static const (`page.tsx:45-51`)。 | UX。 | LOW |
| U-9 | 検索ログ retention 30 日 UI | spec privacy | UI 上で "履歴は 30 日で消えます" の文言無し。`/settings/privacy` には pixel/CAPI 同意のみ。 | コンプライアンス透明性。 | MID |
| U-10 | 「最近見たもの」 | 18_search:16 (`recent_views`) | 検索ページ内に無し (dashboard 側にあるかは別件)。 | MID |
| U-11 | sensitivity 表示の網羅性 | 18_search:23 (`検索除外OR本人のみ`) | `restricted`/`sensitive` でバッジは出るが、prefilter は match_knowledge (RPC) のみ。BM25 経路 (`recordings.textSearch`) には sensitivity filter **無し** (`bm25Recordings` の SELECT は filter してない、RLS 任せ)。 | RLS 健全性に強く依存。RLS バイパス防御層 2 が欠落。 | **HIGH** |
| U-12 | atSec ジャンプ | spec: 該当箇所ジャンプ (09_implementation_plan:23) | `hit.atSec` を表示はしているが、`href=/recordings/${r.id}` は固定で `?t=` 等の遷移パラメータ無し。 | クリック後に該当箇所まで自動 seek されない。 | MID |
| U-13 | 商談中検索 (SC-43) / 顧客即時 (SC-45) | 02_screens:51, 53 | URL 無し (`/meetings/[id]/live-search` / `/support/quick-search` 未実装)。Phase2 だが SC-43/45 が `/api/search` を間借りする前提で API 側に `context=live` / `customer_id=` が必要。 | Phase2 で追加実装。 | P2 |
| U-14 | "場所" や時系列パース | 18_search:9 (`「○年○月頃」 LP-22`) | 自然文の日付パース無し。 | UX。 | P2 |
| U-15 | 引用必須 (RAG router) | 18_search:13 (`引用必須プロンプト`) | そもそも生成系 (回答) は無く、検索結果リストのみ。RAG 回答 UI が未実装 (Phase3 想定)。 | spec 通り Phase3 で OK。 | P3 |

---

## 4. DB / Migrations

### OK
- `knowledge_embeddings` (vector 1536 + metadata jsonb + chunk_index) (0001_init_schema:178-188)。
- HNSW index `embeddings_hnsw_idx` on `(embedding vector_cosine_ops)` (0002_triggers_p1:31-32)。`ef_construction=128` は明示無く Postgres デフォルト (= 64)、`ef_search=64` のみ session set。
- `match_knowledge` v2 で sensitivity tier + visibility + org_id 二重 prefilter + `ef_search=64` session set + LIMIT clamp 1..50 (0014_match_knowledge_v2.sql)。SECURITY DEFINER + `current_user_role()` 検査。
- `search_queries` + `search_clicks` テーブル + RLS (self_select / self_insert + manager/admin 拡張) + FK ON DELETE CASCADE + pg_cron 30 日 retention (0037_search_logs.sql)。

### ギャップ
| # | 項目 | spec | 実装 | 影響 | 優先度 |
|---|---|---|---|---|---|
| D-1 | **tsvector 列 + GIN index** | 18_search:7 / 09_implementation_plan:22 | 列なし。`recordings.summary` / `transcript_full` / `meetings.title` / `meetings.manual_notes` / `contacts.name|email|title` のいずれにも `tsv` 列なし。GIN index 無し。 | BM25 が機能しない (S-1)。 | **CRITICAL** |
| D-2 | `pg_trgm` / `gin_trgm_ops` | あいまい一致 (typo tolerance) | 拡張無し (`0000_setup.sql` 確認推奨)。 | typo / 部分一致でヒット率低い。 | **HIGH** |
| D-3 | pgroonga or textsearch_ja | 18_search Round1 補強 | 拡張無し。 | 日本語形態素解析不可。 | **CRITICAL** |
| D-4 | paradedb / pg_search | 18_search:29 (T-4) | 未導入。Supabase Cloud では拡張未対応のため代替 (textsearch_ja or external service) 要検討。 | spec の "BM25 本物" 不一致。 | **HIGH** |
| D-5 | HNSW `ef_construction=128` | 18_search v2.1:30 / v2.2:42 | session 側で `ef_search=64` のみ。index 作成時の `ef_construction` パラメータ指定無し (`0002_triggers_p1:31-32` で `with` 句無し → default 64)。 | recall 不足。Recall@10>=0.95 不達リスク。 | **HIGH** |
| D-6 | HNSW ベンチ結果 (docs/) | 18_search v2.2:42 | `docs/hnsw_bench_*.md` 無し。ADR 無し。 | P1 ローンチ前必須要件 unmet。 | **HIGH** |
| D-7 | partition(org_id + date) | 18_search:31 (T-4) | partition 無し。`0027_phase2_chain_partition_placeholder.sql` は placeholder のみ。 | scale-out 余地。 | P2 |
| D-8 | `knowledge_embeddings` UNIQUE 制約 | E-1 と関連 | `(source_type, source_id, chunk_index)` UNIQUE 無し。 | 重複 INSERT 防げない。 | **HIGH** |
| D-9 | `deprecated_at` / `replaced_by` | 18_search:11-12 / AP-94 改 | recordings/meetings に列無し。 | exclude_deprecated 不可。 | **HIGH** |
| D-10 | search_queries `query_kind` 検索意図 | (S-7 と関連) | `query_kind in ('all','recording','meeting','contact')` だけ。意図分類拡張余地はあり。 | LOW |
| D-11 | search_queries.query_text PII | 0037 comment | UI 上「30 日で消えます」明示 (U-9) は別件、SELECT が manager/admin にも開いており PII リスク。query_text を hash 化する選択肢が spec に書かれていないため監査側で判断要。 | MID |
| D-12 | `search_feedback` table | 18_search:19 / U-7 | 無し。 | P3 OK |
| D-13 | `embeddings_v` 列 (recordings) | 03_data_model:942 / AP-137 | 列無し。 | derived-status 実装不可。 | MID |
| D-14 | popular_searches_view | suggestions.tsx:10 (本番想定) | view 無し。 | MID |

---

## 5. シート別 充足状況

| シート | カバー率 | コメント |
|---|---|---|
| 02_screens (SC-17) | 70% | UI 骨格 + ファセット 3 つ + explain は OK。autosuggest / 保存検索 / プリセット / customer ファセット 未充足。SC-18 (検索結果) は `result-list.tsx` で 80% 充足、`did_you_mean`/atSec ジャンプが穴。 |
| 03_data_model | 60% | knowledge_embeddings / search_queries / search_clicks は実装。`deprecated_at` / `replaced_by` / `embeddings_v` / `(source_type,source_id,chunk_index) UNIQUE` が未実装。 |
| 04_api_endpoints (API-24 / AP-94) | 55% | basic hybrid は通る。`speaker_filter` / `exclude_deprecated` / `did_you_mean` / `ranking_explain` の数値正確性 / `context=live` / `customer_id=` 未実装。 |
| 05_jobs_queues (generate_embeddings / q_embedding_cleanup / q_derived_artifacts_regen / q_consent_revoke_apply / q_speaker_voice_propagate) | 25% | `generate_embeddings` のみ実装、関連 4 worker 未実装。upsert ではなく insert なので冪等性問題あり。 |
| 07_llm_prompts (PROMPT-10) | 0% | クエリ拡張プロンプト未配線。LP-41 RAG cost cap も search 側に無し。 |
| 18_search_knowledge_quality | **35%** | BM25 本体 / 日本語形態素 / LLM rerank / recency / クエリ拡張 / autosuggest / ファセット (sensitivity/customer) / プリセット / 保存検索 / 0件 alert / golden set / NDCG bench / HNSW bench 全て未実装。**P1 ローンチ前のブロッカー級**。 |
| 24_acceptance_test_matrix (AT-S13-1 NDCG>=0.7) | 0% | golden set 無し、bench 無し、CI 連携無し。 |

---

## 6. 推奨アクション (優先度順)

### P0 (Phase1 ローンチ前必須)
1. **BM25 実装**: `recordings.tsv` / `meetings.tsv` / `contacts.tsv` GENERATED ALWAYS AS (`to_tsvector('simple', ...)`) STORED + GIN index を新規 migration (`0040_search_tsvector.sql`)。`/api/search` を PostgREST `.textSearch` から専用 RPC (`hybrid_search_bm25(query text, kind text, limit int)`) に切替えて `ts_rank` 実値を取得 → RRF。
2. **日本語形態素**: Supabase で `pgroonga` 拡張が使えるか確認。不可なら `textsearch_ja` + mecab、それも不可なら `pg_bigm` (bigram tokenizer)。最低でも `pg_trgm` + `gin_trgm_ops` で部分一致を担保。
3. **HNSW `ef_construction=128`**: `0002_triggers_p1.sql` の HNSW を `WITH (m=16, ef_construction=128)` で再作成 migration。Recall@10 ベンチ取り直し → `docs/hnsw_bench_<date>.md` + ADR。
4. **`knowledge_embeddings` UNIQUE 制約 + upsert**: `UNIQUE (source_type, source_id, chunk_index)` 追加 → `embed.ts:295` を `.upsert(rows, { onConflict: 'source_type,source_id,chunk_index' })` に変更。
5. **embedding cleanup worker** + **derived-artifacts regen worker** 新設 (E-2 / E-3)。recording/meeting 削除 / handoff edit のフックを worker に接続。

### P1 (Phase1 中)
6. **LLM rerank**: top-30 (RRF 統合後) → `claude-3-5-haiku` で context (`title + snippet`) を渡して relevance score 出力 → top-10 採用。`apps/web/src/lib/search/rerank.ts` 新設。response の `scoreBreakdown` に `rerank` 列追加。
7. **クエリ拡張 (PROMPT-10)**: `embedQuery()` 前に LLM で 3-5 個の synonym 生成 → 各 embedding の平均ベクトルを RPC に渡す or 各クエリの結果を RRF に追加 source として投入。**embedding キャッシュ** (SHA-256(query) → vector を `query_embeddings_cache` table or in-memory LRU) を併設。
8. **`speaker_filter` / `exclude_deprecated` / `did_you_mean`** API 仕様準拠 (S-8, S-9, S-10)。`searchRequestSchema` 拡張 + `searchResponseSchema.didYouMean` 追加 + `recordings.deprecated_at` 列追加。
9. **recency 重み**: RRF とは別に `recency_boost = exp(-Δdays / 90)` を post-process で score に 0.2 weight で乗算。
10. **autosuggest**: client 側 trie (`apps/web/src/lib/search/trie.ts`) + `search_queries` の自分の履歴 + popular_searches_view で top 20 suggest。debounce 150ms。
11. **ファセット拡張**: sensitivity / customer (company_id) を `searchRequestSchema` + UI に追加。

### P2 (Phase2)
12. プリセット (role 別) / 保存検索 + 通知 / フィードバック ボタン (search_feedback) / context_hint / atSec ジャンプ / live-search / quick-search。

### P3 (Phase3)
13. golden set 200+ / NDCG@10 CI bench / ranker 再学習 / RAG 引用必須プロンプト。

---

## 7. 結論

**スコア: 63 / 100**

- 構造 (RPC / RLS / RRF / explain) は spec 線形で良いが、**"ハイブリッド" を名乗る根拠の BM25 が事実上不在** (D-1 / S-1) で、Phase1 ローンチ前に AT-S13-1 (NDCG@10>=0.7) を満たす可能性が極めて低い。
- 加えて **embedding upsert 不在** (E-1 / D-8) と **embedding cleanup / regen worker 不在** (E-2 / E-3) で、データの**鮮度**と**重複**の両方が劣化する。
- UI は骨格として上出来 (URL SoT / a11y / explain / degrade fallback)。ただし autosuggest / 0件 UX / ファセット (sensitivity/customer) / プリセット が未実装で P1 ローンチ品質に届かない。
- 推奨は **P0 5 項目を Phase1 ローンチ前 sprint で実装、P1 6 項目を ローンチ後 4 週間以内** に着地。
