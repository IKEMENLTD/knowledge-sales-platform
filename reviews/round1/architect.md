# Architect Review — Round 1

**Score: 78 / 100**

## Breakdown
- データモデル整合: 25/35
- テックスタック整合: 12/15
- 外部連携設計整合: 13/15
- State Machine整合: 11/15
- Idempotency / 冪等性: 9/10
- 拡張性・将来性: 8/10

---

## Critical (本番ブロッカー)

### A-C-01 P1 必須テーブル `meeting_notes` が完全に欠落
- 場所: `packages/db/src/schema/` (定義なし) / `0001_init_schema.sql`
- 仕様: `03_data_model` の P1 マーク一覧では `meeting_notes` 自体は P2 と記載されているが、`05_jobs_queues` の embeddings ソース (`source_type='meeting_notes'`) と `14_state_machines` の手書きメモ系イベントは P1 で参照される。さらにレビュー観点として依頼者が列挙した P1 必須10テーブルに含まれていないため、ここは Phase 1 で必要となる「`recording_segments`」の方が問題。**実は `recording_segments` (P1, segments 単位の発話/温度) と `recording_stages` (P1, 段階的成果物) が `03_data_model` で P1 指定されているが、実装に存在しない。** これは `recording.processing_status` の `pending→downloading→…→completed` 線形遷移で代替できず、設計書の「stage1_transcript / stage2_preview / stage3_full」3段階ステートマシン (M-6, F-S5-2) を表現できない。
- 実装: `recordings` 1テーブルだけ。`recording_segments` も `recording_stages` も schema/migration 双方に存在しない。
- 修正案:
  ```sql
  create table public.recording_segments (
    id uuid primary key default gen_random_uuid(),
    recording_id uuid not null references public.recordings(id) on delete cascade,
    segment_index integer not null,
    speaker text,
    start_seconds numeric(10,3) not null,
    end_seconds numeric(10,3) not null,
    text text not null,
    sentiment numeric(3,2),
    created_at timestamptz not null default now(),
    unique (recording_id, segment_index)
  );
  create table public.recording_stages (
    recording_id uuid not null references public.recordings(id) on delete cascade,
    stage text not null check (stage in ('stage1_transcript','stage2_preview','stage3_full')),
    status text not null check (status in ('queued','running','done','failed')),
    artifact jsonb,
    error text,
    started_at timestamptz, finished_at timestamptz,
    primary key (recording_id, stage)
  );
  ```
- 減点: -6

### A-C-02 `pgmq.create()` が冪等でなく再実行で必ずエラー
- 場所: `packages/db/src/migrations/manual/0000_setup.sql:25-27`
- 仕様: `05_jobs_queues` で 3 キュー (`process_business_card` / `process_recording` / `generate_embeddings`) を Phase1 必須として規定。本ファイルは「drizzle-kit generate 前に必ず一度だけ流す」とコメントされているが、Drizzle migration を運用上 `drizzle-kit migrate` で適用するなら少なくとも 2回目以降は失敗する。Render で再デプロイ→DB だけ再 attach した時にスタートアップが落ちる。
- 実装:
  ```sql
  select pgmq.create('process_business_card');
  select pgmq.create('process_recording');
  select pgmq.create('generate_embeddings');
  ```
- 修正案:
  ```sql
  do $$
  begin
    if not exists (select 1 from pgmq.list_queues() where queue_name = 'process_business_card') then
      perform pgmq.create('process_business_card');
    end if;
    -- 同様に2本
  end$$;
  -- もしくは pgmq.create_unlogged / pgmq.create を try-catch
  ```
- 減点: -5

### A-C-03 `recordings` から `meetings` への FK が `on delete` 未指定 (実質 `NO ACTION`)
- 場所: `packages/db/src/schema/recordings.ts:32-35` / `0001_init_schema.sql:148-150`
- 仕様: `03_data_model` で `recordings.meeting_id` は `REFERENCES meetings(id) NOT NULL UNIQUE`。本来 meetings 側に対応する `recording_id` がないので、`meetings` を消したら orphan recording が残る。設計書 v2.4 `pre_consent_buffer purged` (NF-S4-1) や `data_deletion_request` フローでは `meeting → recording → recording_segments` カスケードが暗黙の前提。
- 実装: `references(() => meetings.id)` (cascade なし)
- 修正案:
  ```ts
  meetingId: uuid('meeting_id').notNull().unique()
    .references(() => meetings.id, { onDelete: 'restrict' }),
  ```
  もしくは consent purge を考えるなら `cascade`。明示が必要。同じ問題が `meetings.contact_id`、`meetings.owner_user_id`、`recordings`→`meetings`、`contacts.owner_user_id` にも全部当てはまる。本番運用前に「削除ポリシー一覧表」を migration コメントで明示すること。
- 減点: -5

---

## High

### A-H-01 `meetings.contract_id` が dangling FK
- 場所: `packages/db/src/schema/meetings.ts:64` / `0001_init_schema.sql:118`
- 仕様: `03_data_model` では `contract_id uuid REFERENCES contracts(id)` と書かれているが、`contracts` は P2。
- 実装: schema 側は `uuid('contract_id')` (FK 宣言なし)、SQL 側も `uuid` のみ。FK 制約が一切張られていないので、誤った UUID を入れた状態で P2 で `contracts` を作っても整合性が取れない。
- 修正案: P1 では列ごと作らないか、`-- TODO(P2): add FK to contracts(id)` の comment を migration に明示的に書く。今は schema/sql どちらにも理由コメントがない。
- 減点: -3

### A-H-02 P1 必須テーブル `business_card_images` / `contact_memos` / `offline_queue` / `non_card_attachments` / `data_residency_config` / `sample_data_seeds` / `recent_views` / `sync_failure_log` / `autosave_drafts` / `pii_redactions`(P2 だが先行) がすべて未実装
- 場所: `packages/db/src/schema/` (なし)
- 仕様: `03_data_model` 「追加テーブル」セクションで Phase=P1 と明記:
  - `business_card_images` (表/裏、撮影緯度経度、light_quality)
  - `contact_memos` (voice/text)
  - `offline_queue` (Idempotency `UNIQUE(user_id, client_id)`)
  - `non_card_attachments`
  - `recent_views`, `sync_failure_log`, `autosave_drafts`, `data_residency_config`, `sample_data_seeds`
- 実装: `contacts.business_card_image_url` 1列で代替しているが、設計書では「複数枚の表/裏を別レコードで保持し ML classification と light_quality を持つ」スキーマ。1対多が必要。Week2-4 で名刺取込 UI (T-007) を実装する時に必ずブロッカーになる。
- 修正案: 0006_p1_supplemental.sql を切り、上記 9 テーブルを Week2 着手前に追加する。`offline_queue` の `UNIQUE(user_id, client_id)` は重複防止のクリティカルパス。
- 減点: -3 (scaffold スコープでも、Week2 開始前に必ず必要なため High)

### A-H-03 `notifications` の `type` に CHECK 制約なし
- 場所: `packages/db/src/schema/notifications.ts:13` / `0001_init_schema.sql:197`
- 仕様: `03_data_model` の `notifications.type text NOT NULL` のコメント例として `'recording_ready','reply_received','handoff_pending',...` と列挙されており、`14_state_machines` の各 transition で「通知作成」がアクションとして紐付けされる。Type が typo タイプセーフでない (例: `recoding_ready`) と alert ルートが死ぬが検知できない。
- 実装: `text('type').notNull()` (制約なし)
- 修正案: enum or CHECK を導入。あるいは TS 側で `notificationType` const を定義し、列に reference しない場合でも shared package で集中管理する。
- 減点: -2

### A-H-04 Zoom Webhook で payload サイズ上限と body re-read 安全性が無防備
- 場所: `apps/worker/src/routes/webhooks.ts:17`
- 仕様: `06_external_integrations` で「3秒以内に200を返す」「Webhook署名検証必須」「payload はキューへ投入し本処理は別」と規定。
- 実装: `await c.req.text()` で全 body をメモリにロード。Zoom は `recording.completed` で payload に download URL とトークン (短い) を載せるだけだが、bodyサイズ制限がないと DoS 余地。また `verifyZoomSignature` は HMAC を OK にしているが、`url_validation` 分岐では署名検証を**スキップ**して plainToken を返している。Zoom 仕様上 URL Validation 自体は署名なしで来るので正しいが、**`payload.event === 'endpoint.url_validation'` は本物の Zoom 以外でも投げられる**ため、レート制限がないと OAuth エンドポイント探索に使われる。
- 修正案:
  ```ts
  const MAX_BODY = 64 * 1024;
  const rawBody = await c.req.text();
  if (rawBody.length > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  // url_validation も per-IP rate limit (例: 10/min) を Hono middleware で
  ```
- 減点: -2

### A-H-05 worker の Zoom webhook で **pgmq enqueue が未実装**だが「受信OK」を返している
- 場所: `apps/worker/src/routes/webhooks.ts:43-45`
- 仕様: Zoom 側は「3秒以内に 200 が返らない場合 retry → 失敗が続けば webhook を一時的に disable する」。設計書 `06_external_integrations` フロー Step 5 で「pgmq:process_recording へジョブ投入し、その後200返却」と明確。
- 実装: `// TODO(T-011): pgmq.send('process_recording', payload)` のまま 200 OK を返している。これは scaffold スコープとはいえ、**本番に上げると payload を黙って捨てる**。少なくとも `meeting.zoom_meeting_id` の `UPSERT (ON CONFLICT zoom_meeting_id DO NOTHING)` と `pgmq.send` だけは Week1 で実装するか、明示的に 503 を返して Zoom に retry させるべき。現状は false-OK で**一番危ない**。
- 修正案: 最低限 `return c.json({ error: 'not_implemented' }, 503)` にしてペイロードロスト不可視化を防ぐ。
- 減点: -3

---

## Medium

### A-M-01 HNSW index の `ef_search` が runtime セット未指定
- 場所: `0002_triggers_p1.sql:24-26`
- 仕様: コメントには「ベンチで ef_construction=128, ef_search=64 を実測調整」とあるが、`ef_search` は session/transaction 単位の GUC (`set hnsw.ef_search = 64`) なので index 作成時に指定できない。RPC `match_knowledge` 内で `set local hnsw.ef_search = 64` を発行するか、Render で `pg_settings` の defaults を bump する必要がある。
- 実装: `with (m = 16, ef_construction = 128)` のみ。`ef_search` は postgres デフォルトの 40。
- 修正案: `0004_rpc_match_knowledge.sql` の関数本体先頭で `perform set_config('hnsw.ef_search', '64', true);` を入れる。
- 減点: -1

### A-M-02 `users.role` に `default 'sales'` が SQL 側にない
- 場所: `0001_init_schema.sql:14` vs `0005_auth_sync_trigger.sql:21`
- 仕様: `03_data_model` の `users.role` は CHECK のみで default 未指定だが、`handle_new_auth_user()` トリガが `role='sales'` で INSERT してくる。挙動的には OK だが「招待フローで admin が決める」のと矛盾し、招待前の OAuth 直接サインアップで sales 権限を勝手に付与してしまう。
- 修正案: `role` を NULL 可にして「未割当」を表現するか、`is_active=false` で初期作成して admin が approve するまでログイン拒否。Drizzle 側 schema で `role` を `notNull()` 強制しているのもこの設計を縛っている。
- 減点: -1

### A-M-03 `contact_duplicates.match_score` の範囲制約なし
- 場所: `0001_init_schema.sql:88` / `contacts.ts:71`
- 仕様: 仕様書では `numeric(3,2)` (=0.00-9.99) で「マッチスコア 0.00-1.00」前提だが CHECK が無い。
- 修正案: `check (match_score >= 0 and match_score <= 1)`。同じ問題が `contacts.ocr_confidence` にも当てはまる。
- 減点: -1

### A-M-04 `meeting_attendees` の (user_id) と (contact_id) に index がない
- 場所: `0001_init_schema.sql:143`
- 仕様: 「自分が出席した meeting 一覧」「contact ごとの meeting 一覧」を引くクエリは P1 ダッシュボードの中核。
- 修正案:
  ```sql
  create index meeting_attendees_user_idx on public.meeting_attendees (user_id) where user_id is not null;
  create index meeting_attendees_contact_idx on public.meeting_attendees (contact_id) where contact_id is not null;
  ```
- 減点: -1

### A-M-05 P1 必須ライブラリ `idb` (IndexedDB)、`workbox`、`jsqr`、`opencv-wasm`、`react-camera-pro` が未追加
- 場所: `apps/web/package.json`
- 仕様: `11_tech_stack_libs` の v2追加ライブラリ表で **P1** マークされている: `react-camera-pro / native MediaDevices`, `opencv-wasm`, `jsqr`, `workbox`, `idb`, `Whisper(faster-whisper or openai)`, `pyannote-audio` (Worker側).
- 実装: web/package.json には react-dropzone はあるが上記5本ともない。worker/package.json には `openai` (Whisper代替) はあるが、faster-whisper / pyannote 用の Python サブプロセス起動ライブラリ・FFI が一切ない。これは Week2 (T-007 名刺取込) に着手すると即詰まる。
- 修正案: 少なくとも `idb`, `jsqr` を web/package.json に追加。`opencv-wasm` と `react-camera-pro` は T-007 と同時で許容するが、依存解決の見通しを `docs/` に明示すること。
- 減点: -1.5

### A-M-06 `audit_logs` が schema 自体未実装
- 場所: 全 schema ディレクトリ
- 仕様: `03_data_model` で `audit_logs` は P2 だが、`08_security_rls` の dangerous action や `meetings DELETE admin only` ポリシーが「監査ログを残す前提」になっており、P1 で `recordings_delete_admin` などを使うと audit が無いので**Compliance 欠落**。最低限 P1 でも空のテーブルを切っておかないとアプリ層 audit logger が DB に書けない。
- 修正案: 0001 に `audit_logs` (id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at) と既存 index 3本を追加。
- 減点: -1

### A-M-07 `vector` extension の schema 配置が暗黙
- 場所: `0000_setup.sql:8` / `knowledge.ts:18-25`
- 仕様: Supabase は `vector` を `extensions` schema にインストールするのが推奨 (公式 advisor も警告)。`public` 直下にすると `pg_dump`/`pg_upgrade` で衝突しやすい。
- 修正案: `create extension if not exists vector with schema extensions;` + `create table … embedding extensions.vector(1536) …` または search_path 整備。
- 減点: -1

---

## Minor

### A-Mi-01 schema export の `index.ts` から `embeddingSourceType` などの enum 配列が web 側で再利用しづらい
- 場所: `packages/db/src/schema/index.ts`
- 仕様: shared package の `processBusinessCardPayload` などは zod だが、`embeddingSourceType` の enum 値リストが drizzle 依存で `@ksp/db` 経由でしか取れない。`@ksp/shared/constants` 側に逆輸出する方が next.js bundle が軽くなる。
- 減点: -0.5

### A-Mi-02 `recordings.processing_status='failed'` から `pending` への retry 遷移が状態機械で未定義
- 場所: `recordings.ts:51`
- 仕様: `14_state_machines` で recording は `any → failed → reprocessing → stage1_rerun` (M-6) と定義されているが、CHECK enum に `reprocessing` も `stage1_rerun` も無い。「failed→pending」と無理やり戻すと監査でわからない。
- 修正案: P1.5 で `recording_stages` テーブル (A-C-01) に逃がす設計が正解。コメントで予告するだけでも可。
- 減点: -0.5

### A-Mi-03 timezone 列が text で `users.timezone='Asia/Tokyo'` だけ前提
- 場所: `users.ts:13`
- 仕様: customer_timezones (P2) で TZ キャッシュを持つ予定だが、users 側は `pg_timezone_names` 名前を validate していない。typo `'Asia/Tokoy'` で渡すと date-fns-tz で破綻する。
- 修正案: アプリ層 zod で `validate against IANA list` する。Migration コメントで予告。
- 減点: -0.5

### A-Mi-04 `webhooks.zoom` route で `payload.event` の型ガードが弱い
- 場所: `webhooks.ts:25`
- 仕様: 様々な webhook event (`meeting.started`, `recording.paused`, `endpoint.url_validation` など) を P1〜P2 で扱う前提。
- 実装: 文字列直接比較 1ケース。switch + zod 推奨。
- 減点: -0.5

### A-Mi-05 CHANGELOG で「T-011 受信のみ実装済」と書きながら enqueue 未実装。誤解を招く
- 場所: `CHANGELOG.md:31`
- 仕様: 受信 ≠ 永続化。Pending セクションに「ペイロードはまだロストする」と注記すべき。
- 減点: -0.5

---

## まとめ
P1 必須スキーマ 10/10 のうち **`recording_segments`/`recording_stages` が欠落** (Critical) で、設計書 v2.3 の段階的成果物ステートマシンを表現できない。Zoom Webhook は署名検証/URL Validation/timestamp ±5分検証は正しく入っているが、**enqueue 未実装で false-OK を返している**ため payload ロストの本番リスクあり (High)。データモデルの細部 (CHECK 範囲、FK on delete、index、`audit_logs`/`offline_queue`/`business_card_images` など Week2 で必須となる P1 補助テーブル群) はまだ scaffold レベルで、Week2 開始前に 0006 migration が必要。テックスタック整合性は概ね高得点だが、IndexedDB/workbox/jsqr/opencv-wasm/react-camera-pro が web/package.json に未追加で、これらは T-007 名刺取込 UI 着手の即時ブロッカー。
