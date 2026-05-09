# Security Review — Round 1

**Score: 61.5 / 100**

レビュー対象: `C:\Users\ooxmi\Downloads\knowledge-sales-platform\` の Phase1 scaffold。
仕様根拠: `sales_platform_design_spec_v2.xlsx` のシート 08_security_rls / 13_risks_decisions / 16_compliance_legal / 25_v2_review_resolutions / 27_simulation_resolutions。

scaffold時点で「埋めるべき設計痕跡」を評価。Phase2/3未実装機能でも、テーブル定義/コメント/SOPリンク/CI設定の痕跡が無いものは減点対象。

---

## Breakdown

| 観点 | 配点 | 取得 |
|---|---|---|
| RLS カバレッジ | 25 | 7.0 |
| service_role 分離 | 15 | 14.0 |
| Webhook 署名 | 10 | 9.5 |
| OAuth scope | 5 | 3.0 |
| Idempotency-Key | 10 | 6.0 |
| share_links | 5 | 3.5 |
| secret 管理 | 10 | 7.0 |
| MFA / dual approval / audit | 10 | 5.5 |
| CSP / Rate limit / CORS | 5 | 2.5 |
| PII / data residency | 5 | 3.5 |
| **合計** | **100** | **61.5** |

---

## Critical

### S-C-01 自分の role を admin に書き換えられる(自己昇格)
- 場所: `packages/db/src/migrations/manual/0003_rls_p1.sql:50-54`
- 違反内容: `users_update_self_or_admin` ポリシーは行レベルで `id = auth.uid() or admin` を許可しているが、列レベル制限が無い。`role` 列も同 UPDATE で書ける。仕様書 08_security_rls マトリクスでは `admin_users / users.role` の変更権限は admin のみ。sales ユーザーが
  ```sql
  update public.users set role='admin' where id = auth.uid();
  ```
  を実行すると RLS 通過 → 全権限掌握。
- 仕様根拠: 08_security_rls 「リソース×ロールマトリクス」 admin_users 行 = 「sales/cs/manager × × × / admin CRUD」、25_v2_review_resolutions L-C5「admin_actionは別テーブル」。
- 修正案: 列レベルを RLS では表現できないので
  1. `role` 列の UPDATE を関数経由(`SECURITY DEFINER` + 呼び出し元 role チェック)に集約し、`REVOKE UPDATE (role) ON public.users FROM authenticated;` を入れる、あるいは
  2. `users_update_self_or_admin` を 2 ポリシーに分割: (a) 自分自身は `role` 以外のみ UPDATE 可、(b) admin は全 UPDATE 可。BEFORE UPDATE トリガで `OLD.role <> NEW.role AND current_user_role()<>'admin'` を `RAISE EXCEPTION` する。
  ```sql
  create or replace function public.guard_users_role_change()
  returns trigger language plpgsql as $$
  begin
    if new.role is distinct from old.role
       and public.current_user_role() <> 'admin' then
      raise exception 'role change requires admin';
    end if;
    return new;
  end$$;
  create trigger guard_users_role
    before update on public.users
    for each row execute function public.guard_users_role_change();
  ```
- 減点: -5

### S-C-02 match_knowledge RPC に sensitivity / org / role prefilter が無い(T-2 そのまま放置)
- 場所: `packages/db/src/migrations/manual/0004_rpc_match_knowledge.sql:39-51`
- 違反内容: 関数本体に `-- TODO(P1.5): metadata.sensitivity が 'sensitive' の行は owner+admin のみに絞る` とコメントが残っているのみで、prefilter 句はゼロ。`SECURITY DEFINER` で全社の `knowledge_embeddings` を返すため、sensitivity tier(public/internal/sensitive)も visibility(社内/社外)も無視されて任意 authenticated ユーザーに漏出する。25_v2_review_resolutions T-2 (CRIT)、M-C3「social閲覧時もデフォルトmask」、F-S6-2 退職者発言バッジ、F-S5-3 audience selector はいずれも matched chunks に sensitivity 情報が乗っている前提。
- 仕様根拠: 25_v2_review_resolutions #8 T-2「(b) 検索 RPC は SECURITY DEFINER + 関数内で auth.uid 権限判定」「(c) recording_segments の sensitivity 複製で prefilter 必須」。
- 修正案:
  ```sql
  return query
  select e.id, e.source_type, e.source_id, e.chunk_text, e.metadata,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.knowledge_embeddings e
  where (filter_source_types is null or e.source_type = any(filter_source_types))
    and (
      (e.metadata->>'sensitivity') is null
      or (e.metadata->>'sensitivity') = 'public'
      or ((e.metadata->>'sensitivity') = 'internal' and v_role in ('sales','cs','manager','admin'))
      or ((e.metadata->>'sensitivity') = 'sensitive' and (
        v_role in ('manager','admin')
        or (e.metadata->>'owner_user_id')::uuid = auth.uid()
      ))
    )
    and (
      (e.metadata->>'visibility') is null
      or (e.metadata->>'visibility') <> 'private_owner'
      or (e.metadata->>'owner_user_id')::uuid = auth.uid()
      or v_role = 'admin'
    )
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
  ```
  併せて `knowledge_embeddings.metadata` に `sensitivity / visibility / owner_user_id / org_id` を必ず詰めるルールを `0001_init_schema.sql` の comment と embeddings 投入 worker(`apps/worker/src/jobs/generate_embeddings.ts` 想定)に明記。
- 減点: -5

---

## High

### S-H-01 P1 必須 9 テーブルが未作成 + RLS 未定義
- 場所: `packages/db/src/migrations/manual/0001_init_schema.sql`、`0003_rls_p1.sql`
- 違反内容: 仕様書 08_security_rls「v2 追加 RLS/権限/再考」で **Phase=P1** とマークされているテーブルのうち、scaffold には以下 9 件が schema・RLS とも欠落:
  `business_card_images`、`contact_memos`、`offline_queue`、`non_card_attachments`、`recording_segments`(sensitivity tier 段階適用が前提)、`sync_failure_log`、`data_residency_config`、`recent_views`、`autosave_drafts`。
  全件 P1 で RLS が要求されているのに DDL 自体が無い。RD-31(オフライン中の喪失)、F-S14-2(録音中断割込)、M-C3(sensitivity 段階閲覧)、M-C4(DR)、L-C3(顧客 TZ 夜間ブロック)など、複数の Critical 対応の根幹となるテーブル。
- 仕様根拠: 08_security_rls v2 追加表「Phase=P1」行、25_v2_review_resolutions T-1, M-C3。
- 修正案: P1 範囲のテーブル DDL+RLS を `0006_p1_extended_tables.sql` として追加。最低限以下のテンプレ:
  ```sql
  create table public.offline_queue (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    action_type text not null,
    payload jsonb not null,
    idempotency_key text not null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    unique (user_id, idempotency_key)
  );
  alter table public.offline_queue enable row level security;
  create policy offline_queue_self on public.offline_queue
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  ```
  recording_segments は sensitivity tier 列を必須化、business_card_images は owner OR admin、data_residency_config は org_admin のみ等、08_security_rls の対応欄をそのまま反映。
- 減点: -3

### S-H-02 ベースマトリクス側の RLS 必須テーブルが未作成
- 場所: `packages/db/src/migrations/manual/0001_init_schema.sql`
- 違反内容: 08_security_rls 冒頭マトリクスで定義されている `audit_logs / knowledge_items / roleplay_scenarios / roleplay_sessions / handoffs / admin_users / email_templates` のすべてが scaffold に存在しない。`audit_logs` 不在は「全 sensitive 操作の証跡を残す」(M-C8/C-5) という Phase 横断要件が成立しない致命的欠落。
- 仕様根拠: 08_security_rls マトリクス、25_v2_review_resolutions C-5「audit_logs append-only(REVOKE UPDATE/DELETE) + prev_hash chain」、16_compliance_legal「監査ログ → triggers→audit_logs」。
- 修正案: 最低限 `audit_logs` を P1 で作成し、append-only ポリシーまで一気に入れる:
  ```sql
  create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references public.users(id),
    action text not null,
    resource_type text not null,
    resource_id uuid,
    detail jsonb,
    prev_hash text,
    row_hash text not null,
    created_at timestamptz not null default now()
  );
  alter table public.audit_logs enable row level security;
  create policy audit_logs_select_priv on public.audit_logs
    for select to authenticated using (public.is_manager_or_admin());
  -- INSERT は service_role 経由のみ。authenticated には INSERT/UPDATE/DELETE 一切付与しない。
  revoke update, delete on public.audit_logs from authenticated, anon;
  ```
- 減点: -3

### S-H-03 audit_logs / hash chain / WORM / MFA の設計痕跡が code 側に皆無
- 場所: `apps/worker/src/`、`packages/db/src/migrations/manual/`、`docs/ARCHITECTURE.md`
- 違反内容: SPEC_CHANGELOG.md と Excel には append-only / prev_hash chain / R2 WORM / MFA / dual approval が大書きされているが、scaffold 側の SQL/TypeScript/コメントには一切登場しない(grep ヒット 0)。Phase2 実装でも、scaffold 時点で「ここに INSERT する」「この関数で hash chain を更新する」というプレースホルダ関数 or ARCHITECTURE.md の記述が必要。完全 silence。
- 仕様根拠: 25_v2_review_resolutions C-5、L-C5、F-S10-2、16_compliance_legal「監査ログ・MFA・Pen test」。
- 修正案:
  - `0006_p1_extended_tables.sql` に audit_logs + 上記 RLS + `prev_hash` 列を導入。
  - `apps/worker/src/lib/audit.ts` に `appendAudit(action, resourceType, resourceId, detail)` のスタブ関数を置き、内部で前行の `row_hash` を読み出して sha256 連結する処理を実装(または TODO として明記)。
  - `docs/ARCHITECTURE.md` の「セキュリティ境界」に audit chain / WORM / MFA セクションを追加。
- 減点: -3

---

## Medium

### S-M-01 SUPABASE_SERVICE_ROLE_KEY が apps/web の env schema に残っている(footgun)
- 場所: `apps/web/src/lib/env.ts:6,14`
- 違反内容: `SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional()` が web 側 env に存在。実際にはどこからも参照されていない(grep 確認済)が、env schema に置いた瞬間に「Route Handler から service_role を使ってよい」というシグナルになり、25_v2_review_resolutions T-8/M-16 が禁じる「Route Handler で service_role 直接使用」を将来招く。
- 仕様根拠: 25_v2_review_resolutions T-8「service_role はworker専用、Next.jsはRoute Handler内で SUPABASE_PUBLIC_KEY+RLS 経由」、M-16「Route Handlerからservice_role直接DB禁止ルール」。
- 修正案: web env から `SUPABASE_SERVICE_ROLE_KEY` を削除。共有Edge Function or Worker への HTTP 内部呼び出し経由に固定。`docs/ARCHITECTURE.md` の「service_role: worker専用」記述に併せる。
- 減点: -1

### S-M-02 recordings の insights 編集 RPC が未定義(担当営業の編集導線が無い)
- 場所: `packages/db/src/migrations/manual/0003_rls_p1.sql:163-171`
- 違反内容: コメントに「担当営業による insights 編集は SECURITY DEFINER RPC 経由で実装する」と書いてあるが、実 RPC が無い。08_security_rls マトリクスでは `recording.insights編集 = 担当者のみU` (sales)。担当営業が web から `summary/key_points/next_actions` を修正できない。あるいは将来 service_role を使ってしまう導線リスク。
- 仕様根拠: 08_security_rls マトリクス「recording.insights編集」、F-S5-1「インライン編集後の派生成果物の staleness」。
- 修正案: `0007_rpc_update_recording_insights.sql` を追加し、`SECURITY DEFINER` + 呼び出し元 = recording の所属 meeting.owner OR manager+ チェックを内部で行う関数を提供。`derived_artifacts_status` の自動 invalidate もここで行う。
- 減点: -1

### S-M-03 recording_segments / sensitivity tier モデル不在(M-C3 直撃)
- 場所: `packages/db/src/migrations/manual/0001_init_schema.sql:148-173`
- 違反内容: `recordings.transcript_segments` を jsonb blob に格納する設計のまま。`recording_segments` テーブルが無いため、(a) sensitivity tier 行レベル制御、(b) PII redaction の per-segment マスキング(M-C3)、(c) 退職者発言バッジ(F-S6-2)、(d) speaker_assignments propagation、すべてが行レベル RLS で実現できない。Phase2 で必要だが scaffold 時点で `transcript_segments` を別テーブルへ正規化する痕跡(コメント or empty migration stub)が必要。
- 仕様根拠: 08_security_rls 「recording_stages/recording_segments | 録画アクセス権 + sensitivity 考慮 | public/internal/sensitive 段階 | P1」、M-C3「recordings_select RLS を sensitivity tier 段階適用、社内閲覧時もデフォルト mask」。
- 修正案: 0006/0007 で `recording_segments` を切り出し、`sensitivity text not null check (sensitivity in ('public','internal','sensitive'))` 列を追加。RLS は `sensitivity` × role × meeting.owner_user_id 連動の WHERE 句。
- 減点: -1

### S-M-04 OAuth スコープが Phase1 必須を超過
- 場所: `apps/web/src/lib/auth/actions.ts:7-15`
- 違反内容: 初回サインインで `gmail.readonly` + `gmail.send` まで一括要求。10_env_vars/.env.example で `GOOGLE_PUBSUB_TOPIC=` は P2 と明記、ARCHITECTURE.md でも「日程調整 (Gmail Pub/Sub) Phase=P2」。Phase1 機能(名刺/録画/検索)に Gmail スコープは不要。最小権限原則違反。失効・横展開リスク増(R-04, R-08)。
- 仕様根拠: ARCHITECTURE.md 「まだ実装していない領域」表、09_implementation_plan、`.env.example` GOOGLE_PUBSUB_TOPIC=空、25_v2_review_resolutions T-8 文末。
- 修正案:
  - サインイン時は `openid email profile https://www.googleapis.com/auth/calendar.events` のみ要求。
  - Gmail 系は P2 機能トグル時に **incremental authorization**(`include_granted_scopes=true` + 別ボタン「メール返信機能を有効化」)で追加要求。
  - `calendar` (read all) は不要、`calendar.events` のみで足りる。
- 減点: -1.5(Medium)

### S-M-05 Idempotency-Key middleware 未準備(T-5 CRIT 残置)
- 場所: 該当ファイルなし(`apps/web/src/middleware.ts` / `apps/web/src/app/api/`)
- 違反内容: 25_v2_review_resolutions T-5 (CRIT) は Idempotency-Key middleware と `idempotency_keys` テーブルを P1 必須としているが、scaffold には:
  - middleware なし
  - `idempotency_keys` テーブルなし
  - `packages/shared/src/constants.ts` にも該当定数なし
  - `.env.example` に IDEM_TTL 等なし。
  RD-31「オフライン中のデータ喪失 → IndexedDB+Service Worker+Idempotency」のサーバ側受け皿がない。
- 仕様根拠: 25_v2_review_resolutions T-5「idempotency_keys テーブル(key,user_id,request_hash,response_jsonb,status,expires_at) + middleware」、04_api_endpoints「Idempotency 列を全 mutating に追加」。
- 修正案:
  - `0006_p1_extended_tables.sql` に
    ```sql
    create table public.idempotency_keys (
      key text primary key,
      user_id uuid not null references public.users(id) on delete cascade,
      request_hash text not null,
      response_jsonb jsonb,
      status text not null check (status in ('pending','succeeded','failed')),
      expires_at timestamptz not null default now() + interval '24 hours'
    );
    alter table public.idempotency_keys enable row level security;
    create policy idem_self on public.idempotency_keys for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    ```
  - `apps/web/src/lib/idempotency.ts` に Route Handler ラッパ stub を置く。
- 減点: -3(High 寄りの Medium 集約)

### S-M-06 share_links 設計痕跡が code/SQL に無い(L-6 引きずり)
- 場所: なし(該当ファイル存在せず)
- 違反内容: 16_compliance_legal「共有リンク = expires_at + IP allowlist + クリップ単位」「token は sha256 で DB 保存し URL のみ平文(L-6)」、M-C2「dynamic watermark + bot block」。SPEC_CHANGELOG.md にしか言及がなく、`packages/db/src/schema/` にも `0001_init_schema.sql` にも `share_links` 行が無い。Phase2 実装予定でも、scaffold 時点で空 stub テーブル + コメント or `docs/SECURITY.md` の章があるべき。
- 仕様根拠: 25_v2_review_resolutions L-6「argon2id 強制、token は sha256 で DB 保存し url のみ平文」、M-C2、16_compliance_legal 「共有リンク」行。
- 修正案: `docs/SECURITY.md`(新規)に share_links 設計章を追加するか、`0001_init_schema.sql` 末尾に
  ```sql
  -- share_links (P2):
  --   id, resource_type, resource_id, token_sha256 text not null unique,
  --   expires_at timestamptz, ip_allowlist inet[], audience text,
  --   watermark_email text, click_log_id_root uuid, ...
  --   token は URL のみ平文、DB は sha256(token) のみ保管 (L-6)
  ```
  のコメントブロックを置く。
- 減点: -1.5

### S-M-07 gitleaks / Renovate / secret rotation の CI 設定が無い
- 場所: `.github/`(ディレクトリ自体が存在しない)
- 違反内容: 11_tech_stack_libs/16_compliance_legal/M-C1「dual-secret window 7日 + Slack 通知 + rotation_audit」「gitleaks CI、Renovate」とあるが、`.github/workflows/*.yml` が皆無。`.gitignore` の secret 除外は適切だが、コミット直前検査が走らないので人間ミス時に流出する。
- 仕様根拠: 25_v2_review_resolutions T-8、M-C1、16_compliance_legal「脆弱性管理 → npm audit/Renovate」。
- 修正案: `.github/workflows/security.yml` を追加。
  ```yaml
  name: security
  on: [push, pull_request]
  jobs:
    gitleaks:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - uses: gitleaks/gitleaks-action@v2
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
        - run: pnpm install --frozen-lockfile
        - run: pnpm audit --audit-level=high
  ```
  Renovate は `renovate.json` を root に作成。
- 減点: -2

### S-M-08 CSP / HSTS / セキュリティヘッダ未設定
- 場所: `apps/web/next.config.mjs`
- 違反内容: 08_security_rls「CSP | strict; nonce-based | P1」、L-C2「Sentry CSP レポート受信」とあるが、`next.config.mjs` に `headers()` 設定が無く、CSP/HSTS/X-Content-Type-Options/Permissions-Policy が一切未設定。
- 仕様根拠: 08_security_rls 横断ポリシー、L-C2。
- 修正案:
  ```js
  // next.config.mjs
  const SECURITY_HEADERS = [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
    { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; script-src 'self' 'nonce-${nonce}'; img-src 'self' data: https://*.supabase.co https://*.r2.cloudflarestorage.com; report-uri /api/csp-report" },
  ];
  export default { /* ... */ async headers() { return [{ source: '/(.*)', headers: SECURITY_HEADERS }]; } };
  ```
- 減点: -1

### S-M-09 Rate limit / CORS の middleware 実装が無い
- 場所: `apps/web/src/middleware.ts`(存在するが auth gate のみ)
- 違反内容: 08_security_rls「Rate limit | /api/* user 60rpm; admin 10rpm | P1」、M-4「endpoint group ごと別バケット」。`packages/shared/src/constants.ts:7-12` に `RATE_LIMITS` 定数はあるが middleware から呼ばれていない。CORS は Next.js デフォルトのまま、明示 allowlist が無い。Webhook(`apps/worker/src/routes/webhooks.ts`)にも IP allowlist / rate limit 無し。
- 仕様根拠: 08_security_rls 横断ポリシー、25_v2_review_resolutions M-4。
- 修正案:
  - Upstash Redis or Postgres 上で固定窓カウンタ実装、middleware で 429 返却。
  - `/api/*` group / webhook group / search group / ocr group を分離(M-4)。
  - CORS は Next.js Route Handler ごとに明示 `Access-Control-Allow-Origin` を返し、許可ドメイン allowlist を `.env` 化。
- 減点: -1

### S-M-10 data_residency_config テーブル不在(L-C4 / RD-45 連動)
- 場所: `packages/db/src/migrations/manual/0001_init_schema.sql`
- 違反内容: 16_compliance_legal「保管地域 | data_residency_config | P1」、08_security_rls v2 追加表「data_residency_config | org_admin | P1」。`SUPABASE_REGION=ap-northeast-1` と `R2_BUCKET_REGION=tokyo` は `.env.example` で定数化されているのは○だが、テーブルが無い → 顧客契約レベルで保管地域を行データに紐付けて証跡が出せない(SOC2 / DPA 監査ヒアリング想定)。
- 仕様根拠: 16_compliance_legal、08_security_rls、M-C4 DR 関連。
- 修正案: 0006 に `data_residency_config(org_id, primary_region, dr_region, encryption_key_id, dpa_version, updated_at)` を追加し、org_admin RLS。
- 減点: -1

---

## Minor

### S-N-01 Webhook の replay 対策が timestamp 単独
- 場所: `apps/worker/src/lib/zoom-webhook.ts:18-29`
- 違反内容: timestamp ±5min と HMAC のみ。攻撃者が 5 分以内に同一ペイロード+署名を再送すると `pgmq` に重複ジョブが入る可能性。T-3「Webhook 受信は ON CONFLICT DO NOTHING RETURNING」で守る前提だが、`apps/worker/src/routes/webhooks.ts:43` は `// TODO(T-011): pgmq.send` のままで重複防止コードが未実装。
- 仕様根拠: 25_v2_review_resolutions T-3、05_jobs_queues idempotency_key。
- 修正案: 受信時に `meetings.zoom_meeting_id + payload.event_ts` を idempotency key として `jobs_inflight` に `INSERT ... ON CONFLICT DO NOTHING RETURNING` し、`RETURNING` 0 行なら 200 で no-op。
- 減点: -0.5

### S-N-02 Webhook URL Validation 応答が署名検証より先に走る経路で常時応答する
- 場所: `apps/worker/src/routes/webhooks.ts:29-36`
- 違反内容: `endpoint.url_validation` イベントは Zoom 仕様上 unsigned で返答必須なので妥当な実装だが、攻撃者が `event=endpoint.url_validation` + 任意 plainToken を送ると `ZOOM_WEBHOOK_SECRET_TOKEN` HMAC 結果(値オラクル化)を取得できる。HMAC は鍵を逆算できないので致命的ではないが、原文選択攻撃の足がかりにはなる。
- 仕様根拠: ベストプラクティス(Zoom 公式は IP allowlist 併用推奨)。
- 修正案: Zoom が公開している webhook 送信元 IP allowlist で前段フィルタ、または同イベントの送信頻度を rate limit。
- 減点: -0.5

### S-N-03 secret rotation の `_OLD/_NEW` 命名が env.example/Worker env に書かれていない
- 場所: `.env.example`、`apps/worker/src/env.ts`
- 違反内容: M-C1「dual-secret window 7日 + Slack 通知 + rotation_audit」が `.env.example` のコメントにも、`env.ts` の `z.object` にも痕跡なし。
- 仕様根拠: 25_v2_review_resolutions T-8 / M-C1。
- 修正案: `.env.example` に
  ```
  # Secret rotation: 7日 dual-window 運用
  # ZOOM_WEBHOOK_SECRET_TOKEN_OLD=...   # rotation 中のみ設定
  # ZOOM_WEBHOOK_SECRET_TOKEN=...
  ```
  worker `verifyZoomSignature` を `[primary, old?].some(verifyWith)` 構造に拡張する TODO コメント。
- 減点: -1

### S-N-04 CSP report エンドポイントが無い(L-C2)
- 場所: `apps/web/src/app/`
- 違反内容: L-C2「Sentry CSP レポート受信、しきい値超で Slack」。`/api/csp-report` Route Handler が無いため CSP-Report-Only を入れても発火検知できない。S-M-08 と組み合わせで対応必須。
- 修正案: `apps/web/src/app/api/csp-report/route.ts` を新設し、Sentry に `captureMessage` で送る。
- 減点: -0.5

### S-N-05 PII redaction stub が recordings 周辺に無い
- 場所: `packages/db/src/migrations/manual/0001_init_schema.sql:148-173`
- 違反内容: 16_compliance_legal「PII マスキング = pii_detector + 共有時自動 redact」、M-C3 / F-S6-2 / F-S11-1。recordings の `transcript_full` / `transcript_segments` を平文 jsonb で保持している現状、PII redaction の実装フックが無い。
- 仕様根拠: 16_compliance_legal「PII マスキング」、F-S11-1。
- 修正案: `recordings.transcript_segments` を別テーブル `recording_segments(... pii_redacted_text text, sensitivity, ...)` に正規化(S-M-03 と同じ)し、worker 側 `pii_redactor.ts` の stub を置く。
- 減点: -0.5

### S-N-06 middleware の auth gate が `pathname.startsWith('/_next')` のみ免除、`/api/webhooks` を除外漏れ風に見える
- 場所: `apps/web/src/middleware.ts:4,10`
- 違反内容: `PUBLIC_PATHS` に `/api/webhooks` がない。`config.matcher` の方では `api/webhooks` を除外しているが、`PUBLIC_PATHS` と二系統で管理されており乖離が将来事故を招く。さらに Webhook は worker 側にあるため、web の matcher `api/webhooks` 除外は実質ノーオペで、混乱の元。
- 修正案: matcher 除外コメントに「webhook は worker 側、web には届かない」明記、または除外を削除。
- 減点: -0.5(設計衛生)

### S-N-07 is_manager_or_admin が SECURITY DEFINER でない
- 場所: `packages/db/src/migrations/manual/0003_rls_p1.sql:32-38`
- 違反内容: `current_user_role()` が SECURITY DEFINER の一方、`is_manager_or_admin()` は通常関数。動作上は内部呼び出しの `current_user_role()` 経由で users を読めるので OK だが、依存関係が暗黙。一貫性のため両方 SECURITY DEFINER + `set search_path = public` で固定する方が安全。
- 修正案: `is_manager_or_admin` も SECURITY DEFINER にし、明示的に search_path 固定。
- 減点: -0.5

---

## まとめ

scaffold は基本骨格(Webhook 署名 / OAuth 経路 / anon vs service_role の分離方針 / RLS 雛形)は **Webhook 署名のみ高品質**。一方で:

1. **users.role 自己昇格(S-C-01)** と **match_knowledge の sensitivity prefilter 欠如(S-C-02)** はいずれも本番リリース前に必須修正の Critical。
2. P1 必須テーブル群(business_card_images / contact_memos / offline_queue / non_card_attachments / recording_segments / sync_failure_log / data_residency_config / recent_views / autosave_drafts / audit_logs / idempotency_keys 他)が DDL レベルで未着手。08_security_rls の P1 範囲は、**migration の追加 1〜2 ファイルで一気に塞げる**ので優先度最高。
3. CI(gitleaks/Renovate)・CSP/HSTS・rate limit・audit chain の "scaffold時点で1行入れておけば-1で済んだ" 系の痕跡が一切無く積み上がっている。
4. Webhook 署名検証コードは timing-safe / timestamp window / URL validation 全て押さえており **唯一安心して P2 へ進める部品**。

優先順位:
**S-C-01 → S-C-02 → S-H-01/02/03 → S-M-05/07/08/09** の順で潰すと、次回 Round で 90 点台に乗る可能性が高い。
