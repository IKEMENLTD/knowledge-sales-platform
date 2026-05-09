# Changelog

## 0.2.0 — 2026-05-09 (Round 1 修正)

### Added/Changed — Round 1 5観点並列レビュー指摘の全面反映

Round 1 平均スコア 64.3/100 (Architect 78 / Security 61.5 / UX 62 / SRE 41.5 / CTO 78.5)
の指摘を 137 ファイル変更で適用。

#### DB schema/migration (GROUP A)
- **マルチテナント基盤**: 全 13 テーブルに `org_id uuid not null` 追加 (T-1)
  - 既存テーブル ALTER 経由で互換維持、`(org_id, ...)` 複合 index、HNSW を `(org_id, embedding)` 複合化
- **新規テーブル 13 本**:
  - `recording_segments` / `recording_stages` (sensitivity tier prefilter 対応)
  - `audit_logs` (append-only + prev_hash sha256 チェーン、RLS で UPDATE/DELETE 全 REVOKE)
  - `idempotency_keys` (TTL 24h、self-only RLS)
  - `feature_flags` + `ab_test_assignments`
  - `business_card_images` / `contact_memos` / `offline_queue` (UNIQUE user_id+idempotency_key)
  - `non_card_attachments` / `sync_failure_log` / `data_residency_config` / `recent_views` / `autosave_drafts`
- **recordings.sensitivity** tier 列 (public/internal/sensitive/restricted)
- **match_knowledge v2**: sensitivity/visibility/org_id metadata prefilter +
  `set local hnsw.ef_search = 64` を session 局所セット
- **users.role 自己昇格防止** BEFORE UPDATE trigger (admin のみ role 変更可)
- **pgmq.create 冪等化** (do$$ exception duplicate_table 吸収)
- **CHECK制約**: ocr_confidence/match_score ∈ [0,1]、percentage ∈ [0,100]
- **migration 0006-0017** 12 本追加 (全冪等、Supabase `arylptrsgxiwcnprzszo` に適用済み)
- **`scripts/apply_migrations.py` 改修**: `--dry-run` / `--only` / `--yes`、
  `public.schema_migrations` ledger、checksum drift warning、本番接続時の確認プロンプト

#### Web frontend (GROUP B)
- **PWA scaffold**: `app/manifest.ts` (standalone, start_url=/dashboard),
  `viewport export`, `public/sw.js` placeholder
- **A11y/i18n**: skip link (`sr-only-focusable`), `:focus-visible` ring,
  `prefers-reduced-motion`, `<html lang="ja">`, Noto Sans JP / Hiragino フォント
- **next-themes** ThemeProvider + dark mode (`darkMode: 'class'`)
- **shadcn/ui primitives 7 本**: button (CVA) / input / label / card / dialog / sheet / alert
- **AppShell + HeaderNav + signout** 導線、`bottomActionBar` slot 用意
- **Phase1 必須 placeholder 15 画面**: SC-06 (`/contacts/import`) / SC-08 / SC-09 /
  SC-11 / SC-15 / SC-16 / SC-17 (`/search`) / SC-27 (`/admin/users`, admin gate) /
  SC-32 / SC-33 / SC-34 / SC-35 / SC-61 (`/onboarding`) / SC-70 (`/403`) / SC-71 (`/offline`)
- **API**: `/api/health` (Render healthcheck) / `/api/csp-report` (Sentry forward)
- **Sentry**: client/server/edge config + `instrumentation.ts`
- **Security headers** (`next.config.mjs`): HSTS / X-Content-Type-Options /
  Referrer-Policy / Permissions-Policy(camera/mic self) / CSP-Report-Only
- **Auth**:
  - `requireUser({role})` で role gate / public.users JOIN
  - Google OAuth scope を Phase1 必須最小に縮小 (Calendar.events のみ、Gmail は P2 incremental)
  - `next` パラメータの open-redirect 防御 (`sanitizeNext`)
  - `/login` で error/next searchParams を UI 表示
- **env**: `SUPABASE_SERVICE_ROLE_KEY` を web から削除 (worker 専用)、`NODE_ENV` 必須化、
  `NEXTAUTH_*` 削除 (Supabase SSR 使用のため)

#### Worker (GROUP C)
- **Sentry init** + structured logging request id propagation
- **Prometheus metrics** (`/metrics`) — jobs_processed_total / job_duration_seconds /
  pgmq_queue_depth / llm_tokens_total / llm_cost_usd_total
- **cost-guard**: per-conversation $0.10 / per-meeting $0.50 cap、超過で throw + Sentry warn
- **Webhook 強化**:
  - 64KB body 上限、per-IP rate limit (in-memory token bucket)
  - zod validate 通過後 `meetings`/`recordings` upsert (ON CONFLICT DO NOTHING)
  - `pgmq.send('process_recording', ...)` で enqueue
  - 90日 dual-secret rotation (`ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS` も検証経路に追加)
- **pgmq wrapper** (`pgmq.send` RPC fallback to direct SQL)
- **Idempotency middleware** (`Idempotency-Key` ヘッダ → `idempotency_keys` UPSERT)
- **`/readyz`**: DB+pgmq+R2+Sentry 並列ping、1.5sタイムアウト、503 返却
- **tsc-alias** で `paths` を build 時に相対 import に書換 → `node dist/index.js` 単体起動可
- **vitest 19 tests**: HMAC 一致/不一致/ts skew/rotation/url validation/idempotency

#### DevOps (GROUP D)
- **render.yaml 3-service分離**:
  - `ksp-web` (type:web, Next.js, /api/health)
  - `ksp-ingress` (type:web, Hono webhook 受信)
  - `ksp-worker` (type:worker, pgmq consumer 常駐)
  - `region: tokyo` (ap-northeast-1 整合) / `plan: standard`
- **.github/workflows** 3 本:
  - `ci.yml` (check/sql-syntax/build/e2e)
  - `security.yml` (gitleaks/audit/CodeQL)
  - `release.yml` (Slack notify placeholder)
- **renovate.json** (weekly schedule、グループ化)
- **playwright.config.ts** + `tests/e2e/auth.spec.ts` (placeholder)
- **shared constants**: `rateLimits(env)` 関数化、`OFFLINE_LIMITS`、`auditAction` enum

### Verified
- `pnpm typecheck`: 4 packages 全成功
- `pnpm test`: 28 tests 全成功 (worker 19 + shared 9)
- `python scripts/apply_migrations.py --yes`: 18 migrations 全適用成功

---

## 0.1.0 — 2026-05-09

### Added — Phase 1 Week 1 scaffold
- pnpm + Turborepo monorepo (`apps/{web,worker}`, `packages/{db,shared}`)
- `apps/web` Next.js 15 App Router + Tailwind + Supabase SSR
- `apps/worker` Hono on `@hono/node-server` (Zoom URL Validation + 署名検証)
- `packages/db` Drizzle schema for 10 P1 tables
- 手書きSQL migrations 0000-0005 (extensions, schema, triggers, RLS, RPC, auth sync)
- `packages/shared` zod ジョブペイロード + 定数
- `render.yaml` 2-service blueprint
- `.env.example` 全 P1 環境変数

### References
- 設計書: `docs/spec/sales_platform_design_spec_v2.xlsx` (v2.2 / 30 シート)
- 09_implementation_plan シート準拠
