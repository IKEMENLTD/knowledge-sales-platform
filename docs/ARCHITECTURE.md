# Architecture (Phase 1 baseline)

```
┌────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 15 / Render Web Service)                   │
│   ├─ App Router                                                │
│   ├─ Supabase SSR (cookie session)                             │
│   ├─ Server Actions / Route Handlers (/api/*)                  │
│   └─ middleware.ts (未認証→/login)                             │
└──────────┬────────────────────────────────────────┬─────────────┘
           │ supabase-js (anon)                     │ supabase-js (service role)
           │                                        │ ※ Route Handlerからは禁止
           ▼                                        ▼
┌────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│   ├─ Postgres + pgvector + pgmq + pg_cron + Vault              │
│   │    ├─ public.users / contacts / meetings / recordings ...  │
│   │    ├─ knowledge_embeddings (HNSW, vector(1536))            │
│   │    └─ pgmq.q_process_business_card / q_process_recording   │
│   ├─ Auth (Google OAuth + Calendar/Gmail scopes)               │
│   ├─ Storage (business-cards bucket)                           │
│   └─ RLS: sales/cs/manager/admin マトリクス                    │
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

## データフロー (T-007〜T-014)

### 名刺取込 (T-007〜T-010)
1. PC `/contacts/import` または モバイル `/mobile/scan` で画像 D&D / 撮影
2. Supabase Storage `business-cards/<userId>/<contactId>.jpg` に保存
3. `contacts` 行を pending で作成 (owner_user_id=auth.uid)
4. `pgmq.send('process_business_card', { contactId, storageKey })`
5. Worker 消費 → Vision Document AI → Claude PROMPT-02 で正規化 → 重複検知 → contacts UPDATE
6. Realtime subscription で UI に通知

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
- `/api/search?q=...` で BM25 (Postgres tsvector) と vector top-k を並列取得
- RRF (Reciprocal Rank Fusion) でリランク → リソース別グループ化
- `match_knowledge()` RPC は SECURITY DEFINER で sensitivity prefilter

## セキュリティ境界

- **anon key**: `NEXT_PUBLIC_*` のみブラウザ露出。RLS 経由で読み書き
- **service_role key**: worker 専用。Next.js Route Handler では禁止 (08_security_rls v2.1 hardening)
- **Vault**: OAuth refresh_token / access_token は user_oauth_tokens.refresh_token_secret_id で参照、生tokenはVault側
- **R2 署名URL**: expires ≤ 300s。メールクリック時に再発行 + GOVERNANCE Object Lock 7年
- **Webhook secrets**: 90日 dual-window rotation (`ZOOM_WEBHOOK_SECRET_TOKEN` + `_PREVIOUS`)
- **CSP / Permissions-Policy**: `next.config.mjs` で all path に適用、`/api/csp-report` で違反集計→Sentry forward
- **Rate limit**: web `/api/*` 60rpm、worker webhook 30rpm/IP、in-memory token bucket
- **users.role 変更**: 0015 trigger で admin のみ許可 (自己昇格防止)
- **OAuth scope**: 初回サインインは Calendar.events のみ最小化、Gmail は P2 incremental authorization で追加同意

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

## Phase2 マルチテナント切替手順

Phase 1 はシングルテナント運用 (default org_id `00000000-0000-0000-0000-000000000001`)。Phase 2 で複数 org 化する手順:

1. **`current_org_id()` を fail-closed 化** (0026 で実施済み): `app.org_id` GUC 未設定時は NULL 返却
2. **policy 句の二段ガード化**: 全 `using (org_id = current_org_id())` を `using (org_id = current_org_id() and current_org_id() is not null)` に書換 (新規 migration)
3. **default DROP**: 全テーブルの `default '00000000-...-001'::uuid` を DROP (NOT NULL は維持)
4. **`app.org_id` 強制**: middleware で `set_config('app.org_id', user.org_id, true)` を毎リクエスト発行 (`apps/web/src/lib/supabase/server.ts` で transaction-local)
5. **audit_logs chain partition**: 既存の P1 期 chain は default org_id 配下に集約済み。P2 cutover 時は `select ... where org_id = '<new-org>' order by created_at` で **new org 単位の独立 chain** が始まる。cross-org の chain 連続性は意図的に切断する (org A の admin が org B の row を改ざんできない設計)。
6. **`partial unique index`**: `audit_logs (org_id, id)` を新 org 単位の partition 化、`row_hash` を含む `chain_seq SERIAL` を `(org_id, chain_seq) UNIQUE` で振り直し (P2)。

## 観測性

- Sentry (web + worker)、release は `RENDER_GIT_COMMIT` 自動注入
- request_id propagation: `x-request-id` ヘッダ + child logger + pgmq payload
- Prometheus metrics (`/metrics`): jobs_processed_total / job_duration_seconds / pgmq_queue_depth / llm_tokens_total / llm_cost_usd_total / http_*
- `/readyz`: DB+pgmq+R2+Sentry 並列ping、1.5sタイムアウト、503 返却
- pgmq 詰まり: `pgmq.metrics()` を pg_cron で5分毎チェック → Slack alert (P2)
- Anthropic tokens/sec: llm_usage_logs (P2) で集計

## 観測性

- Sentry (web + worker)
- pgmq 詰まり: `pgmq.metrics()` を pg_cron で5分毎チェック → Slack alert
- Anthropic tokens/sec: llm_usage_logs (P2) で集計

## まだ実装していない領域

| 機能 | Phase | 場所 |
|---|---|---|
| 名刺取込 UI / OCR | P1 | apps/web/src/app/contacts/import + apps/worker/src/jobs |
| 録画処理 Worker | P1 | apps/worker/src/jobs/process_recording.ts |
| 商談一覧/詳細 | P1 | apps/web/src/app/meetings |
| ハイブリッド検索 | P1 | apps/web/src/app/api/search |
| 通知 (Realtime) | P1 | apps/web/src/app/api/notifications |
| 日程調整 (Gmail Pub/Sub) | P2 | T-023〜027 |
| ナレッジ / 引き継ぎ | P2 | T-028〜030 |
| ロープレ / マネージャーDB | P3 | T-036〜041 |
