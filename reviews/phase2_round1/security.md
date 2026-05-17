# Security Round 1 Audit

監査対象: Phase 2 (T-007〜T-016) 12 並列 agent 実装、migrations 0034-0037 + apps/web Route Handler 群 + apps/worker pgmq consumer 群。

## スコア: 71 / 100

致命傷 4 件 + High 5 件で 95+ には届かない。Idempotency 機構の完全死亡、Storage path/RLS の不整合、API 401 の HTML redirect 化、SSRF 経路、service_role キーを web プロセスに直接持ち込む構造、search_queries の org_id 偽装、name 列 unique index 欠落 (実装は無視) など、本番投入前に潰すべき構造的欠陥が複数存在する。

---

## 強み

- migrations 0034-0037 はいずれも `enable row level security` + `for select/insert` policy + `for update/delete using (false)` の append-only 制約まで明示されており、`meeting_stage_transitions` は audit テーブルとして適切に書き換え不可。
- `search_queries` に retention 30 日の pg_cron 自動 purge を組んでおり、PII 保持期間設計が明確。
- contacts soft delete (`deleted_at`) の partial unique index (`where deleted_at is null`) で論理削除済 row が re-insert を blocking しない設計が正しい。
- BM25 query の `sanitizeForTextSearch()` (`[(){}\[\],:;]` 等を空白置換) で websearch_to_tsquery 経由の演算子 injection は無効化されている。`q.replace(/[%_]/g, '\\$&')` で `ilike` の LIKE-pattern injection も封じている。
- `defineRoute` で zod body/query 必須化、per-user rate limit、role gate の wrapper が統一されており、PATCH `/contacts/[id]`, `/merge`, `/stage` で owner 二重チェック (RLS + コード) が一貫している。
- pgmq enqueue は `lib/api/pgmq.ts` の単一経路に集約され、service_role キーを web 側で直叩きする箇所はそこ 1 ファイルに限定されている。
- `meeting_attendees` 付け替え → slave soft-delete → master verified の merge 順序が正しく、attendee 孤児を発生させない。
- `business-cards` バケットは private + MIME allowlist + 10MiB cap で wild file upload に強い。

---

## 脆弱性

### CRITICAL

**CRITICAL-S-01: Idempotency-Key 機構が完全に機能していない (web 全 mutating route)**
- 場所: `apps/web/src/lib/api/route.ts:169-226` (`beginIdempotency`)
- 内容: コードは `response_jsonb` 列と `status='succeeded'/'pending'` 値を参照しているが、実 DB は migration 0009_idempotency_keys.sql で `response_body` 列 + `status in ('processing','done','failed')` で定義されている。SELECT は不存在列で 42703 を返し、INSERT は CHECK violation で 23514 を返す。両エラーは try/catch で握り潰され `{ kind: 'unavailable' }` で fall-through する。さらに、`beginIdempotency` 自体が `apps/web/src` のどこからも呼ばれていない (grep 0 件)。`defineRoute` は header の存在と形式だけを検査しているため、Idempotency-Key を付けて 2 回送信すれば 2 回処理される。
- 影響: POST `/api/contacts`, `/api/contacts/upload-url`, `/api/contacts/[id]/merge`, `/api/meetings`, `/api/meetings/[id]/stage`, `/api/meetings/[id]/handoff`, `/api/search/click` の全リトライ経路で二重課金 (OCR / Whisper / Anthropic) と二重 enqueue (process_business_card)、二重 handoff 通知、二重 stage_transition audit row が発生。決済 / cost-guard の前提が崩れる。
- 攻撃: 認証済 user が同一 key で 100 回 POST すれば 100 contact row + 100 OCR job が走る (rate-limit は 60/min なので 30 秒で枠到達するが、複数 user で攻撃すれば cost-cap 突破)。

**CRITICAL-S-02: Storage path 命名規約が RLS と不一致 (business-cards bucket の事実上 RLS bypass)**
- 場所: `apps/web/src/app/api/contacts/upload-url/route.ts:43` (`storageKey = \`${user.id}/${objectId}.${ext}\``) vs `packages/db/src/migrations/manual/0035_storage_business_cards.sql:11` の path 規約 `{org_id}/{contact_id}/{yyyy-mm-dd}/{uuid}.{ext}`。
- 内容: RLS `storage_object_org_id(name)` は path 1st segment を uuid として `org_id` と比較する。実装は 1st segment に `user.id` を入れているので、`user.id` を uuid として parse → `org_id` と等値比較 → 常に false。本来なら全 upload が RLS 拒否されるはずだが、0033/0035 の `current_org_id() is null` fallback が GUC 未 SET 環境 (= 現状の Phase1 シングルテナント運用) で発火し、org check を完全に skip する。結果、business-cards bucket の org_id 検査は no-op で、`auth.uid() = owner` 1 本に劣化している。
- 影響: Phase2 cutover で multi-tenant 移行する瞬間に、Phase1 でアップロードされた全名刺画像が org-cross visible になる (path に org_id が含まれないため遡及 fix も不可能)。さらに、ファイル一覧 (LIST) で他 user の userId プレフィックスを列挙できれば object 名から userId を逆引きできる (PII リーク)。
- 修正方針: 即時に path 規約を `{org_id}/{user_id}/{uuid}.{ext}` に揃え、RLS は `split_part(name, '/', 1)::uuid = current_org_id() AND split_part(name, '/', 2)::uuid = auth.uid()` の二重判定に変更する。Phase1 既存 object は migration script で rename。

**CRITICAL-S-03: 401 認証失敗が API route で HTML redirect になる (auth bypass の前兆 + 動作不能)**
- 場所: `apps/web/src/lib/auth/server.ts:54` (`redirect('/login')`) を `requireUser()` 内で実行し、`apps/web/src/lib/api/route.ts:80` の `defineRoute` が API route から `requireUser()` を呼んでいる。
- 内容: Next.js の `redirect()` は内部で `NEXT_REDIRECT` シンボルを throw する。`defineRoute` の 139 行目 `catch (err)` はそれを通常エラーとして握り潰し 500 を返すか、もしくは redirect レスポンス (text/html 307) として返す可能性がある。いずれも仕様外 (`{error,code}` JSON 401 を返すべき) で、フロントの fetch エラーハンドリング (401 → /login 再ログイン) を破壊する。さらに、`requireUser()` 内で `public.users` 行が無いとき role を `sales` 固定で fallback している (server.ts:73, 99) ため、auth.users にだけ存在し public.users 未生成のアカウントが sales 権限で API を叩ける。
- 影響: 未認証リクエスト時に 401 JSON を期待する client が無限ループ。Sentry にも 500 が記録され実害 (redirect 例外) が観測できない。Phase 1 で 0032 auth-sync trigger が無効化された環境では「Supabase Auth は通るが public.users 未挿入」のユーザに sales 権限が付与され、contacts/meetings INSERT が成功する。
- 修正方針: `defineRoute` 側で `requireUser()` の代わりに API 専用の `getUserOrThrow()` を新設し、未認証時は `unauthorized()` JSON を返す。public.users 不在時は 403 で fail-close。

**CRITICAL-S-04: SSRF — Zoom downloadUrl を pgmq message 経由でそのまま fetch**
- 場所: `apps/worker/src/lib/zoom.ts:134-152` (`downloadZoomRecording`) と `apps/worker/src/jobs/recording-download.ts:194,207` (`downloadUrl = message.downloadUrl` → `downloadZoomRecording(downloadUrl)`)。
- 内容: pgmq message に含まれる `downloadUrl` は zod 検証 schema (processRecordingPayload) を通っているはずだが、`url()` validator は internal IP / file:// / private CIDR を弾かない。Zoom webhook の signature 検証は別 path (zoom-webhook.ts) で行われているが、worker は queue から payload を取って Bearer token 付きで fetch するため、攻撃者が webhook ingestion / 内部 enqueue 経路に到達できれば `http://169.254.169.254/latest/meta-data/iam/security-credentials/` 等の AWS IMDSv1 / `http://10.0.0.X` 内部サービス / `file:///etc/passwd` を fetch でき、しかも Bearer Zoom OAuth token を相手に送ってしまう (= Zoom 認可情報の意図しない exfiltration)。
- 攻撃: 1) zoom-webhook の signature が緩い実装の場合は外部攻撃者から直接、2) 内部 enqueue 経路を持つ任意の従業員から、`downloadUrl: 'http://169.254.169.254/...'` を pgmq.send → worker が EC2 IAM token を取得 → Sentry/log に流出 (catch 200 char で `body.slice(0,200)` を err message に入れている)。
- 修正方針: `downloadZoomRecording` の冒頭で URL を parse し、`zoom.us` または `*.zoom.us` host のみ許可、protocol は https のみ。さらに DNS resolve 後に private range (RFC1918, 169.254/16, ::1, fc00::/7) を block する SSRF guard を入れる。エラー body を log/Sentry に流す部分は redact。

---

### HIGH

**HIGH-S-05: search_queries.org_id がクライアント由来の DEFAULT_ORG_ID で偽装可能 / 監査破綻**
- 場所: `apps/web/src/app/api/search/route.ts:40,416-426` および `apps/web/src/app/api/search/click/route.ts:22,31-41`。
- 内容: `org_id` の解決を `await supabase.from('users').select('org_id').eq('id', user.id)` (anon client, cookie) で行い、失敗すると hard-coded `00000000-0000-0000-0000-000000000001` に fallback する。0033 の fallback も合わせると、users 行が無い user は **全テナント共通の org_id を背負って search_queries に INSERT** される。RLS は INSERT 時に `user_id = auth.uid()` しか check しないため、嘘 org_id も書き込める。
- 影響: PII を含むクエリログ (`query_text`, max 1000 char) が「誰のテナントか」を特定できなくなる。retention 30 日後の hard-delete までは monitoring 困難。analyst の `manager+admin` SELECT が org cross-tenant に見える危険。
- 修正方針: org_id は SQL の `current_org_id()` で DB 側に挿入させる (DEFAULT 値か trigger)。fallback const 削除、users 行が解決できない場合は 412 を返す。

**HIGH-S-06: contacts.business_card_image_hash の dedupe lookup に org_id 条件無し (RLS 依存)**
- 場所: `apps/web/src/app/api/contacts/route.ts:38-43` と `upload-url/route.ts:48-54`。`.from('contacts').select('id').eq('business_card_image_hash', body.contentSha256).is('deleted_at', null)` は org_id を where に入れていない。
- 内容: 0033 の null-fallback が効いた状態だと、org_id check が事実上 no-op になり、攻撃者は他テナントの contact_id (uuid) を「同じ画像の hash が存在するかどうか」だけで oracle attack できる (任意の hash を送って duplicateOf が non-null になる → その uuid が他 org の contact の id か自 org の id か分からないが、IDOR の起点になる)。
- 修正方針: app コードで `.eq('org_id', user.orgId)` を明示。RLS だけに任せず、コード側でも org スコープを書く (defense-in-depth)。

**HIGH-S-07: companies upsert / contact merge で 他 org の company id を盗まれる**
- 場所: `apps/web/src/app/api/contacts/[id]/route.ts:74-93` (companies 存在検索 → INSERT)。
- 内容: `.from('companies').select('id').eq('name', trimmed).limit(1).maybeSingle()` で org_id 条件無し。0033 fallback 環境で他テナントの companies が一致すると、他 org の company_id を自テナントの contact に紐付ける。RLS で SELECT は org filter が効くはずだが、phase1 cutover 前は no-op。
- 修正方針: 同じく `.eq('org_id', ...)` を明示。

**HIGH-S-08: PII を含む長文を logger / Sentry にそのまま流している**
- 場所: 
  - `apps/web/src/app/api/search/route.ts:649,665` (`captureException(err, { where, queryId })` 直前で search_queries insert 失敗時 → query_text が catch 中の err.detail に含まれる可能性)。
  - `apps/worker/src/jobs/recording-summarize.ts:160-172,242-252` (`logger.info({...estimatedCostUsd, segmentCount...}, 'recording.summarize completed')` — segment は ok だが、`markFailed(message.recordingId, (err as Error).message.slice(0,500), log)` で transcript の一部が processing_error 列に書かれて RLS で参照可能になる)。
  - `apps/worker/src/lib/zoom.ts:78,146` で Zoom OAuth/download 失敗時に `body.slice(0,200)` を Error message に入れる (Bearer token が response body に echo back されると Sentry/Logger に渡る)。
- 影響: GDPR / 個人情報保護法上「ログ最小化原則」違反。Sentry にアクセスできる worker_admin が顧客発話の断片を見られる。
- 修正方針: error 経路の `body`/`message` を redact 化、PII keyword (email/phone regex) をフィルタする logger middleware を導入。

**HIGH-S-09: meeting_stage_transitions.reason に PII が無検査で入る**
- 場所: `apps/web/src/app/api/meetings/[id]/stage/route.ts:88-90,100` (`body.reason` を auditPayload.reason にそのまま INSERT)。
- 内容: zod schema (`meetingStageTransitionRequestSchema.reason`) に max length / content filter が無さそう (要確認だが現状 schema を見る限り `z.string()` 単発)。担当営業が「失注理由: 山田太郎 03-1234-5678」と書くと、append-only audit に PII が永久保存され、論理削除 RLS も無い。
- 修正方針: zod schema で max 500 文字 + PII regex で sanitizer / hash 化。append-only テーブルには `reason_redacted text` 列を追加し原文を保存しない。

---

### MID

**MID-S-10: PATCH /contacts/[id] と /meetings/[id] の existing lookup が deleted_at を WHERE で除外している (admin の操作不能 + 404 mask)**
- 場所: `apps/web/src/app/api/contacts/[id]/route.ts:55` (`is('deleted_at', null)`), `apps/web/src/app/api/meetings/[id]/route.ts:101-108`。
- 内容: 0034 / 0036 で `current_user_role()='admin'` は soft-deleted も見える policy を入れているが、PATCH ハンドラは `.is('deleted_at', null)` をコードで掛けているため admin でも soft-delete 復活ができない。また 404 が「実在するが論理削除済」か「存在しない」かを区別できない (UX 上は OK だが、運用復旧フローが詰む)。
- 修正方針: admin 限定で `deleted_at` フィルタを外す option を追加、もしくは別 endpoint /admin/contacts/[id]/restore を切る。

**MID-S-11: meeting_attendees 付け替えが org_id 検査無し (cross-org leak)**
- 場所: `apps/web/src/app/api/contacts/[id]/merge/route.ts:88-103` (`update({ contact_id: master }).eq('contact_id', new)` を attendees / meetings の両方に対して org スコープ無し実行)。
- 内容: RLS で防御できる前提だが、0033 fallback が効いてるので他 org の attendees の contact_id が書き換わるリスク。defense-in-depth で WHERE に org_id を明示すべき。

**MID-S-12: rate-limit が per-user + per-route で行われるため、login 不要の同一ユーザ多重ログインで枠 N 倍化**
- 場所: `apps/web/src/lib/api/route.ts:83` (`rlKey = web:${user.id}:${req.nextUrl.pathname}`)。
- 内容: 同一 user.id でも複数セッション (multiple devices / open tabs) は同じ枠を共有する点は正しいが、token bucket 状態が in-process memory (rateLimitWeb) の場合、Render が複数 instance になると per-instance に分割されて 30/min → 60/min, 90/min と倍化する。Distributed rate-limit (Redis / Upstash) ではない場合の cap 設計が甘い。
- 修正方針: 上位 (CDN / middleware) で per-IP + per-user の正確な計測を行うか、Redis-backed token bucket に移行する。

**MID-S-13: handoff manual_notes 改竄 — manager が任意の actor 文字列を埋め込める**
- 場所: `apps/web/src/app/api/meetings/[id]/handoff/route.ts:110-117`。
- 内容: `actorLabel = user.fullName ?? user.email ?? user.id` を `manual_notes` に prepend している。`fullName` は users.name (本人が編集可能) なので、`name = "山田 太郎 → 自動承認 ←"` のような文字列を入れると `--- ハンドオフ 2026-05-17 by 山田 太郎 → 自動承認 ← → cs_user ---` という偽の audit 痕跡を残せる。
- 修正方針: manual_notes の prefix は user.id のみ。fullName の改ざんを front 表示時に escape。または audit を専用テーブル (notifications / audit_logs) に集約。

**MID-S-14: PostgREST `.or()` 文字列構築の手書きエスケープが不完全**
- 場所: `apps/web/src/app/api/contacts/[id]/duplicates/route.ts:173-175` (`escapeOr` は `,` と `)` のみ escape)。
- 内容: PostgREST の or() syntax は `field.op.value` 形式で `.`, `:`, `*`, `(`, `"` 等の制御文字も解釈する。SHA256 hex / uuid / email 文字列は安全に見えるが、linkedin_url は user-supplied かつ自由文字なので `https://linkedin.com/in/foo,or(id.eq.OTHER_UUID)` のような value を仕込まれると PostgREST が parse する。実害: 任意 contact の id をフィルタ inject (検索範囲拡張) する程度だが、論理エラー多発の起点になる。
- 修正方針: linkedin_url 列を or() に入れない (eq) のみで個別 query 化、もしくは postgrest-js の query builder (`.or([...])` 配列形式) を使う。

---

### LOW

**LOW-S-15: notifications 通知の type 検証が緩い**
- 場所: handoff route で `type: 'handoff_pending'` literal を使うが、validation は DB CHECK 任せ。type 値変更時にエラーがアプリ層に出ない。

**LOW-S-16: search RPC `match_knowledge` が embedding を log に流さない設計だが、`vectorRes.topSimilarity` を `Math.min(0.999, ...)` で clamp している (numeric(4,3) の 0.999 cap)。0.9995 のスコアを記録できないので analytics 解析の精度低下。**

**LOW-S-17: business-cards bucket RLS の `owner = auth.uid()` 制約は signed upload URL 経由では owner が anon (NULL) になることがある。実機検証必須。**

**LOW-S-18: contacts INSERT 時に `created_by_user_id` を user.id にセットしているが、0034 migration 上は FK のみで CHECK 無し → service_role 経由で他 user の id を書ける。本ルートでは bug なしだが将来の admin route で漏れる。**

---

## 修正方針

### P0 (本番デプロイブロッカー、48h 以内)

1. **Idempotency 機構の全面修正** (CRITICAL-S-01)
   - `beginIdempotency` の column 名を `response_body` に、status を `done/processing/failed` に揃える。
   - `defineRoute` で mutating route 時に `beginIdempotency` を呼び、`cached` なら早期 return、`fresh.claim()` を handler 終了時に呼ぶ injection point を追加する。
   - 全 mutating route で実 dedup が効くことを E2E で確認 (同 key 2 回 POST → contacts row 1 件)。

2. **Storage path / RLS 整合性修正** (CRITICAL-S-02)
   - `apps/web/src/app/api/contacts/upload-url/route.ts:43` の `storageKey` を `${user.orgId}/${user.id}/${objectId}.${ext}` に変更 (user.orgId を AppUser に追加)。
   - 0035 RLS を `split_part(name,'/',1)::uuid = current_org_id() and split_part(name,'/',2)::uuid = auth.uid()` の strict 二重判定に書き換え、null-fallback を `business-cards` policy では使わない (storage の特殊扱い)。
   - Phase1 既存 object は admin migration で rename。無理なら全削除して再アップロード強制。

3. **API auth 401 を正しく返す** (CRITICAL-S-03)
   - `getUserForApi()` を新設し redirect しない・JSON 401/403 を返す。`defineRoute` 内で利用。
   - public.users 不在時は fail-close (403)。0032/0033 の null fallback を auth では使わない。

4. **SSRF guard** (CRITICAL-S-04)
   - `downloadZoomRecording` 冒頭で URL parse → host allowlist (`.zoom.us` 末尾一致 + scheme=https のみ) を強制。
   - DNS resolve 後の IP が private range なら refuse (`net.isIP` + 簡易 CIDR check)。
   - error body の log/Sentry 流出を redact。

### P1 (1 週間以内)

5. search_queries.org_id を DB DEFAULT/trigger で current_org_id() から取得 (HIGH-S-05)
6. contacts dedupe / companies upsert の queries に明示 org_id 条件 (HIGH-S-06, HIGH-S-07)
7. logger / Sentry の PII redact 機構導入 (HIGH-S-08)
8. meeting_stage_transitions.reason の zod schema 強化 + PII sanitize (HIGH-S-09)

### P2 (1 ヶ月以内 / backlog)

9. MID-S-10〜S-14 を Phase2 cutover 計画に組み込む
10. rate-limit を Redis-backed 分散化 (MID-S-12)
11. PostgREST or() の手書きエスケープ撤廃 (MID-S-14)

### P3 (LOW / backlog)

12. LOW-S-15 / 16 / 17 / 18

---

## 監査メモ

- `apps/web` 全 mutating route で `service_role` 直叩きは `lib/api/pgmq.ts` のみに局所化されており、設計は正しい。ただし pgmq.ts は `pgmq_send` RPC を呼ぶだけなので、service_role の悪用面は小さい。
- 0036 `meeting_stage_transitions` の append-only RLS (`for update using (false)`) と `0037 search_*` の retention cron は本 audit で評価できた範囲では適切。
- contacts dedupe ロジック (lib/api/contacts-dedupe.ts) は純関数で SQL injection リスク無し。良い構造。
- BM25 / RRF の sanitize は `[(){}\[\],:;]` 等を空白置換していて、PostgREST の文字列クエリパラメータ経路でも安全。
- 0034 partial unique index で email 重複が deleted=null 限定なのは正しい設計。
