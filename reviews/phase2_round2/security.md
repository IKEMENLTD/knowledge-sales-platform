# Security Round 2 Audit

監査対象: Phase 2 Round1 で指摘した 18 件 (CRITICAL 4 / HIGH 5 / MID 5 / LOW 4) を中心に、apps/web ルートハンドラ群 + apps/worker pgmq consumer 群 + migrations 0009/0033/0035/0036/0037/0038 を再点検。Round1 採点 71 から +伸び分を測定し、未解消の P0 と新規発見を整理する。

## スコア: 79 / 100  (前回 71 → 79, +8)

CRITICAL のうち 2 件 (S-01 / S-04 主要部) が解消、CRITICAL-S-02 (storage RLS) は INSERT 経路のみ解消で SELECT 経路は依然 wide-open、CRITICAL-S-03 (API 401/403 HTML redirect) は完全に未着手という状態。HIGH も S-05/S-06/S-07/S-09 が前回そのまま残っており、95+ には届かない。

---

## Round1 脆弱性の解消状況

### CRITICAL

- **CRITICAL-S-01 Idempotency 機構の死亡**: **RESOLVED**
  - `apps/web/src/lib/api/route.ts:230-312` の `beginIdempotency` で列名を migration 0009 と完全一致 (`response_body` / `response_status` / `request_hash` / `status`)、status enum も `'processing' | 'done' | 'failed'` に統一。
  - `defineRoute` 内 (151-190 行目) で raw body の SHA-256 → `beginIdempotency` → `cached` 時は handler スキップして `response_body` をそのまま返却、`in_progress` / `conflict` は 409、`unavailable` は dedup skip して通常実行という流れを実装。
  - 2xx 完了時に `claim(status, response)`、非 2xx で `fail()` を呼ぶ仕組みが配線済。Cookie 経由の anon supabase で実行されるため RLS `user_id = auth.uid()` も成立。
  - 残懸念 (MID 級): (a) `existing.status === 'processing'` 判定で `expires_at` 期限切れチェックが無く、worker クラッシュ後の幽霊 row が後続を 24h 滞留させうる (`apps/web/src/lib/api/route.ts:272`)。(b) 別 user が同 key を先に握ったケースは RLS で SELECT が NULL → upsert が `with check` 違反で失敗 → `unavailable` 経路に落ちて dedup を skip。実害は限定的だが「dedup 不能」の DoS にはなる。

- **CRITICAL-S-02 Storage path/RLS 不整合**: **PARTIAL**
  - migration `0038_round2_storage_fix.sql` で helper `storage_object_user_id(name)` を追加し、INSERT policy は `bucket_id='business-cards' and owner = auth.uid() and storage_object_user_id(name) = auth.uid()` の AND 三重判定で fail-close 化。`upload-url/route.ts:43` の `${user.id}/${uuidv4}.${ext}` 形式と整合。INSERT 経路は OK。
  - **SELECT policy が依然 wide-open (致命的)**: `0038_round2_storage_fix.sql:34-48` の business_cards_select は OR 結合で
    ```
    owner = auth.uid()
    OR storage_object_user_id(name) = auth.uid()
    OR public.current_org_id() is null      -- ← Phase1 では常に true
    OR storage_object_org_id(name) = public.current_org_id()
    ```
    Phase1 GUC 未 SET 環境 (= 0033 の null fallback 前提) では第 3 disjunct が常に真となり、**任意の認証済 user が他人の名刺画像を SELECT できる**。0035 と同じ穴を 0038 が引き継いだだけで、Round1 で指摘した「Phase2 cutover で名刺が org-cross visible になる」リスクは未解消。
  - storage_key (UUIDv4 + user_id prefix) は推測困難なため即時 enumeration は困難だが、`contacts.business_card_image_url` 列 (= storage_key 同等) は contacts SELECT 経由で manager/admin に可視 → admin が他テナント画像を bucket 直叩きできる経路が現状残る。defense-in-depth の喪失。
  - 修正方針: business_cards_select の `or public.current_org_id() is null` を AND の中に格下げするか、bucket 専用の strict policy として削除する。Phase1 でも個人スコープ (owner / path-prefix) で十分なので org fallback は不要。

- **CRITICAL-S-03 API 401/403 が HTML redirect になる**: **OPEN (未着手)**
  - `apps/web/src/lib/auth/server.ts:54` `redirect('/login')` および `:103,:107` の `/403?reason=...` redirect が Round1 時点と完全同一。`defineRoute` (`apps/web/src/lib/api/route.ts:80`) は引き続き `requireUser()` を直呼びしている。
  - 未認証 access は middleware (`middleware.ts:96-103`) が先に redirect するため API には到達しないが、**role gate (例: `/api/meetings/[id]/handoff` の `role: 'manager'`) で sales user が叩いたケース** は依然として `redirect('/403?reason=role&...')` が throw → `defineRoute` の catch (193-200) が掴んで `{ error: 'internal_error', code: 'internal_error', message: 'NEXT_REDIRECT;replace;/403?reason=...' }` 500 を返す。
  - 影響: 1) フロントは 403 ハンドラを書いても発火しない、2) `message` フィールドに redirect target が leak、3) Sentry が role gate 違反を 500 系として誤集計し本物の障害と区別不能。
  - 修正方針: API 専用の `requireApiUser()` を新設 (redirect を投げず `{ ok: false, status: 401|403 }` を返す)、`defineRoute` 内で utilise。Round1 で同じ修正方針を提示済だが実装が未着手。

- **CRITICAL-S-04 Zoom downloadUrl の SSRF**: **RESOLVED (主要観点) / PARTIAL (周辺リスク)**
  - `apps/worker/src/lib/zoom.ts:167-202` `assertZoomDownloadHost()` で以下を block:
    - 非 https (`url.protocol !== 'https:'`)
    - URL 内 credential (`url.username || url.password`)
    - IPv4 リテラル (RFC1918 / 127.0.0.0/8 / 169.254/16 / 192.168/16 / 0.0.0.0/8 / 172.16-31/12)
    - 公開 IPv4 リテラルでも Zoom domain でなければ reject
    - IPv6 リテラル (`[...]`) 全部
    - hostname allowlist (`zoom.us` 厳密一致 / `.zoom.us` suffix)
  - 検証:
    - `http://169.254.169.254/...` → protocol !== https で reject ✓
    - `file:///etc/passwd` → protocol !== https で reject ✓
    - `http://10.x.x.x` → protocol !== https で reject ✓ (https にした場合は IPv4 private check で reject ✓)
    - `https://[::1]/foo` → IPv6 literal で reject ✓
    - `https://attacker.com/foo` → allowlist 不一致で reject ✓
    - `https://user:pass@zoom.us/foo` → credential check で reject ✓
  - 60s timeout (`AbortController`) も実装され、redirect (300-399) は manual で受けて再帰呼出して再 host check (227-231)。
  - **新規 MID 級懸念**:
    1. **無制限 redirect**: `downloadZoomRecording` の recursion に max-redirects がない (`zoom.ts:226-231`)。攻撃者が *.zoom.us ドメイン (= Zoom 自体) で開いた meeting に対して長い redirect chain を仕込めば DoS。各 hop で 60s timer が新規発行されるので合計 timeout が無限に膨張。MID。
    2. **無制限 response size**: `await res.arrayBuffer()` (237) はサイズ上限なし。Zoom がメガバイト級ファイルを返す前提でも、攻撃用 *.zoom.us subdomain が乗っ取られた場合に GB 級レスポンスで worker メモリ爆破可能。Content-Length プリチェック + streaming + max bytes (例: 5GB) を入れるべき。MID。
    3. **redirect 先 host check 後のタイミング差**: 並行リクエストで TOCTOU は無いが、`url.toString()` を fetch に渡す際に URL 再構成で query 部の % エンコードが想定外動作する可能性。低リスク (LOW)。
  - 主要観点 (IMDSv1 / file:// / 内部 IP) は確実に閉じているため CRITICAL-S-04 自体は RESOLVED 扱い、新規 MID を 2 件追加とする。

### HIGH

- **HIGH-S-05 search_queries.org_id 偽装**: **OPEN**
  - `apps/web/src/app/api/search/route.ts:40,416-426` で `DEFAULT_ORG_ID = '00000000-...-001'` fallback が残存。
  - `search/click/route.ts:22,31-41` も同パターン。
  - 修正方針 (前回提示): DB DEFAULT/trigger で `current_org_id()` から自動挿入し、フロント側からの org_id 偽装を不可能にする。app コードでは org_id を渡さない。

- **HIGH-S-06 contacts dedupe lookup の org_id 未指定**: **OPEN**
  - `contacts/route.ts:37-43` (`existingId` 検索) と `contacts/upload-url/route.ts:48-54` (`duplicateOf` 検索) のいずれも `.eq('business_card_image_hash', ...)` のみで org スコープ未明示。
  - RLS の org null-fallback と組み合わさると、攻撃者が他テナント contact の存在を oracle attack できる。

- **HIGH-S-07 companies upsert で他 org の company id を奪取**: **OPEN**
  - `contacts/[id]/route.ts:73-93` で `.from('companies').select('id').eq('name', trimmed)` に org_id 無し。0033 fallback 環境で他テナントの companies が一致すると自テナント contact が他 org の company に紐付く。

- **HIGH-S-08 PII を含む長文を logger / Sentry に流出**: **PARTIAL**
  - `apps/worker/src/lib/zoom.ts:234` のエラーパスは body 出力を削除し status のみログに変更 (`PII / token を漏らさないよう body は記録しない (status だけ)`) で改善 ✓
  - `apps/worker/src/jobs/recording-summarize.ts:100` `processing_error: errorText.slice(0, 500)` は依然として transcript 断片が DB に永続化されるリスクあり
  - `apps/worker/src/jobs/ocr.ts:393` の `markPendingReview` は文字列を入れていないが、`processOcrJob` のエラー経路で provider response が catch block に伝播 → `log.error({ err: (err as Error).message }, 'ocr job threw')` で logger 出力 (379)。provider が PII を message に含めるとログに残る。
  - logger middleware による redact 機構 (email/phone regex) は未導入。

- **HIGH-S-09 meeting_stage_transitions.reason に PII 無検査**: **OPEN**
  - `apps/web/src/app/api/meetings/[id]/stage/route.ts:83-100` で `body.reason` をそのまま `auditPayload.reason` に INSERT。zod schema 側の max length / PII filter は引き続き入っていない。append-only audit テーブルなので入った PII は事実上永久保存。

### MID

- **MID-S-10 PATCH lookup が deleted_at を除外**: **OPEN** (`contacts/[id]/route.ts:55`, `meetings/[id]/route.ts:101-108`)
- **MID-S-11 merge の attendees/meetings 付け替えに org_id 検査無し**: **OPEN** (`contacts/[id]/merge/route.ts:88-103`)
- **MID-S-12 rate-limit が in-process memory のみで multi-instance で枠倍化**: **OPEN** (`lib/rate-limit.ts:25` の `const buckets = new Map<>` がプロセスローカル)
- **MID-S-13 handoff manual_notes に actor 改竄混入**: **OPEN** (`handoff/route.ts:110-117` で `user.fullName` をエスケープ無しで manual_notes に prepend)
- **MID-S-14 PostgREST `.or()` 手書きエスケープが不完全**: **OPEN** (`contacts/[id]/duplicates/route.ts:173-175` の `escapeOr` は `,` `)` のみ)

### LOW

- LOW-S-15〜S-18: いずれも Round1 から未着手。優先度低のため放置可。

---

## 新規発見 (Round 2 でレビュー対象が広がったことで顕在化)

### CRITICAL

- **NEW-CRITICAL-S-19 (実体は CRITICAL-S-02 の SELECT 経路)**: 上の CRITICAL-S-02 PARTIAL に統合済。

### HIGH

- **NEW-HIGH-S-20: `meeting_stage_transitions` INSERT が org_id 列を渡さず NOT NULL 違反で audit が破綻**
  - 場所: `apps/web/src/app/api/meetings/[id]/stage/route.ts:93-101` (`auditPayload` に `org_id` キー無し)。
  - 内容: `packages/db/src/migrations/manual/0036_meetings_phase2.sql:24` で `org_id uuid not null` と定義されているが DEFAULT が無い (0006 add_org_id では既存テーブルにのみ default を付与し、Phase2 で追加された 0036 系は対象外)。route.ts は `meeting_id, changed_by_user_id, from_stage, to_stage, from_deal_status, to_deal_status, reason` のみ insert → Postgres 23502 (`null value in column "org_id"`) でブロック。
  - 影響: 全 stage transition が 500 で audit 保存失敗 → handler が `errorResponse(500, 'stage_transition_audit_failed', ...)` を返し、meetings UPDATE もスキップ。結果として営業がステージを動かせなくなる業務影響だけでなく、**監査要件 (append-only audit) が物理的に成立していない状態**。
  - 修正方針: 0036 の `org_id` 列に `default '00000000-...-001'::uuid` を追加する migration を出すか、route 側で `org_id: '00000000-...-001'` を明示。defense-in-depth では trigger 経由で `current_org_id()` を自動挿入が望ましい。
  - Severity: 機能停止 + 監査破綻のため HIGH。

- **NEW-HIGH-S-21: Origin / Sec-Fetch-Site / CSRF token のチェック無し**
  - 場所: `apps/web/src/lib/api/route.ts` (defineRoute 全体)、`apps/web/src/middleware.ts`。
  - 内容: defineRoute は Idempotency-Key header と JSON body schema は強制するが、`Origin` ヘッダや `Sec-Fetch-Site` の検証を行わない。Supabase SSR の cookie は SameSite 既定値 (= Lax) なので GET の CSRF は緩和されるが、POST/PATCH/DELETE への CSRF は SameSite=Lax + JSON Content-Type に依存している。新しめのブラウザでは Content-Type=application/json の cross-site POST は CORS preflight が必要なので大概は止まるが、`Content-Type: text/plain` で送られた場合は preflight なしで通る (history fetch、form submit 経由)。
  - 影響: 攻撃者ページが `fetch('/api/meetings/.../handoff', { method: 'POST', credentials: 'include', body: '{"toUserId":...}', headers: {'Content-Type':'text/plain'}})` を送るとブラウザは認証 cookie を付けて通す可能性。defineRoute 側で `req.text()` → `JSON.parse` するため、Content-Type が text/plain でも JSON body として処理されてしまう。Origin 検証が無いので任意の外部サイトから state-changing 操作が可能。
  - 修正方針: `defineRoute` 冒頭で mutating method のとき `req.headers.get('origin')` を取り、`env.NEXT_PUBLIC_APP_URL` の origin と一致しない場合は 403 (`csrf_origin_mismatch`)。`sec-fetch-site` も同時に検査 (`same-origin` 以外を弾く) すれば二重防御。
  - Severity: HIGH (state-changing API への CSRF。Idempotency-Key 必須があるので連打は限定的だが、単発で handoff / merge / stage transition / delete が攻撃成立)。

### MID

- **NEW-MID-S-22: idempotency_keys の expires_at 切れた `processing` row を再利用不能**
  - 場所: `apps/web/src/lib/api/route.ts:272` (`if (existing.status === 'processing') return { kind: 'in_progress' }`)。
  - 内容: schema 0009 では `expires_at` 24h で expire するが、SELECT は `expires_at < now()` を考慮していない。worker クラッシュ等で `processing` のまま残った row は 24h 経過しても `in_progress` を返し続け、cleanup job (現状無し) が走るまで同 key の操作が永久に 409 になる。
  - 修正方針: SELECT 条件に `expires_at > now()` を入れ、expire 済 row は fall-through で上書き許可。さらに pg_cron で expired 行を毎日 delete するジョブを追加。

- **NEW-MID-S-23: Zoom recording downloadUrl の redirect chain / response size 無制限**
  - 上 CRITICAL-S-04 の "PARTIAL" 節参照。

- **NEW-MID-S-24: `search_queries.query_text` への PII redact 無し**
  - 場所: `apps/web/src/app/api/search/route.ts:640` (`query_text: body.q.slice(0, 1000)`)。
  - 内容: 検索クエリに「山田太郎 03-1234-5678」を打つと 30 日間 DB に保管。0037 で retention cron が動く前提だが、manager+admin は 30 日間自由閲覧可能。設計書では「PII 化リスクが高いので原文は 30 日で hard delete」と書いてあるものの、保管中の PII を redact する仕組みは無い。
  - 修正方針: 1) email/phone regex で zod 段階で reject、もしくは 2) `query_text` を hash 化して原文は保存しない、3) manager 表示時に redact する view を追加。

### LOW

- **NEW-LOW-S-25: ZOOM_HOST_ALLOWLIST に `zoomgov.com` / `zoomgov.us` が無い**
  - 政府機関 Zoom (Zoom for Government) の download_url は `*.zoomgov.us` などに来る。本案件は B2B SaaS 想定なので影響は限定的だが、将来対応時に allowlist 追加が必要。

---

## 残課題 (P0 / P1 / P2)

### P0 (本番デプロイブロッカー、48h 以内)

1. **CRITICAL-S-02 storage_business_cards SELECT policy の strict 化**
   - `0038_round2_storage_fix.sql:34-48` の OR 句から `or public.current_org_id() is null` を撤去 (もしくは AND の中に格下げ)。
   - 検証: 別 user で `supabase.storage.from('business-cards').download(otherUserPath)` が 403 になることを E2E で確認。

2. **CRITICAL-S-03 API 専用 requireApiUser() の新設**
   - `apps/web/src/lib/auth/server.ts` に `requireApiUser()` 追加 (redirect 投げない、`{ kind: 'ok' | 'unauthorized' | 'forbidden' }` を返す)。
   - `defineRoute` で `requireUser` を置換し role gate も JSON 403 に変換。
   - 検証: sales user で `/api/meetings/[id]/handoff` を叩いて 403 JSON が返ること。

3. **NEW-HIGH-S-20 meeting_stage_transitions.org_id default 付与 migration**
   - `0039_stage_transitions_org_id_default.sql` で `alter table public.meeting_stage_transitions alter column org_id set default '00000000-0000-0000-0000-000000000001'::uuid`。
   - 検証: stage 変更 → audit row が 1 行 INSERT される E2E。

4. **NEW-HIGH-S-21 Origin / Sec-Fetch-Site 検証**
   - `defineRoute` 冒頭で mutating method 時に `req.headers.get('origin')` を `env.NEXT_PUBLIC_APP_URL` と比較し、不一致なら 403。
   - 検証: 別 origin から fetch して 403 が返ること、同 origin / Sec-Fetch-Site: same-origin は 200。

### P1 (1 週間以内)

5. **HIGH-S-05 search_queries.org_id を DB 側で current_org_id() に固定**
6. **HIGH-S-06 / S-07 contacts / companies の lookup に `.eq('org_id', user.orgId)` 明示** + `AppUser.orgId` を `requireUser` の戻り値に追加
7. **HIGH-S-08 logger 全体に PII redact middleware (email/phone/SSN regex)**
8. **HIGH-S-09 meeting_stage_transitions.reason の zod schema 強化** (`z.string().max(500).regex(/[^\d-]/g, ...)` で PII 簡易 sanitize)
9. **NEW-MID-S-23 zoom.ts に max-redirects=3 + max response size=2GiB + Content-Length 事前チェック**

### P2 (1 ヶ月以内 / backlog)

10. NEW-MID-S-22 idempotency_keys の expires_at 検査追加 + pg_cron purge job
11. NEW-MID-S-24 search_queries.query_text の hash 化 or PII redact
12. MID-S-10〜S-14 を Phase2 cutover 計画に組み込む
13. MID-S-12 rate-limit を Redis-backed 分散化 (Upstash 等)
14. MID-S-14 PostgREST `.or()` 手書きエスケープ撤廃 → query builder 配列形式

### P3 (LOW / backlog)

15. NEW-LOW-S-25 zoomgov.com allowlist 追加
16. LOW-S-15 / 16 / 17 / 18

---

## 監査メモ

- CRITICAL-S-01 の Idempotency 機構修正は完成度が高く、column 名 / status enum / supabase RLS との整合性、cached / in_progress / conflict / fresh / unavailable の 5 状態モデルが defineRoute から見て透過に扱える設計。`existing.status === 'processing'` の expiry 切れ判定だけ追加すれば完璧。
- CRITICAL-S-04 SSRF guard は IPv4 / IPv6 / scheme / hostname allowlist の 4 観点を網羅し、redirect で host check を再帰させる構造も正しい。残課題は I/O リソース上限 (redirect chain / response size / total timeout) の DoS 観点のみ。
- CRITICAL-S-02 は INSERT を strict 化しただけで SELECT を見落としているのが惜しい。`current_org_id() is null` を OR の disjunct として使うパターンは「user-scope check (auth.uid 系) を AND で挟む」ところまでセットで設計しないとガードにならない。0033 fallback の運用前提は app コード全体で再点検が必要。
- defineRoute の catch (`route.ts:193-200`) で `message` を JSON にそのまま入れている点は、CRITICAL-S-03 が解消されない限り Next.js の `NEXT_REDIRECT` digest を leak し続ける。`getSecureErrorMessage(err)` の wrapper で internal_error / db_error 等の固定文字列に変換すべき。
- pgmqSendWeb (apps/web/src/lib/api/pgmq.ts) は service_role 鍵を web 内で 1 ファイルに局所化しており、Round1 評価通り良い設計。`cachedAdmin` のシングルトン化は HMR 観点で議論はあるがセキュリティ的には問題なし。
- worker 側 `lib/pgmq.ts` の singleton 化 (`_sql` のキャッシュ + beforeExit drain) は Architect HIGH-A-03 修正でセキュリティ的には正しい。connection leakage が無く DoS リスク減。

---

## 次回 (Round 3) で確認すべきポイント

- 0038 SELECT policy の strict 化 (P0-1) 後に bucket 他人読み出しが 403 になること
- requireApiUser 移行 (P0-2) 後に role gate が 403 JSON 返却になること
- 0039 stage_transitions org_id default 付与 (P0-3) 後に audit が 1 行 INSERT 成功すること
- Origin 検証 (P0-4) 導入後に cross-origin POST が 403 になること
- HIGH-S-06/07 の defense-in-depth でアプリ層 org_id 明示が入ったこと
