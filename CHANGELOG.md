# Changelog

## 0.1.0 — 2026-05-09

### Added — Phase 1 Week 1 scaffold
- pnpm + Turborepo monorepo (`apps/{web,worker}`, `packages/{db,shared}`)
- `apps/web` Next.js 15 App Router + Tailwind + Supabase SSR
  - `/login` Google OAuth (Calendar/Gmail scopes)
  - `/auth/callback` code exchange
  - `/dashboard` requireUser ガード
  - `middleware.ts` 未認証 → `/login` リダイレクト
- `apps/worker` Hono on `@hono/node-server`
  - `POST /webhooks/zoom` — Zoom URL Validation + 署名検証 (`x-zm-signature` HMAC-SHA256, ts ±5min)
  - `/healthz` Render ヘルスチェック
- `packages/db` Drizzle schema for 10 P1 tables
  - users, user_oauth_tokens, companies, contacts, contact_duplicates,
    meetings, meeting_attendees, recordings, knowledge_embeddings, notifications
- 手書きSQL migrations (`packages/db/src/migrations/manual/`)
  - `0000_setup.sql` — pgvector / pgmq / pg_cron / supabase_vault + `set_updated_at()` 関数
  - `0002_triggers_p1.sql` — updated_at trigger 紐付け + HNSW index
  - `0003_rls_p1.sql` — RLS policy (sales/cs/manager/admin マトリクス)
  - `0004_rpc_match_knowledge.sql` — `match_knowledge()` SECURITY DEFINER RPC
  - `0005_auth_sync_trigger.sql` — auth.users → public.users 自動プロビジョン
- `packages/shared` zod ジョブペイロード + 定数 (cost cap, rate limits)
- `render.yaml` 2-service blueprint (Web + Worker)
- `.env.example` 全 P1 環境変数

### Pending — Phase 1 Week 2-4
- T-002 Supabase 新規プロジェクト作成 (手動)
- T-007〜010 名刺取込 UI / OCR Worker
- T-011 (受信のみ実装済) → T-012 録画処理 Worker / T-013 Embedding Worker / T-014 商談一覧
- T-015 ハイブリッド検索 / T-016 検索 UI
- T-017 ユーザー管理 / T-018 通知 / T-019 統合テスト

### References
- 設計書: `../営業、CS統合管理システム＿ナレッジさん/sales_platform_design_spec_v2.xlsx` (v2.2 / 27 シート)
- 09_implementation_plan シート準拠
