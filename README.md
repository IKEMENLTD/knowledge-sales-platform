# Knowledge Sales Platform (KSP)

営業ナレッジ &amp; 商談アーカイブ・プラットフォーム  
（株式会社ナレッジホールディングス向け / 設計仕様書 v2.2）

> 設計書: `../営業、CS統合管理システム＿ナレッジさん/sales_platform_design_spec_v2.xlsx` (27 シート)

---

## 構成

```
knowledge-sales-platform/
├── apps/
│   ├── web/        # Next.js 15 (App Router) + Tailwind + shadcn/ui
│   └── worker/     # Hono + pgmq consumer (Render Background Worker)
├── packages/
│   ├── db/         # Drizzle ORM schema + 手書きSQL migrations (RLS / RPC)
│   └── shared/     # zod schemas / 定数 / 型定義 (web↔worker 共有)
├── render.yaml     # Render 2-service デプロイ
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

## クイックスタート

### 1. 前提
- Node.js 20.18+ (nvm/volta 等)
- pnpm 9.12+ (`corepack enable`)
- Supabase プロジェクト (Pro plan、ap-northeast-1 推奨)

### 2. 依存導入
```bash
corepack enable
pnpm install
```

### 3. Supabase 新規作成 (まだの場合)
1. https://supabase.com/dashboard で新規プロジェクト作成 (Region: Tokyo)
2. SQL Editor で `packages/db/src/migrations/manual/0000_setup.sql` を実行
   - pgvector / pgmq / pg_cron / supabase_vault 拡張を有効化
3. ローカル `.env.local` に Project URL / anon key / service_role key / DATABASE_URL を投入

### 4. スキーマ適用
```bash
pnpm db:generate      # Drizzle スキーマから 0001_init.sql 自動生成
pnpm db:migrate       # 0001_init.sql を Supabase に適用
# その後、SQL Editor で以下を順に実行:
#   0002_triggers_p1.sql       (updated_at trigger + HNSW index)
#   0003_rls_p1.sql            (Row Level Security policies)
#   0004_rpc_match_knowledge.sql (ベクトル検索 RPC)
#   0005_auth_sync_trigger.sql (auth.users → public.users 同期)
```

### 5. Google OAuth 設定
- https://console.cloud.google.com/apis/credentials で OAuth Client 作成
- Authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
- Supabase Dashboard → Authentication → Providers → Google を有効化
- Scopes に Calendar / Gmail を追加するため、Supabase の Google Provider 設定で `additional_scopes` を `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send` に設定

### 6. 開発サーバ起動
```bash
pnpm dev          # web (3000) + worker (8080) を並行起動
```

---

## Phase 1 実装ロードマップ (Week 1-4)

設計書 `09_implementation_plan` シート準拠。

| Week | タスク | 状態 | 場所 |
|---|---|---|---|
| W1 | T-001 monorepo init | ✅ | (本scaffold) |
| W1 | T-002 Supabase project | ⏳ | Supabase Dashboard で手動 |
| W1 | T-003 Drizzle schema | ✅ | `packages/db/src/schema/*` |
| W1 | T-004 RLS+RPC migrations | ✅ (P1分) | `packages/db/src/migrations/manual/0003-0005` |
| W1 | T-005 Auth基盤 | ✅ (skeleton) | `apps/web/src/lib/auth/`, `middleware.ts` |
| W1 | T-006 Render deploy | ✅ (config) | `render.yaml` |
| W2 | T-007 名刺アップロードUI | ⏳ | `apps/web/src/app/contacts/import/` (未) |
| W2 | T-008 モバイル名刺撮影 | ⏳ | `apps/web/src/app/mobile/scan/` (未) |
| W2 | T-009 OCR Worker | ⏳ | `apps/worker/src/jobs/process_business_card.ts` (未) |
| W2 | T-010 名刺レビュー画面 | ⏳ | `apps/web/src/app/contacts/[id]/review/` (未) |
| W3 | T-011 Zoom Webhook | ✅ (受信のみ) | `apps/worker/src/routes/webhooks.ts` |
| W3 | T-012 録画処理 Worker | ⏳ | `apps/worker/src/jobs/process_recording.ts` (未) |
| W3 | T-013 Embedding 生成 Worker | ⏳ | `apps/worker/src/jobs/generate_embeddings.ts` (未) |
| W3 | T-014 商談一覧/詳細 | ⏳ | `apps/web/src/app/meetings/` (未) |
| W4 | T-015 ハイブリッド検索 API | ⏳ | `apps/web/src/app/api/search/route.ts` (未) |
| W4 | T-016 検索 UI | ⏳ | `apps/web/src/app/search/` (未) |
| W4 | T-017 ユーザー管理 | ⏳ | `apps/web/src/app/admin/users/` (未) |
| W4 | T-018 通知システム | ⏳ | (未) |
| W4 | T-019 Phase1 統合テスト | ⏳ | (未) |

> ✅ scaffold済 / ⏳ 未着手 / 次セッションで `T-007 から実装着手` 等で再開可

---

## デプロイ (Render)

`render.yaml` を repo に commit すると、Render Dashboard で「Blueprint」として読み込めます。

```bash
# 1. GitHubにpush (IKEMENLTD/knowledge-sales-platform)
# 2. Render Dashboard → New → Blueprint → リポジトリ選択
# 3. 各サービスの環境変数を投入 (sync: false の項目は手動)
# 4. ksp-worker の URL を Zoom Marketplace の Webhook Endpoint に登録
```

---

## ディレクトリ詳細

### `apps/web/`
- App Router (Next.js 15.0)
- Supabase Auth (Google OAuth + Calendar/Gmail scopes)
- middleware で未認証リダイレクト
- API Route (`/api/*`)、Server Actions

### `apps/worker/`
- Hono + Node Adapter (`@hono/node-server`)
- `/webhooks/zoom` — recording.completed 受信
- `/healthz` — Render ヘルスチェック
- 将来: pgmq からの非同期ジョブ消費 (`src/jobs/`)

### `packages/db/`
- Drizzle ORM スキーマ (snake_case 自動変換)
- 手書きSQL migrations (`src/migrations/manual/`)
  - `0000_setup.sql` 拡張 + pgmq キュー作成
  - `0002_triggers_p1.sql` updated_at + HNSW
  - `0003_rls_p1.sql` Row Level Security
  - `0004_rpc_match_knowledge.sql` ベクトル検索 RPC
  - `0005_auth_sync_trigger.sql` auth↔users 同期

### `packages/shared/`
- pgmq ジョブペイロードの zod schema (web↔worker で共有)
- 定数 (チャンクサイズ、レート制限、コストキャップ等)

---

## トラブルシューティング

- `DATABASE_URL` は **transaction pooler (`:6543`)** 必須。session pooler `:5432` では Drizzle migrate が落ちる。
- Supabase のホスト名は `aws-1-ap-northeast-1.pooler.supabase.com`。`aws-0-` は旧形式で DNS 不可。
- Zoom Webhook 検証で `ZOOM_WEBHOOK_SECRET_TOKEN` が空だと URL Validation チャレンジに失敗する。
- pgvector の HNSW index 作成は数分かかる場合あり。Phase 1 ローンチ前に実データ20万行で `ef_search` ベンチ実測すること（仕様書 18_search_knowledge_quality）。

---

## 設計仕様書との対応表

| 仕様書シート | 実装場所 |
|---|---|
| 03_data_model | `packages/db/src/schema/` |
| 04_api_endpoints | `apps/web/src/app/api/` (P1 は T-015/017/018) |
| 05_jobs_queues | `packages/db/.../0000_setup.sql` (pgmq 作成) + `apps/worker/src/jobs/` |
| 07_llm_prompts | `apps/worker/src/lib/prompts/` (LP-01〜LP-04 は T-009/012/028 で追加) |
| 08_security_rls | `packages/db/src/migrations/manual/0003_rls_p1.sql` |
| 10_env_vars | `.env.example` + `render.yaml` |
| 11_tech_stack_libs | 各 `package.json` |

---

© 2026 IKEMENLTD / Knowledge Holdings
