# Architecture (Phase 1 baseline)

```
┌────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 15 / Render Web Service)                   │
│   ├─ App Router (RSC + Route Handlers)                         │
│   ├─ Supabase SSR (cookie session)                             │
│   ├─ defineRoute() ラッパ (zod + idempotency + CSRF + rate)   │
│   ├─ requireUser / requireApiUser (AuthError 401/403)          │
│   └─ middleware.ts (未認証→/login, /api/* per-IP rate limit)   │
└──────────┬────────────────────────────────────────┬─────────────┘
           │ supabase-js (anon, cookie)             │ supabase-js (service role)
           │                                        │ ※ Route Handlerからは禁止
           ▼                                        ▼
┌────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│   ├─ Postgres + pgvector + pgmq + pg_cron + Vault              │
│   │    ├─ public.users / contacts / meetings / recordings ...  │
│   │    ├─ knowledge_embeddings (HNSW, vector(1536))            │
│   │    ├─ search_queries / search_clicks (CTR / LTR)           │
│   │    └─ pgmq.q_process_business_card / q_process_recording   │
│   ├─ Auth (Google OAuth + Calendar/Gmail scopes)               │
│   ├─ Storage (business-cards / recordings bucket)              │
│   └─ RLS: sales/cs/manager/admin/legal マトリクス              │
└──────────┬────────────────────────────────────────┬─────────────┘
           │ pgmq.read / archive                    │ Realtime (WAL)
           ▼                                        ▼
┌────────────────────────────────────────────────────────────────┐
│  apps/worker (Hono / Render Background Worker)                 │
│   ├─ POST /webhooks/zoom (URL validation + 署名)               │
│   ├─ jobs/process_business_card.ts (Vision API → Claude → DB)  │
│   ├─ jobs/process_recording.ts (Zoom DL → Whisper → R2 → DB)   │
│   └─ jobs/generate_embeddings.ts (OpenAI embeddings → pgvector)│
└──────────┬────────────────────────────────────────┬─────────────┘
           │                                        │
           ▼                                        ▼
     Cloudflare R2                          Anthropic / OpenAI
     (録画動画 / クリップ)                  (Claude / Embeddings / Whisper)
```

## 4 機能の実装ステータス (Round 4 + Round 1 P0 後)

| 機能 | UI | API | Provider 抽象 | Worker |
|---|---|---|---|---|
| 名刺取込 | `/contacts/import` (D&D + EXIF 剥離 + リサイズ + signed PUT) / `/contacts` 一覧 / `/contacts/[id]` レビュー | `POST /api/contacts/upload-url` (署名 URL 発行 + dedup) → `POST /api/contacts` (row INSERT + pgmq) | Vision OCR (`@ksp/worker/providers/vision`) | `jobs/process_business_card.ts` (Mock / Google DocAI) |
| 録画処理 | `/recordings`, `/recordings/[id]` (transcript + key_points + objections) | Worker 経由のみ (web は read only) | Whisper STT, Claude PROMPT-01 | `jobs/process_recording.ts` |
| 商談 | `/meetings` (Kanban + 加重パイプライン + kbd DnD) / `/meetings/new` / `/meetings/[id]` | `POST /api/meetings`, `POST /api/meetings/[id]/stage`, `GET /api/meetings/[id]` | — | — |
| 検索 | `/search` (URL 同期 form + recordings/meetings/contacts hit) | `POST /api/search` (BM25 + vector + RRF) / `POST /api/search/click` (CTR 計測) | OpenAI embeddings | `jobs/generate_embeddings.ts` |

## データフロー (T-007〜T-016)

### 名刺取込 (T-007〜T-010)
1. PC `/contacts/import` または モバイル `/mobile/scan` で画像 D&D / 撮影
2. クライアント側で sha256 + EXIF 剥離 + 長辺 2048 リサイズ
3. `POST /api/contacts/upload-url` で signed URL を取得 (`org_id` スコープで dedup)
4. Supabase Storage `business-cards/<userId>/<contactId>.jpg` に直接 PUT
5. `POST /api/contacts` で `contacts` 行を `pending_ocr` で INSERT (`org_id = user.orgId`)
6. `pgmq.send('process_business_card', { contactId, storageKey })`
7. Worker 消費 → Vision Document AI → Claude PROMPT-02 で正規化 → 重複検知 → contacts UPDATE
8. Realtime subscription で UI に通知

### 録画取込 (T-011〜T-013)
1. Zoom が `recording.completed` を `/webhooks/zoom` に POST
2. `x-zm-signature` 検証 → meetings/recordings upsert (zoom_recording_id ユニーク)
3. `pgmq.send('process_recording', payload)` → 200 即時返却
4. Worker:
   - download_url で R2 にコピー (署名URL期限切れ前)
   - Whisper STT (or Zoom transcript) → segments
   - Claude PROMPT-01 で要約/key_points/customer_needs/objections/next_actions/commitments 抽出
   - segments を 800 token + overlap 100 でチャンク
   - `pgmq.send('generate_embeddings', { sourceType: 'recording_segment', sourceId, chunks })`
5. Embedding Worker → OpenAI text-embedding-3-small バッチ → knowledge_embeddings INSERT

### ハイブリッド検索 (T-015〜T-016)
- `POST /api/search` で BM25 (Postgres tsvector) と vector top-k を並列取得
- BM25: `recordings.search_tsv` / `meetings.search_tsv` / `contacts.search_tsv` (GIN-backed, migration 0040)
- vector: `match_knowledge` RPC は SECURITY DEFINER で sensitivity prefilter
- RRF (Reciprocal Rank Fusion, k=60) でリランク → kind 別グループ化
- `search_queries` に INSERT (queryId, query_text, result_count, durations, vector_top_score, bm25_top_score)
- `POST /api/search/click` で CTR 計測 (search_clicks に INSERT)

## Provider 抽象 / pgmq 配線

| Queue | Provider 切替 (env) | Mock impl |
|---|---|---|
| `process_business_card` | `VISION_PROVIDER=mock|google_docai` | `apps/worker/src/providers/vision/mock.ts` |
| `process_recording` | `STT_PROVIDER=mock|whisper` | `apps/worker/src/providers/stt/mock.ts` |
| `generate_embeddings` | `EMBEDDING_PROVIDER=mock|openai` | `apps/web/src/lib/search/embed.ts` (`isEmbeddingMocked()`) |
| Claude 要約 | `LLM_PROVIDER=mock|anthropic` | `apps/worker/src/providers/llm/mock.ts` |

pgmq consumer は `apps/worker/src/queue.ts` の `consumeLoop` が単一プロセスで全 queue を順次 pop。
visibility timeout 30s, retry 3 回までは自動、超過後は `dead_letter_*` に archive。

## Storage Bucket

- `business-cards` (private, 5 MB cap)
  - Path: `<userId>/<uuid>.<ext>`
  - RLS (migration 0035 / 0038 / 0039): path 先頭セグメントが `auth.uid()` と一致する row のみ SELECT/INSERT/UPDATE
  - Service role 経由は worker 専用
- `recordings` (private, GOVERNANCE Object Lock 7年)
  - Path: `recordings/<meetingId>/<ts>.mp4`
  - Cloudflare R2 ミラー (S3 互換) で再生用署名 URL は ≤ 300s で発行

## セキュリティ境界

- **anon key**: `NEXT_PUBLIC_*` のみブラウザ露出。RLS 経由で読み書き
- **service_role key**: worker 専用。Next.js Route Handler では禁止 (08_security_rls v2.1 hardening)
- **Vault**: OAuth refresh_token / access_token は user_oauth_tokens.refresh_token_secret_id で参照、生tokenはVault側
- **R2 署名URL**: expires ≤ 300s。メールクリック時に再発行 + GOVERNANCE Object Lock 7年
- **Webhook secrets**: 90日 dual-window rotation (`ZOOM_WEBHOOK_SECRET_TOKEN` + `_PREVIOUS`)
- **CSP / Permissions-Policy**: `next.config.mjs` で all path に適用、`/api/csp-report` で違反集計→Sentry forward
- **Rate limit**: web `/api/*` 60rpm (per-IP, middleware) + per-user 60rpm (defineRoute), worker webhook 30rpm/IP、in-memory token bucket
- **users.role 変更**: 0015 trigger で admin のみ許可 (自己昇格防止)
- **OAuth scope**: 初回サインインは Calendar.events のみ最小化、Gmail は P2 incremental authorization で追加同意
- **CSRF check** (defineRoute, mutating 限定): Sec-Fetch-Site=cross-site → 403、Origin が `env.APP_URL` 不一致なら 403。Origin 未指定は production のみ 403 (Round3 NEW-HIGH-S-21)
- **Idempotency-Key**: mutating method 必須 (例外: `/api/search` は read-only 相当)。`idempotency_keys` テーブル (migration 0009) で `processing` / `done` / `failed` の state machine、status='done' の row があれば handler skip して cached response 返却

## auth フロー

- `requireUser(role?)` (Server Component): `auth.getUser()` → `public.users` SELECT (role, is_active, org_id, onboarded_at) → 不一致は `/403` redirect
- `requireApiUser(role?)` (Route Handler): 同上、ただし redirect ではなく `AuthError(401|403)` throw。`defineRoute` の catch で JSON 化
- `AppUser.orgId`: 全 callsite で `user.orgId` を参照 (DEFAULT_ORG_ID hardcode は撤去済、Round4 + Round2 P1)
- Round 2 P1 E2E bypass: `E2E_BYPASS_AUTH=true` + `NODE_ENV !== 'production'` 限定で固定 mock user を返す (Playwright のため)

## 監査チェーン (audit_logs)

- 全業務イベントは `appendAudit({orgId, actorUserId, action, resourceType, resourceId, payload})` 経由で `audit_logs` に追記
- BEFORE INSERT trigger `audit_logs_compute_hash()` が `prev_hash = 同 org の直前 row.row_hash` を引き、`row_hash = sha256(prev_hash | action | resource_type | resource_id | payload | created_at)` を計算
- RLS で SELECT は manager/admin/legal のみ、`revoke insert,update,delete from authenticated, anon` で append-only 強制
- 改ざん検知: `select ... order by id` で chain を再計算し DB の `row_hash` と突合 (定期 cron で WORM 比較、P2)

## 共有リンク (share_links)

- token 生成: `crypto.randomBytes(32).toString('base64url')` (URL に平文)
- DB 保管: `token_sha256 = sha256(token)` のみ。平文は保存しない (L-6 準拠)
- `password_hash` は argon2id (P2)、`ip_allowlist inet[]` で IP 制限可能
- `expires_at` 必須、有効期限切れは Edge Function で即拒否
- click 時に audit_logs に追記 + `click_count` インクリメント
- 公開 endpoint は `apps/web/src/app/share/[token]/route.ts` (P2)、middleware の `PUBLIC_PREFIXES = ['/share/']` で auth 免除

## Migration 一覧 (0001〜0040)

| # | テーマ |
|---|---|
| 0000 | extensions / pg_cron / pgmq 初期化 |
| 0001 | init schema (users / contacts / meetings / recordings / knowledge_embeddings) |
| 0002 | trigger (updated_at, embedding queue 連動) |
| 0003 | RLS P1 baseline |
| 0004 | RPC `match_knowledge` (sensitivity prefilter + HNSW) |
| 0005 | auth.users → public.users 同期 |
| 0006 | org_id 追加 (default `00000000-...-001`) |
| 0007 | P1 extended tables (companies / meeting_attendees / search_queries) |
| 0008 | audit_logs (chain hash) |
| 0009 | idempotency_keys |
| 0010 | feature_flags |
| 0011 | recordings.sensitivity (public/internal/sensitive/restricted) |
| 0012 | RLS v2 (manager/admin gate) |
| 0013 | pgmq idempotent send |
| 0014 | match_knowledge v2 (filter_source_types) |
| 0015 | users.role 自己昇格防止 trigger |
| 0016 | meeting_attendees indexes |
| 0017 | check_score CHECK 制約 |
| 0018 | notifications type check |
| 0019 | FK ON DELETE policies |
| 0020 | vector extension relocate |
| 0021 | sample data seeds |
| 0022 | share_links |
| 0023 | RPC update_recording_insights |
| 0024 | user_handedness |
| 0025 | auth sync v2 |
| 0026 | current_org_id() fail-closed |
| 0027 | Phase2 chain partition placeholder |
| 0028 | users.onboarded_at |
| 0029 | consent_logs |
| 0030 | onboarding hardening |
| 0031 | onboarding polish |
| 0032 | users self-select fallback |
| 0033 | org_id NULL fallback |
| 0034 | contacts phase2 (review_status, business_card_image_hash) |
| 0035 | storage business-cards bucket + RLS |
| 0036 | meetings phase2 (next_action, win_probability, stage_history) |
| 0037 | search_logs (search_queries / search_clicks) |
| 0038 | Round2 storage fix |
| 0039 | Round3 storage SELECT strict |
| 0040 | BM25 search_tsv (recordings/meetings/contacts) + GIN |

## 観測性

- Sentry (web + worker)、release は `RENDER_GIT_COMMIT` 自動注入
- request_id propagation: `x-request-id` ヘッダ + child logger + pgmq payload
- Prometheus metrics (`/metrics`): jobs_processed_total / job_duration_seconds / pgmq_queue_depth / llm_tokens_total / llm_cost_usd_total / http_*
- `/readyz`: DB+pgmq+R2+Sentry 並列ping、1.5sタイムアウト、503 返却
- pgmq 詰まり: `pgmq.metrics()` を pg_cron で5分毎チェック → Slack alert (P2)
- Anthropic tokens/sec: llm_usage_logs (P2) で集計

## Phase2 マルチテナント切替手順

Phase 1 はシングルテナント運用 (default org_id `00000000-0000-0000-0000-000000000001`)。
Round 2 P1 で web 側の全 callsite (contacts INSERT/UPDATE, companies upsert, search org_id 解決) は
`user.orgId` を主参照するよう移行済。残る切替手順:

1. **`current_org_id()` を fail-closed 化** (0026 で実施済み): `app.org_id` GUC 未設定時は NULL 返却
2. **policy 句の二段ガード化**: 全 `using (org_id = current_org_id())` を `using (org_id = current_org_id() and current_org_id() is not null)` に書換 (新規 migration)
3. **default DROP**: 全テーブルの `default '00000000-...-001'::uuid` を DROP (NOT NULL は維持)
4. **`app.org_id` 強制**: middleware で `set_config('app.org_id', user.org_id, true)` を毎リクエスト発行 (`apps/web/src/lib/supabase/server.ts` で transaction-local)
5. **audit_logs chain partition**: 既存の P1 期 chain は default org_id 配下に集約済み。P2 cutover 時は `select ... where org_id = '<new-org>' order by created_at` で **new org 単位の独立 chain** が始まる。cross-org の chain 連続性は意図的に切断する (org A の admin が org B の row を改ざんできない設計)。
6. **`partial unique index`**: `audit_logs (org_id, id)` を新 org 単位の partition 化、`row_hash` を含む `chain_seq SERIAL` を `(org_id, chain_seq) UNIQUE` で振り直し (P2)。

## E2E test (Playwright)

- `apps/web/tests/e2e/*.spec.ts` を Playwright で実行 (`pnpm --filter @ksp/web test:e2e`)
- 認証は `E2E_BYPASS_AUTH=true` env で middleware を skip + `requireUser` が固定 mock user を返す方式
  - 固定値: id=`E2E_USER_ID` (default `00000000-0000-0000-0000-0000000000aa`), role=`E2E_USER_ROLE` (default `sales`), org_id=`E2E_ORG_ID` (default DEFAULT_ORG_ID)
  - production では env ガードで完全に無効化される
- 既存 spec:
  - `smoke.spec.ts`: ホームレンダリング + skip link focus
  - `contacts-upload-flow.spec.ts`: D&D → 進捗 → /contacts 表示 (Round 2 P1)
  - `meetings-stage-flow.spec.ts`: /meetings/new → 一覧 → kbd DnD → stage_history 確認 (Round 2 P1)

## まだ実装していない領域

| 機能 | Phase | 場所 |
|---|---|---|
| 通知 (Realtime) | P1 | apps/web/src/app/api/notifications |
| 日程調整 (Gmail Pub/Sub) | P2 | T-023〜027 |
| ナレッジ / 引き継ぎ | P2 | T-028〜030 |
| ロープレ / マネージャーDB | P3 | T-036〜041 |
