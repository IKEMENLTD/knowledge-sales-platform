# Knowledge Sales Platform (KSP)

営業ナレッジ &amp; 商談アーカイブ・プラットフォーム  
（株式会社ナレッジホールディングス向け / 設計仕様書 v2.2 / 30 シート）

> 設計書本体: `docs/spec/sales_platform_design_spec_v2.xlsx`

---

## 構成

```
knowledge-sales-platform/
├── apps/
│   ├── web/        # Next.js 15 (App Router) + Tailwind + shadcn/ui
│   └── worker/     # Hono — Zoom webhook 受信 + pgmq consumer
├── packages/
│   ├── db/         # Drizzle ORM schema + 手書きSQL migrations 0000-0026 (RLS / RPC / Hash chain)
│   └── shared/     # zod schemas / 定数 / 型定義 (web↔worker 共有)
├── render.yaml     # Render 3-service Blueprint (web / ingress / worker)
├── .github/workflows/ # CI (check/sql-syntax/build/e2e) + security (gitleaks/audit/CodeQL) + release
├── tests/e2e/      # playwright placeholder
├── scripts/apply_migrations.py # psycopg2 ledger + checksum + dry-run
├── docs/spec/      # 設計仕様書 v2.2
└── docs/           # ARCHITECTURE / SETUP_GOOGLE_OAUTH 他
```

### Render 3-service 構成
| サービス | type | 役割 |
|---|---|---|
| `ksp-web` | web | Next.js Web (App Router、`/api/health` 監視) |
| `ksp-ingress` | web | Hono Webhook 受信 (`/webhooks/zoom`、`/healthz`) |
| `ksp-worker` | worker | pgmq consumer 常駐 (HTTP port なし) |

3 サービスとも `region: tokyo` / `plan: standard`、CI gate 通過後に main へ merge → autoDeploy。

---

## クイックスタート

### 1. 前提
- Node.js 20.18+ (`.nvmrc` 参照、nvm/volta 等)
- pnpm 9.12+ (`corepack enable`)
- Python 3.11+ (`pip install psycopg2-binary` for migrations)
- Supabase プロジェクト (**Pro plan必須**、Region: Tokyo)

### 2. 依存導入
```bash
corepack enable
pnpm install
```

### 3. Supabase 新規作成

> **Supabase 拡張は事前に Dashboard で ON にする必要あり (`0000_setup.sql` 実行前)**

1. https://supabase.com/dashboard で新規プロジェクト作成 (Region: **Tokyo (ap-northeast-1)**)、Pro plan 以上を選択
2. **Database → Extensions** で以下を順に **有効化**:
   | 拡張 | 用途 | 必須 |
   |---|---|---|
   | `pgcrypto` | `gen_random_uuid()` | デフォルトで ON |
   | `vector` | pgvector ベクトル検索 | 必須 |
   | `pgmq` | ジョブキュー (Pro plan限定) | 必須 |
   | `pg_cron` | 定期ジョブ (Pro plan限定) | 必須 |
   | `supabase_vault` | OAuthトークン暗号化 | 必須 |
3. ローカル `.env.local` を作成 (`.env.example` をコピー):
   - `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>` (worker 専用)
   - `DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`

### 4. スキーマ適用 (27 migrations)
```bash
python scripts/apply_migrations.py --dry-run   # syntax + checksum 確認
python scripts/apply_migrations.py             # 適用
python scripts/apply_migrations.py --only 0023_rpc_update_recording_insights.sql  # 単発
```
- `public.schema_migrations` ledger に sha256 checksum 記録 → 再実行は適用済みをスキップ
- 本番 (`DATABASE_URL` に `supabase.co` 含む or `RENDER_ENV=production`) は確認プロンプト、`--yes` で skip

スキーマ更新時 (将来):
```bash
pnpm db:generate   # Drizzle で 新 migration 自動生成
pnpm db:migrate    # 適用
```

### 5. Google OAuth 設定
詳細は [`docs/SETUP_GOOGLE_OAUTH.md`](docs/SETUP_GOOGLE_OAUTH.md)。要約:
- Google Cloud Console で Web Application OAuth Client を作成
- Authorized redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
- Supabase Dashboard → Authentication → Providers → Google を有効化、Client ID / Secret を投入
- `.env.local` の `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` にも投入 (worker側 Calendar/Gmail API 用)

### 6. 開発サーバ起動
```bash
pnpm dev          # turbo 並行: web (3000) + worker (8080)
pnpm typecheck    # 4 packages
pnpm test         # vitest 28 tests (worker 19 + shared 9)
pnpm e2e          # playwright (placeholder)
```

---

## Phase 1 実装ロードマップ (Week 1-4)

設計書 `09_implementation_plan` シート準拠。

| Week | タスク | 状態 | 場所 |
|---|---|---|---|
| W1 | T-001 monorepo init | ✅ | (本scaffold) |
| W1 | T-002 Supabase project | ✅ | project ref `<your-project-ref>` / migrations 0000-0026 適用済 |
| W1 | T-003 Drizzle schema | ✅ | `packages/db/src/schema/*` (P1+P2基盤) |
| W1 | T-004 RLS+RPC migrations | ✅ | `packages/db/src/migrations/manual/0003,0008,0012,0014,0023` |
| W1 | T-005 Auth基盤 | ✅ | `apps/web/src/lib/auth/`, `middleware.ts`, OAuth scope 最小化 |
| W1 | T-006 Render deploy | ✅ | `render.yaml` (3-service blueprint) |
| W2 | T-007 名刺アップロードUI | ⏳ | `apps/web/src/app/contacts/import/` (placeholder のみ) |
| W2 | T-008 モバイル名刺撮影 | ⏳ | `apps/web/src/app/mobile/scan/` (placeholder のみ) |
| W2 | T-009 OCR Worker | ⏳ | `apps/worker/src/jobs/process_business_card.ts` (未) |
| W2 | T-010 名刺レビュー画面 | ⏳ | `apps/web/src/app/contacts/[id]/review/` (placeholder のみ) |
| W3 | T-011 Zoom Webhook | ✅ | `apps/worker/src/routes/webhooks.ts` (受信+pgmq enqueue+jobs_inflight dedupe+audit) |
| W3 | T-012 録画処理 Worker | ⏳ | `apps/worker/src/jobs/process_recording.ts` (未) |
| W3 | T-013 Embedding 生成 Worker | ⏳ | `apps/worker/src/jobs/generate_embeddings.ts` (未) |
| W3 | T-014 商談一覧/詳細 | ⏳ | `apps/web/src/app/meetings/` (placeholder のみ) |
| W4 | T-015 ハイブリッド検索 API | ⏳ | `apps/web/src/app/api/search/route.ts` (未) |
| W4 | T-016 検索 UI | ⏳ | `apps/web/src/app/search/` (placeholder のみ) |
| W4 | T-017 ユーザー管理 | ⏳ | `apps/web/src/app/admin/users/` (placeholder のみ) |
| W4 | T-018 通知システム | ⏳ | (未) |
| W4 | T-019 Phase1 統合テスト | ⏳ | tests/e2e/ で playwright 実装 |

> ✅ 完成 / ⏳ 未着手 / 次セッションで `T-007 から実装着手` 等で再開可

---

## デプロイ (Render)

`render.yaml` を repo に commit すると、Render Dashboard で「Blueprint」として 3 service 一括作成可能。

```bash
# 1. GitHub にpush (IKEMENLTD/knowledge-sales-platform)
# 2. Render Dashboard → New → Blueprint → リポジトリ選択
# 3. 各サービスの環境変数を投入 (sync: false の項目は手動)
# 4. ksp-ingress の Webhook URL を Zoom Marketplace に登録 (.../webhooks/zoom)
# 5. CI gate (.github/workflows/ci.yml) 通過後 main merge で autoDeploy
```

---

## ディレクトリ詳細

### `apps/web/`
- App Router (Next.js 15)、React 19 RC、Tailwind 3 + shadcn/ui
- Supabase Auth Google OAuth (Calendar.events のみ最小スコープ、Gmail は P2 incremental)
- middleware: 未認証 → /login redirect、PUBLIC_PATHS 拡張、`/api/*` rate limit
- 全 protected セクションに `loading.tsx` + `error.tsx`
- Phase1 必須 SC 17 placeholder 画面
- `requireUser({role})` で role gate、`/403?reason=...` 透明誘導
- PWA manifest + viewport + skip link + focus-visible + next-themes dark mode
- shadcn primitives (button/input/label/card/dialog/sheet/alert/submit-button)
- API: `/api/health`, `/api/csp-report`
- Sentry: client/server/edge config + instrumentation

### `apps/worker/`
- Hono + `@hono/node-server`
- Routes: `POST /webhooks/zoom` (URL Validation + HMAC + 64KB cap + per-IP rate limit + dual-secret rotation + jobs_inflight dedupe + appendAudit), `/healthz`, `/readyz` (DB+pgmq+R2+Sentry 並列ping), `/metrics` (Prometheus)
- Lib: sentry / logger / metrics / cost-guard / pgmq / idempotency / rate-limit / audit
- request_id propagation (`x-request-id` ヘッダ + child logger + pgmq payload)
- vitest 19 tests
- 将来: pgmq job consumer は `src/jobs/`

### `packages/db/`
- Drizzle ORM スキーマ (snake_case 自動変換、全テーブル `org_id` 統一)
- 手書きSQL migrations (27 本、`src/migrations/manual/`):
  - `0000_setup.sql` 拡張 (pgvector/pgmq/pg_cron/Vault) + helpers
  - `0001_init_schema.sql` 全テーブル DDL
  - `0002_triggers_p1.sql` updated_at + HNSW (drop trigger if exists で冪等)
  - `0003_rls_p1.sql` 旧 RLS (0012 で上書き)
  - `0004_rpc_match_knowledge.sql` 旧 RPC (0014 で上書き)
  - `0005_auth_sync_trigger.sql` 旧 auth sync (0025 で上書き)
  - `0006_add_org_id.sql` 全 既存テーブルに org_id 追加 (T-1 v2.1 CRIT)
  - `0007_p1_extended_tables.sql` recording_segments/stages, business_card_images, contact_memos, offline_queue, non_card_attachments, sync_failure_log, data_residency_config, recent_views, autosave_drafts
  - `0008_audit_logs.sql` audit_logs + sha256 hash chain trigger + append-only RLS
  - `0009_idempotency_keys.sql` + jobs_inflight
  - `0010_feature_flags.sql` + ab_test_assignments
  - `0011_recordings_sensitivity.sql` sensitivity tier 列 + RLS prefilter
  - `0012_rls_v2.sql` 全 policy を `org_id = current_org_id()` で書き換え
  - `0013_pgmq_idempotent.sql` pgmq.create を do$$ exception で冪等化
  - `0014_match_knowledge_v2.sql` sensitivity/visibility/org_id prefilter + ef_search=64
  - `0015_users_role_guard.sql` 自己昇格防止 BEFORE UPDATE trigger
  - `0016_meeting_attendees_indexes.sql` 部分 index
  - `0017_check_score_ranges.sql` ocr_confidence/match_score CHECK
  - `0018_notifications_type_check.sql` type CHECK
  - `0019_fk_on_delete_policies.sql` FK on delete restrict 統一
  - `0020_relocate_vector_extension.sql` (skip-on-error)
  - `0021_sample_data_seeds.sql` SAMPLE_DATA_SEED 用テーブル
  - `0022_share_links.sql` token sha256 + RLS + Drizzle schema
  - `0023_rpc_update_recording_insights.sql` insights 編集 RPC
  - `0024_user_handedness.sql` handedness 列
  - `0025_auth_sync_v2.sql` is_active default false (招待後 active 化)
  - `0026_current_org_id_failclosed.sql` GUC 未設定時 NULL 返却

### `packages/shared/`
- pgmq ジョブペイロードの zod schema (web↔worker で共有)
- 定数 (チャンクサイズ / cost cap / rate limits / OFFLINE_LIMITS / embeddingSourceType / notificationType / auditAction)
- vitest 9 tests

---

## トラブルシューティング

### Migration 関連

#### `DATABASE_URL` 接続エラー
- transaction pooler `:6543` 必須。session pooler `:5432` では Drizzle migrate が落ちる。
- Supabase のホスト名は `aws-1-ap-northeast-1.pooler.supabase.com`。`aws-0-` は旧形式で DNS 不可。
- 新規プロジェクトでは `db.<ref>.supabase.co` (5432 直結) は IPv6 only で繋がらない。

#### `extension "pgmq" is not available`
Supabase Free plan では pgmq / pg_cron が使えません。Pro plan に upgrade してから Dashboard → Extensions で個別 ON。

#### Migration が部分適用で止まった
1. `public.schema_migrations` で適用済みファイルを確認:
   ```sql
   select filename, applied_at, checksum from public.schema_migrations order by filename;
   ```
2. 失敗箇所を psql で手動 fix
3. 単発再実行:
   ```bash
   python scripts/apply_migrations.py --only <failed_filename>.sql
   ```
4. ledger の checksum drift warning が出る場合、ファイルを編集していないか確認 (drift = 編集された証拠)

#### 本番 DB 直接適用したくない (CI で dry-run のみ)
```bash
DATABASE_URL='postgresql://localhost/test' python scripts/apply_migrations.py --dry-run
```
GitHub Actions の `sql-syntax` job で pgvector/pgvector:pg16 image を service container に立てて自動 dry-run 実行している。

### Webhook 関連

- Zoom Webhook 検証で `ZOOM_WEBHOOK_SECRET_TOKEN` が空だと URL Validation チャレンジに失敗
- `ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS` を併設すれば 90 日 dual-window rotation 中も停止せず受信可能

### Pgvector ベンチ

HNSW index 作成は数分。Phase 1 ローンチ前に実データ20万行で `ef_search` を実測調整 (仕様書 18_search_knowledge_quality)。`0014_match_knowledge_v2.sql` 内で `set_config('hnsw.ef_search','64',true)` をsession 局所適用済み。

---

## 運用 SOP

### Secret rotation (90 日サイクル)

| ステップ | 手順 |
|---|---|
| 1. 新規生成 | Zoom Marketplace App で新 Secret Token を発行 (旧は同時に有効) |
| 2. _PREVIOUS 投入 | Render env で `ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS` に **旧** secret を投入 |
| 3. 新 secret 投入 | `ZOOM_WEBHOOK_SECRET_TOKEN` を **新** secret に上書き |
| 4. dual-window 期間 (7日) | 旧/新 両方で署名検証通過、Zoom 側設定変更 |
| 5. 旧無効化 | Zoom Marketplace で旧 Secret 削除、Render env から `_PREVIOUS` も削除 |

`webhook` ハンドラは `secrets.some(verifyWith)` で OR 評価しているので、3-5 のどの段階でも停止しない。

### DR (Disaster Recovery)

| 項目 | 値 | 備考 |
|---|---|---|
| RPO | 15 分 | Supabase WAL archive |
| RTO | 4 時間 | ap-northeast-3 (大阪) backup region への手動 fail-over |
| PITR window | 7 日 | `PITR_WINDOW_DAYS` env 連動 |
| Soft delete grace | 30 日 | `SOFT_DELETE_GRACE_DAYS` env 連動 |
| 復旧訓練 | 四半期 1 回 | Q1: 1月 / Q2: 4月 / Q3: 7月 / Q4: 10月 |

#### R2 versioning + Object Lock

```bash
# Cloudflare R2 dashboard or wrangler:
wrangler r2 bucket create ksp-recordings --location=APAC --object-lock=GOVERNANCE
# Versioning は API 経由で別途 enable
```

監査要件 (16_compliance_legal): 録画原本は **GOVERNANCE mode、retention 7 年**。

#### 障害時 runbook
1. Supabase Dashboard → **Database → Backups** で日次 PITR snapshot を Tokyo region に restore
2. fail-over 必要時: Supabase Support に escalate (Pro plan SLA: 4h)
3. R2 cross-region replication が有効なら ap-northeast-3 から restore (オプション)
4. Edge Function/Worker は Render Dashboard で手動 redeploy (autoDeploy が落ちている場合)
5. 復旧確認: `pnpm e2e` の smoke test を本番に対し実行 (専用 .env)

---

## 設計仕様書との対応表

| 仕様書シート | 実装場所 |
|---|---|
| 03_data_model | `packages/db/src/schema/` (24 テーブル、全 org_id 付き) |
| 04_api_endpoints | `apps/web/src/app/api/` (P1 は T-015/017/018 で本実装) |
| 05_jobs_queues | `0013_pgmq_idempotent.sql` (3キュー) + `apps/worker/src/jobs/` |
| 07_llm_prompts | `apps/worker/src/lib/prompts/` (LP-01〜LP-04 は T-009/012/028 で追加) |
| 08_security_rls | `0003_rls_p1.sql` + `0008` + `0012_rls_v2.sql` (RLS全体) + `0014` (RPC) + `0015` (role guard) |
| 10_env_vars | `.env.example` + `render.yaml` + `apps/{web,worker}/src/{lib/}env.ts` |
| 11_tech_stack_libs | 各 `package.json` (workbox/opencv-wasm/react-camera-pro は T-007 で追加予定) |
| 14_state_machines | recordings + recording_stages + idempotency_keys + jobs_inflight |
| 16_compliance_legal | audit_logs (hash chain) + share_links (sha256) + data_residency_config + DR runbook |
| 17_offline_mobile | manifest.ts + viewport + sw.js placeholder + handedness + IndexedDB skeleton |
| 19_onboarding_initial | /onboarding placeholder + auth_sync_v2 (is_active default false) |
| 21_a11y_i18n | skip link + focus-visible + sr-only-focusable + aria-live + Noto Sans JP |
| 23_observability_alerts | Sentry init + Prometheus metrics + /readyz with deps + reqId propagation |
| 24_acceptance_test_matrix | tests/e2e/auth.spec.ts placeholder + worker vitest 19 tests |
| 26_user_offboarding_sop | users.is_active + on delete restrict (FK) + ownership 移管準備 |

---

© 2026 IKEMENLTD / Knowledge Holdings
