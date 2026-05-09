# SRE / DevOps Review — Round 1

- 対象: `C:\Users\ooxmi\Downloads\knowledge-sales-platform\` scaffold
- 設計書: `sales_platform_design_spec_v2.xlsx` (`09_implementation_plan` / `10_env_vars` / `12_cost_estimate` / `22_feature_flags_ab` / `23_observability_alerts`)
- 採点ルール: Critical -5 / High -3 / Medium -1 / Minor -0.5

---

## 採点サマリ

| # | 観点 | 配点 | 減点 | 得点 |
|---|---|---|---|---|
| 1 | 環境変数網羅 | 20 | -10.5 | 9.5 |
| 2 | Render デプロイ構成 | 15 | -10 | 5.0 |
| 3 | Migration 順序 / 冪等性 | 15 | -7 | 8.0 |
| 4 | 観測性 | 15 | -10 | 5.0 |
| 5 | CI / Lint / Test | 10 | -8 | 2.0 |
| 6 | Cost cap / Rate limit | 5 | -1.5 | 3.5 |
| 7 | Feature flags / Rollout | 5 | -3.5 | 1.5 |
| 8 | Secret rotation | 5 | -3 | 2.0 |
| 9 | Backup / DR | 5 | -3.5 | 1.5 |
| 10 | README / Runbook | 5 | -1.5 | 3.5 |
| **合計** | **100** | **-58.5** | **41.5** |

**総合: 41.5 / 100** — scaffold としての形は整っているが、本番運用観点では「観測性ゼロ・CI ゼロ・Region 違反・rotation 未設計・DR 未設計」と SRE 視点での本質課題が並ぶ。Phase 1 ローンチ前に最低 +30pt を取り戻す必要がある。

---

## 1. 環境変数網羅 (20点 → 9.5点 / -10.5)

10_env_vars シートの **P1 必須** を抜き出して `.env.example` / `apps/worker/src/env.ts` / `apps/web/src/lib/env.ts` と突合した結果。

### Critical (-5)

#### C1-1. `GOOGLE_OAUTH_CLIENT_ID/SECRET` が worker env.ts と render.yaml worker から欠落 (-5)
- **設計書 10_env_vars**: P1 必須 / web (Auth callback で web 側) — ただし Calendar/Gmail OAuth 実装 (T-021/023) では worker 側でも refresh token 交換に使う。
- **`.env.example:27-28`** にはあり、しかし
- **`apps/worker/src/env.ts`**: 完全に欠落 (worker は Calendar freebusy / Gmail history API を叩く設計のはずなのに OAuth client が無い)。
- **`render.yaml:53-91` (worker envVars)**: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` 無し。
- **`apps/web/src/lib/env.ts`**: web 側の zod schema にすら無し → 起動時 fail-fast 不能。
- **修正 diff (`apps/worker/src/env.ts` 末尾追加)**:
  ```ts
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_PUBSUB_TOPIC: z.string().optional(),     // P2
  ```
- **修正 diff (`render.yaml:91` 後ろに追加)**:
  ```yaml
      - key: GOOGLE_OAUTH_CLIENT_ID
        sync: false
      - key: GOOGLE_OAUTH_CLIENT_SECRET
        sync: false
  ```

### High (-3 × 1, -3 × 1 = -6)

#### H1-1. P1必須の追加変数が `.env.example` / zod schema から大量欠落 (-3)
10_env_vars v2 追加分の **P1 必須** で `.env.example` にも env.ts にも無いキー:
- `SAMPLE_DATA_SEED` (P1必須) — onboarding 初期シード
- `WEBHOOK_SECRET_GMAIL` (P1必須 / 90日ローテ)
- `PGMQ_VISIBILITY_TIMEOUT_DEFAULT` (P1) — worker のジョブ vt 計算に必須
- `MFA_REQUIRED_FOR_ROLES` (P2必須だが P1 で admin にも MFA 要件) — 仕様 23_observability_alerts に MFA違反監視あり
- **修正 diff (`.env.example` 末尾追加)**:
  ```bash
  # ----- P1必須 (v2追加)
  SAMPLE_DATA_SEED=onboarding-seed-2026q2
  WEBHOOK_SECRET_GMAIL=
  PGMQ_VISIBILITY_TIMEOUT_DEFAULT=300
  ```

#### H1-2. `worker/src/env.ts` の fail-fast が Production で破滅的デフォルトを許す (-3)
- **`apps/worker/src/env.ts:4`**: `NODE_ENV: z.enum(['development','test','production']).default('development')`
- 本番 Render で `NODE_ENV` 未設定 → `development` に倒れる。`logger.ts` がそれを見て pino-pretty 経由 = 余計な依存 + 構造化ログ崩壊。
- 本番で `development` フォールバックは事故の元 (Sentry が dev サンプリングで埋もれる)。`render.yaml:54` で `NODE_ENV=production` 明示しているとはいえ、env.ts 側でも assertion が必要。
- **修正 diff (`apps/worker/src/env.ts:4`)**:
  ```ts
  NODE_ENV: z.enum(['development', 'test', 'production']),  // default 削除 → 必須化
  ```
- 同様に `apps/web/src/lib/env.ts:8` も削除推奨。

### Medium (-1 × 1.5)

#### M1-1. web env.ts に SUPABASE_SERVICE_ROLE_KEY を `.optional()` で許容 (-1)
- **`apps/web/src/lib/env.ts:6`**: `SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional()`
- `render.yaml:31` では web に `sync: false` で投入する設計 (Server Action で service_role 経由の処理が必要)。`optional()` は **0001-rls.sql** 設計と矛盾 (RLSバイパスが必要な server action パスが落ちる)。
- **修正 diff (`apps/web/src/lib/env.ts:6`)**:
  ```ts
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),  // .optional() 削除
  ```

#### M1-2. SUPABASE_REGION / R2_BUCKET_REGION の値が render.yaml と整合しない (-0.5)
- **`.env.example:18,53`**: `SUPABASE_REGION=ap-northeast-1`, `R2_BUCKET_REGION=tokyo`
- しかし **`render.yaml:12,46`**: `region: singapore` → アプリ層と DB/Storage 層でリージョンが分断。RTT 増大とコンプライアンス (個人情報保護法・国内保存原則) の両方で論外。観点 #2 と二重減点を避けるため、ここは region 整合性チェックの欠落として -0.5 に留める。

---

## 2. Render デプロイ構成 (15点 → 5.0点 / -10)

### Critical (-5 × 1)

#### C2-1. `region: singapore` 固定で Tokyo 化のフラグ無し (-5)
- **`render.yaml:12, 46`**: 両サービスとも `region: singapore`
- 設計書 10_env_vars v2: `SUPABASE_REGION=ap-northeast-1`, `R2_BUCKET_REGION=tokyo` が **P1必須**。
- App→DB が Tokyo↔Singapore を毎回越える → **読み込み RTT +60ms / 書き込み RTT +120ms**、p95 < 1000ms (23_observability_alerts) を達成困難。
- 個人情報の越境保管論点 (16_compliance_legal): 国内処理原則 → Singapore 経由は説明責任発生。
- **修正 diff (`render.yaml:12, 46`)**:
  ```yaml
      region: tokyo  # ap-northeast-1 と整合 (Render 2024+ で Tokyo region GA)
  ```
- Tokyo が Render 側で未対応の場合、**コメントだけでなく** `# TODO(SRE): Tokyo GA待ち / 暫定 Osaka(JP-A2) or オレゴン経由 PrivateLink` のように runbook 化すべき。現状の「別途要相談」コメントは設計判断として弱すぎる。

### High (-3 × 1)

#### H2-1. Worker が `type: web` 指定 = 常駐保証無し (-3)
- **`render.yaml:43`**: pgmq consumer なのに `type: web`。
- Render の `web` タイプは `healthCheckPath` 失敗で再起動するが、**外部 HTTP リクエスト時のみ稼働判定**で、idle 時 spin-down する Starter プランの仕様。pgmq の consumer は webhook 来てなくても polling し続ける必要がある (T-009/012/013)。
- 正しくは `type: worker` (Background Worker) または `type: pserv` (Private Service)。Webhook 受信もある両構成なら **2 service に分ける** べき:
  1. `type: web` for Zoom/Gmail webhook ingress (ksp-ingress)
  2. `type: worker` for pgmq consumer (ksp-jobs)
- **修正 diff (`render.yaml:43-50`)**:
  ```yaml
    - type: worker            # ← web から worker に変更
      name: ksp-worker
      runtime: node
      region: tokyo
      plan: starter
      branch: main
      buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ksp/worker build
      startCommand: pnpm --filter @ksp/worker start
      autoDeploy: true
      # healthCheckPath は worker タイプでは無効。別途 ingress を立てる
  ```
- もしくは ingress と consumer を分離 (推奨)。

### High (-3 × 1)

#### H2-2. `plan: starter` で本番運用は非現実 (-3)
- **`render.yaml:13, 47`**: 両方 `plan: starter` (512MB/0.5 CPU)
- 12_cost_estimate 表: Render Standard $25/月 × 2 を前提。Starter (free $0) は spin-down するため pgmq consumer が止まり、`23_observability_alerts` の **queue backlog >1000/30min** を即座に踏む。
- 設計書のコスト前提と整合させ最低 `plan: standard`。
- **修正 diff (`render.yaml:13, 47`)**:
  ```yaml
      plan: standard
  ```

### Medium (-1 × 2)

#### M2-1. `healthCheckPath: /` (web) は弱い (-1)
- **`render.yaml:17`**: `healthCheckPath: /`
- Next.js の `/` は middleware で `/login` リダイレクト → 200 ではなく 307。Render の health check は 200/2xx のみ ok 扱い (3xx は失敗扱いの場合あり、ドキュメント上は 200-399 だが pre-prod では 200 限定が安全)。専用 `/api/health` を立てて `200 {status:ok}` を返すべき。
- **修正 diff**:
  ```yaml
      healthCheckPath: /api/health
  ```
  + `apps/web/src/app/api/health/route.ts` を新規作成 (DB ping + supabase ping を含めた readyz 相当)。

#### M2-2. `autoDeploy: true` + branch 保護無しの組合せ (-1)
- **`render.yaml:18, 52`**: `autoDeploy: true` で main push 即本番。
- README にも GitHub Actions にも事前 typecheck/build gate が無い (観点 #5)。`turbo run typecheck` 落ちる commit をそのまま prod へ流す事故が起こる。
- 最低限 GitHub Actions で `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build` を required check にして、それが通ってからの autoDeploy にする。

---

## 3. Migration 順序 / 冪等性 (15点 → 8.0点 / -7)

### High (-3 × 1)

#### H3-1. `0002_triggers_p1.sql` が `create trigger` を `IF NOT EXISTS` 無しで叩く = 再実行で全FAIL (-3)
- **`packages/db/src/migrations/manual/0002_triggers_p1.sql:6-20`**: 4 個の `create trigger set_xxx_updated_at` が **生 `create trigger`** で、`drop trigger if exists` も無い。
- `apply_migrations.py` は冪等想定で再実行されうる (CI dry-run、本番手動再適用、新ブランチで初回流す等) のに、PostgreSQL は同名 trigger 重複で **42710 duplicate_object** エラー。
- **修正 diff (`0002_triggers_p1.sql`)**:
  ```sql
  drop trigger if exists set_users_updated_at on public.users;
  create trigger set_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();
  -- 4テーブル分すべてに drop trigger if exists を前置
  ```
- 同じく `0005_auth_sync_trigger.sql` は `drop trigger if exists on_auth_user_created on auth.users` をやっていて正しい (line 28) → 0005 を倣え。

### High (-3 × 1)

#### H3-2. `0000_setup.sql` の `pgmq.create()` 重複呼び出しで FAIL (-3)
- **`0000_setup.sql:25-27`**: `select pgmq.create('process_business_card');` 等を生で実行。
- pgmq の `pgmq.create(queue_name)` はキューが既存だと **42P07 (relation already exists)** を返す (pgmq 1.4 系の挙動。1.5+ で `create_if_not_exists` が追加された)。再実行で失敗する → migration runner 全体が rollback。
- **修正 diff (`0000_setup.sql:25-27`)**:
  ```sql
  -- pgmq キュー作成 (冪等)
  do $$
  begin
    perform pgmq.create('process_business_card');
  exception when duplicate_table then null;
  end $$;
  do $$
  begin
    perform pgmq.create('process_recording');
  exception when duplicate_table then null;
  end $$;
  do $$
  begin
    perform pgmq.create('generate_embeddings');
  exception when duplicate_table then null;
  end $$;
  ```
- 代替: pgmq 1.5+ なら `select pgmq.create_if_not_exists('process_business_card');`

### Medium (-1)

#### M3-1. `apply_migrations.py` に dry-run / rollback / migration ledger 無し (-1)
- **`scripts/apply_migrations.py:38-67`**: 全 SQL を順に commit。失敗時 rollback はあるが:
  - `--dry-run` フラグ無し (CI で本番接続せずに syntax だけ確認したい)
  - `schema_migrations` テーブル未使用 → 何が適用済みか追跡不可。再実行時に毎回全 SQL 流す = 上記 H3-1, H3-2 の問題が爆発する。
  - 任意ファイル単発適用 (`--only 0003_rls_p1.sql`) 不可。
  - confirmation prompt 無しで本番 DATABASE_URL に直撃する。
- **修正 (要点)**:
  ```python
  # add CLI flags
  import argparse
  parser = argparse.ArgumentParser()
  parser.add_argument('--dry-run', action='store_true')
  parser.add_argument('--only', help='single file (e.g. 0003_rls_p1.sql)')
  parser.add_argument('--yes', action='store_true', help='skip prod confirm')
  # add ledger
  cur.execute('''
    create table if not exists public.schema_migrations(
      filename text primary key,
      applied_at timestamptz not null default now(),
      checksum text not null
    )''')
  # filter applied
  cur.execute('select filename from public.schema_migrations')
  applied = {r[0] for r in cur.fetchall()}
  files = [f for f in files if f.name not in applied]
  ```

### Medium (-0.5 × 1)

#### M3-2. `psycopg2` 非同期処理で 1 ファイル巨大 transaction (-0.5)
- **`scripts/apply_migrations.py:55-57`**: `cur.execute(sql)` で migration 全文を一括投入 → エラー行番号が出ない (PostgreSQL は全文中の position しか返さない)。
- せめて `print(path.name); print(sql)` を `--verbose` で吐く、または `--statement-timeout=300s` を session で設定。

### Minor (-0.5)

#### M3-3. dependency 順序の 1 行コメントだけ (-0.5)
- ファイル名 `0000` → `0005` の順だが、`0001_init_schema.sql` で `users.id uuid primary key` (no default) なのに `0005_auth_sync_trigger.sql` が auth.users 同期で `insert into public.users(id, ...) values(new.id, ...)` を叩く構造。0005 適用前に手で `users` を作ろうとすると `id` の default 不在で落ちる。
- 設計上 `users.id` は `auth.users.id` を継承するので default は不要 (正しい)。だが README / runbook にこの **「`users.id` は auth.users.id ミラー、Supabase Auth 側 trigger が唯一の入口」** という制約が書かれてない。Drizzle で `users` 直接 insert する worker code を将来書いた時に必ず踏む。
- **修正**: `0001_init_schema.sql:11` の users テーブル定義 直前に
  ```sql
  -- 注意: users.id は auth.users.id をそのまま継承する設計。
  --       0005_auth_sync_trigger.sql の handle_new_auth_user() が唯一の insert 経路。
  --       service_role でも直接 insert しないこと (auth.users との不整合源)。
  ```

---

## 4. 観測性 (15点 → 5.0点 / -10)

設計書 23_observability_alerts は P1 だけで 17 監視項目。実装はゼロに近い。

### Critical (-5)

#### C4-1. Sentry SDK が一切初期化されてない (-5)
- **`apps/worker/package.json:14`**: `@sentry/node ^8.38.0` を入れたが `apps/worker/src/index.ts` で `Sentry.init()` を**呼んでない**。
- **`apps/web/`** には `@sentry/nextjs` 自体が無い。
- 23_observability_alerts P1: 「エラー率>1%/5min → Slack」が前提なのに **発火源が無い**。
- **修正 (worker, `apps/worker/src/index.ts:1` 直後に追加)**:
  ```ts
  import * as Sentry from '@sentry/node';
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      release: process.env.RENDER_GIT_COMMIT,  // Render 自動注入
    });
  }
  // app.onError 内で Sentry.captureException(err) も呼ぶ
  ```
- **修正 (web)**: `apps/web/package.json` に `@sentry/nextjs` 追加 → `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` 作成。

### High (-3 × 1)

#### H4-1. `/healthz` が DB / pgmq / R2 / Anthropic を一切確認しない (-3)
- **`apps/worker/src/routes/health.ts:5`**: `c.json({ status: 'ok' })` のみ。
- 23_observability_alerts P1 「録画処理SLA stage1<=5min」「pgbouncer pool 枯渇」「pgvector memory」を踏むには、**health check に依存性 ping** が必須。
- 現状だと「Render の dashboard が green」なのに「DB pool 枯渇で全 job 失敗」が並存し、検出が Slack alert 任せになる。
- **修正 diff (`apps/worker/src/routes/health.ts`)**:
  ```ts
  import { Hono } from 'hono';
  import { supabase } from '@/lib/supabase';

  export const health = new Hono();

  // liveness: process が生きてるかだけ
  health.get('/healthz', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

  // readiness: 依存 ping
  health.get('/readyz', async (c) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    try {
      const { error } = await supabase.from('users').select('id').limit(1);
      checks.db = error ? 'fail' : 'ok';
    } catch { checks.db = 'fail'; }
    try {
      const { error } = await supabase.rpc('pgmq_metrics', { queue_name: 'process_recording' });
      checks.pgmq = error ? 'fail' : 'ok';
    } catch { checks.pgmq = 'fail'; }
    const ready = Object.values(checks).every((v) => v === 'ok');
    return c.json({ status: ready ? 'ready' : 'degraded', checks }, ready ? 200 : 503);
  });
  ```

### High (-3 × 1)

#### H4-2. structured logging に `request_id` propagation 無し (-3)
- **`apps/worker/src/index.ts:11`**: `app.use('*', honoLogger(...))` は path/method/ms をログするだけで request id を発行しない。
- Zoom webhook → pgmq enqueue → worker job の **トレースができない** (3 ホップでログ突合不可)。
- **修正 diff (`apps/worker/src/index.ts:9` 後ろに追加)**:
  ```ts
  import { randomUUID } from 'node:crypto';
  app.use('*', async (c, next) => {
    const reqId = c.req.header('x-request-id') ?? randomUUID();
    c.set('reqId', reqId);
    c.header('x-request-id', reqId);
    const log = logger.child({ reqId, path: c.req.path, method: c.req.method });
    c.set('log', log);
    const start = Date.now();
    await next();
    log.info({ ms: Date.now() - start, status: c.res.status }, 'req');
  });
  ```
  + pgmq payload にも `reqId` を載せて worker 側 job 処理で同じ logger.child 受け取り。

### High (-3 × 1)

#### H4-3. pgmq metrics / Anthropic tokens 監視のフックが無い (-3)
- 23_observability_alerts v2.1 (Round1指摘反映):
  - **LLM rate**: Anthropic tokens/sec を Prometheus exporter
  - **LLM cost**: 予算150% で kill switch
  - **pgmq visibility**: 重複実行カウンタ
  - **Realtime conn / pgbouncer / pgvector memory / Zoom quota / Google quota**
- これら「P1」のメトリクスを吐く器が皆無。`prom-client` も `@opentelemetry/*` も入ってない。
- **修正 (要点、`apps/worker/package.json` に追加)**:
  ```json
  "prom-client": "^15.1.3",
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-node": "^0.55.0",
  "@opentelemetry/auto-instrumentations-node": "^0.50.0"
  ```
  + `apps/worker/src/lib/metrics.ts` で counter/histogram を export、`/metrics` で Prometheus scrape 受ける。

### Minor (-0.5 × 2)

#### M4-1. `pino` が prod で transport 無しの素 JSON (-0.5)
- **`apps/worker/src/lib/logger.ts:8`**: prod は `transport: undefined` で stdout に JSON。Render は logs を CloudWatch ではなく Render logs に流す → そのままだと Datadog/Loki への転送ができない。
- 仕様 23_observability_alerts P1 で APM 必要なので、`pino-http` + `pino-elastic` または `pino → otlp http exporter` の整備が要る。

#### M4-2. `honoLogger` の出力が 2 重ロギング (-0.5)
- **`apps/worker/src/index.ts:11`**: `honoLogger((msg) => logger.info(msg))` は文字列をそのまま `info` メッセージにする → JSON ログの中に "GET /healthz 200 1ms" の素文字列が混入し、構造化解析が壊れる。
- 自前 middleware (上の H4-2 の修正) に置き換えて `honoLogger` 廃止。

---

## 5. CI / Lint / Test (10点 → 2.0点 / -8)

### Critical (-5)

#### C5-1. `.github/workflows/` が存在しない (-5)
- `find ... .github` → not found。
- biome / typecheck / vitest / playwright を流す CI が **0 本**。設計書 09_implementation_plan T-019 (Phase1統合テスト) の前提が崩壊。
- **修正 (新規 `.github/workflows/ci.yml`)**:
  ```yaml
  name: ci
  on:
    pull_request:
    push:
      branches: [main]
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
          with: { version: 9.12.0 }
        - uses: actions/setup-node@v4
          with: { node-version-file: .nvmrc, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm format:check
        - run: pnpm lint
        - run: pnpm typecheck
        - run: pnpm test
    gitleaks:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - uses: gitleaks/gitleaks-action@v2
          env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
    sql-syntax:
      runs-on: ubuntu-latest
      services:
        postgres:
          image: pgvector/pgvector:pg16
          env: { POSTGRES_PASSWORD: postgres }
          ports: ['5432:5432']
          options: >-
            --health-cmd pg_isready --health-interval 5s --health-timeout 5s
      steps:
        - uses: actions/checkout@v4
        - run: pip install psycopg2-binary
        - run: |
            export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
            psql $DATABASE_URL -c "create extension if not exists vector;"
            python scripts/apply_migrations.py --dry-run
  ```

### High (-3 × 1)

#### H5-1. test runner が定義されてない (-3)
- **`apps/worker/package.json`**: `vitest ^2.1.5` 入ってるが `"test": "vitest run"` が無い (`turbo run test` が空回り)。
- **`packages/db`, `packages/shared`**: vitest が入ってない。zod schema (`packages/shared/src/types.ts`) のテストは型を担保するうえで必須。
- **`apps/web`**: `@playwright/test` 不在 → README L102 の「E2E シナリオ」を流す手段が無い。
- **修正**:
  - `apps/worker/package.json`: `"test": "vitest run --reporter=verbose"`
  - root `package.json` に `"e2e": "pnpm --filter @ksp/web exec playwright test"` を追加し `@playwright/test` を web に依存追加。
  - `packages/shared/package.json` に `vitest`, `tsx` 追加し `src/types.test.ts` を 1 つ書いて turbo の `test` を有効化。

---

## 6. Cost cap / Rate limit (5点 → 3.5点 / -1.5)

### Medium (-1)

#### M6-1. COST_CAPS / RATE_LIMITS の値が設計書と一部ズレ (-1)
- **`packages/shared/src/constants.ts:2-12`**: 値そのものは v2.2 (per-conversation $0.10 / per-meeting $0.50) と一致 → ◯
- ただし **kill switch ロジックが無い** (cap に達した時の挙動が code に無い)。設計書 12_cost_estimate v2.2 「超過時は reject / 超過時 Haiku 強制」が未実装。
- 単なる定数公開だけでは観測性 #4 で減点した kill switch とつながらない。
- **修正 (新規 `apps/worker/src/lib/cost-guard.ts`)**:
  ```ts
  import { COST_CAPS } from '@ksp/shared';
  import { logger } from './logger';
  export async function assertConversationCap(input: { meetingId: string; spendUsd: number }) {
    if (input.spendUsd > COST_CAPS.perConversationUsd) {
      logger.warn({ ...input, cap: COST_CAPS.perConversationUsd }, 'conversation cap exceeded');
      throw new Error('CONVERSATION_COST_CAP_EXCEEDED');
    }
  }
  ```

### Minor (-0.5)

#### M6-2. RATE_LIMIT 環境変数と constants の二重情報源 (-0.5)
- `.env.example:68-69`: `RATE_LIMIT_USER_RPM=60`, `RATE_LIMIT_ADMIN_RPM=10`
- `packages/shared/src/constants.ts:7-12`: 同じ値を hardcode
- どちらが真実か曖昧。worker は env から読むべきで、constants は **default fallback only** にしないと運用で値変えても効かない。
- **修正**: `RATE_LIMITS` を関数に変更:
  ```ts
  export function rateLimits(env: { RATE_LIMIT_USER_RPM?: string; RATE_LIMIT_ADMIN_RPM?: string }) {
    return {
      userRpm: Number(env.RATE_LIMIT_USER_RPM ?? 60),
      adminRpm: Number(env.RATE_LIMIT_ADMIN_RPM ?? 10),
      searchRpm: 30,
      ocrPerMin: 10,
    };
  }
  ```

---

## 7. Feature flags / Rollout (5点 → 1.5点 / -3.5)

### High (-3 × 1)

#### H7-1. `feature_flags` テーブル / `ab_test_*` 未実装 (-3)
- 設計書 22_feature_flags_ab: `feature_flags(percentage, allowlist, blocklist)` テーブル + `sha256(user_id+key)%100` で stable hash。
- **`packages/db/src/migrations/manual/0001_init_schema.sql`** に該当テーブル無し。
- `AB_HASH_SECRET` も `.env.example` 未掲載。
- 「P2」とはいえ Phase 1 で β機能 rollout を回す前提 (T-018 通知システムなど) なら、scaffold 段階で **テーブル + helper** の枠だけは置いておくべき。

### Minor (-0.5)

#### M7-1. SRM (Sample Ratio Mismatch) 監視の痕跡無し (-0.5)
- 23_observability_alerts P3 に「A/Bテスト SRM p<0.001」とあるが、`shared/src/constants.ts` にも `apps/worker/src/jobs/` にも痕跡無し (jobs ディレクトリ自体が空)。
- README に「Phase 3 で実装予定」とだけでも書くべき。

---

## 8. Secret rotation (5点 → 2.0点 / -3)

### High (-3 × 1)

#### H8-1. 90日ローテ (`WEBHOOK_SECRET_ZOOM`, `WEBHOOK_SECRET_GMAIL`) の切替設計コメント無し (-3)
- 10_env_vars: `WEBHOOK_SECRET_ZOOM` / `WEBHOOK_SECRET_GMAIL` は **90日ローテ必須**。
- **`apps/worker/src/lib/zoom-webhook.ts:23`**: `env.ZOOM_WEBHOOK_SECRET_TOKEN` 1 値しか参照していない → ローテ時は **古い secret と新 secret の両方を一定期間受け入れる必要がある** (Zoom 側で新旧 secret 同時投入後、Render env を切替えるまでのギャップ)。
- **修正 (`apps/worker/src/env.ts`)**:
  ```ts
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
  ZOOM_WEBHOOK_SECRET_TOKEN_PREVIOUS: z.string().optional(),  // ローテ中の旧token
  ```
  `verifyZoomSignature` で current/previous の両方で検証、どちらかで通れば ok。
- README に「90日 rotation SOP」セクションを追加。

---

## 9. Backup / DR (5点 → 1.5点 / -3.5)

### High (-3 × 1)

#### H9-1. `PITR_WINDOW_DAYS` / `SOFT_DELETE_GRACE_DAYS` が env / zod 未掲載 (-3)
- 10_env_vars v2: 両方 P1 必須 (P2 と書いてあるが M-C4 / 16_compliance_legal で削除依頼 SLA に直結 → P1 相当の重要度)。
- `.env.example`, `apps/worker/src/env.ts`, `apps/web/src/lib/env.ts` のどこにも無し。
- 23_observability_alerts v2.1: `DR(M-C4) ap-northeast-3 bk健全` という P2 監視項目があるが、ap-northeast-3 (大阪) への暗号化 backup 設計が **scaffold に痕跡ゼロ**。Render は backup を持たないので Supabase の WAL ship + R2 cross-region replication が必要なのにコメントすら無い。
- **修正 (`.env.example` 追加)**:
  ```bash
  # ----- Backup / DR (P2必須)
  PITR_WINDOW_DAYS=7
  SOFT_DELETE_GRACE_DAYS=30
  DR_BACKUP_REGION=ap-northeast-3
  ```
- README に「DR runbook」セクション (RTO/RPO 目標、ap-northeast-3 への WAL ship 手順、復旧訓練四半期1回) を追加。

### Minor (-0.5)

#### M9-1. R2 の versioning / object lock 未言及 (-0.5)
- recordings バケット (`R2_BUCKET_RECORDINGS=ksp-recordings`) は録画原本 = **生き残り資産**。R2 versioning と object lock (compliance mode) を有効化するべきだが、scaffold / README 未記載。

---

## 10. README / Runbook (5点 → 3.5点 / -1.5)

### Medium (-1)

#### M10-1. `apply_migrations.py` のトラブル時 runbook 無し (-1)
- README L46-56: 「順に流す」だけ。
- 失敗ケース ((1) 部分適用で止まった (2) 別ブランチで対立する DDL を流した (3) RLS 適用後に migrate user 権限不足) の対処手順が無い。
- **修正**: README に「Migration トラブルシュート」セクションを追加。
  ```
  ### 部分適用後に再開する
  1. psql で適用済みファイルの末尾 SQL を SELECT で確認
  2. 失敗箇所を手動で fix
  3. python scripts/apply_migrations.py --only 0003_rls_p1.sql
  ```

### Minor (-0.5)

#### M10-2. 開発オンボーディング手順に Supabase 拡張権限のハマりが無い (-0.5)
- README L41 「pgvector / pgmq / pg_cron / supabase_vault 拡張を有効化」とだけ記載。
- 実際は `pgmq` / `pg_cron` は Supabase Pro 以上で Dashboard → Database → Extensions から enable する必要 + `pgmq.create()` の前に schema search_path に `pgmq` が必要。
- 新メンバーが `0000_setup.sql` で `extension "pgmq" is not available` で詰まる導線。
- **修正**: README に
  ```
  > Supabase Dashboard → Database → Extensions で
  >   - pgcrypto (default ON)
  >   - vector  (検索)
  >   - pgmq    (キュー、Pro plan)
  >   - pg_cron (定期、Pro plan)
  >   - supabase_vault (OAuth token暗号化)
  > を **必ず ON にしてから** 0000_setup.sql を実行する。
  ```

---

## 総括 (Round 1 → Round 2 への必達)

| 優先度 | 項目 | 配点回復見込 |
|---|---|---|
| **P0** | render.yaml region tokyo / worker タイプ修正 / plan standard | +8 |
| **P0** | Sentry init 実装 + structured logging request_id | +6 |
| **P0** | .github/workflows/ci.yml 新規 (typecheck/biome/vitest/gitleaks/sql-syntax) | +5 |
| **P0** | migration 冪等性 (drop trigger if exists, pgmq do$$ except) | +6 |
| **P1** | env 漏れ補完 (GOOGLE_OAUTH_*, WEBHOOK_SECRET_GMAIL, SAMPLE_DATA_SEED, PITR_*, DR_*) | +6 |
| **P1** | /readyz に DB / pgmq / R2 ping | +3 |
| **P1** | rotation 設計 (PREVIOUS secret 受け入れ) | +3 |
| **P2** | feature_flags table 雛形 + AB_HASH_SECRET | +3 |
| **P2** | DR runbook (ap-northeast-3 WAL ship) + R2 versioning | +2 |
| **P2** | apply_migrations.py に --dry-run / --only / ledger | +1 |

これらを Round 2 で全消化すれば 80+ に届く。現状 41.5 は **「scaffold としては動くが本番運用は無理」** ライン。
