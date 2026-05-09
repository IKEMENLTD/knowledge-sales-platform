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
- **Vault**: OAuth refresh_token / access_token は user_oauth_tokens.refresh_token_secret_id で参照、生trnsはVault側
- **R2 署名URL**: expires ≤ 300s。メールクリック時に再発行
- **Webhook secrets**: 90日ローテ (P2)、`ZOOM_WEBHOOK_SECRET_TOKEN` で署名検証

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
