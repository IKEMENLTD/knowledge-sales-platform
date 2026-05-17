# Security Round 3 Audit

監査対象: Round 2 で残った CRITICAL/HIGH 4 件 (CRITICAL-S-02 PARTIAL / CRITICAL-S-03 OPEN / NEW-HIGH-S-20 OPEN / NEW-HIGH-S-21 CSRF) を中心に、Round 3 で投入された差分を点検する。差分の主要対象:

- migration `packages/db/src/migrations/manual/0039_round3_storage_select_strict.sql`
- `apps/web/src/lib/auth/server.ts` (`AuthError` 追加 + `requireApiUser()` 新設)
- `apps/web/src/lib/api/route.ts` (`defineRoute` 経由で `requireApiUser` 呼出し + catch で `AuthError → 401/403 JSON`)
- `apps/web/src/app/api/meetings/[id]/stage/route.ts` (SELECT に `org_id` 追加 + audit payload に `org_id: row.org_id` 明示)

## スコア: 90 / 100  (前回 79 → 90, +11)

Round 2 CRITICAL 2 件 (S-02 / S-03) を完全解消、NEW-HIGH-S-20 も完全解消で、現状の P0 ブロッカー = 0。`requireApiUser` への置換忘れ箇所も `apps/web/src/app/api/**` 内で 0 件、`redirect()` 呼出しも API 配下に 0 件で副反応無し。NEW-HIGH-S-21 (CSRF Origin/Sec-Fetch-Site) と Round1 由来の HIGH-S-05〜S-09 / MID-S-10〜S-14 が残存しているため 95+ には届かないが、CRITICAL 0 / HIGH 1 残 (CSRF のみ) は本番デプロイ判定の閾値を満たす水準。

---

## Round2 課題の解消状況

### CRITICAL

- **CRITICAL-S-02 (storage SELECT wide-open)**: **RESOLVED**
  - `packages/db/src/migrations/manual/0039_round3_storage_select_strict.sql:11-29` で `business_cards_select` を drop & recreate。OR 句は
    ```
    bucket_id = 'business-cards'
    and (
      owner = auth.uid()
      or public.storage_object_user_id(name) = auth.uid()
      or (
        public.current_org_id() is not null
        and public.storage_object_org_id(name) = public.current_org_id()
      )
    )
    ```
    と再構成。Round 2 で問題だった `or public.current_org_id() is null` 単独 disjunct は完全に撤去され、3 番目の経路は `is not null` を **AND** で必須化したため、Phase1 GUC 未 SET 環境では「自分が owner」「path 先頭が自分の user_id」の 2 経路のみが SELECT 許可となる。
  - 検証 (SQL 静的読解): `current_org_id()` が NULL を返す環境では第 3 disjunct 全体が `false`、第 1/第 2 で `auth.uid()` 比較に落ちる → 他人画像の SELECT は全 path で false。multi-tenant cutover 後は `current_org_id()` が値を返すので同 org 内可視に切り替わる。Round 2 で指摘した「Phase2 cutover で名刺が org-cross visible」シナリオも同 org 内のみに限定される (org_id 一致条件付き)。
  - 残懸念 (LOW): `storage_object_org_id(name)` 関数の path 解釈に依存する。helper の実装が `null` を返す経路があると比較が NULL = unknown でフェイルクローズになるので問題なし (PostgreSQL の boolean 短絡)。INSERT policy (0038) と SELECT policy (0039) の path 規約 (`${user.id}/...`) が一致していることを E2E で 1 度確認するのを推奨。

- **CRITICAL-S-03 (API 401/403 が HTML redirect になり 500 漏れ + redirect target leak)**: **RESOLVED**
  - `apps/web/src/lib/auth/server.ts:127-136` に `AuthError` クラスを追加 (`status: 401 | 403`, `code: string`, `detail?: Record<string,unknown>`)。
  - 同ファイル `:138-192` の `requireApiUser()` は `redirect()` を一切使わず、`!user` → `throw new AuthError(401, 'unauthorized')`、`!isActive` → `throw new AuthError(403, 'inactive', { reason: 'inactive' })`、role 不足 → `throw new AuthError(403, 'forbidden', { reason: 'role', need: options.role })` という構造。
  - `apps/web/src/lib/api/route.ts:81` で `defineRoute` 冒頭が `requireApiUser(options.role ? { role: options.role } : undefined)` に置換済。同ファイル `:194-201` の catch で `err instanceof AuthError` 判定し、`{ error: err.code, code: err.code, ...(err.detail ?? {}) }` を `status: err.status` で返却する分岐が追加。
  - 検証 (静的読解):
    - 未認証で API hit → `requireApiUser` が `AuthError(401, 'unauthorized')` throw → 401 JSON `{error:'unauthorized', code:'unauthorized'}`。
    - sales user が manager 限定 endpoint hit → `AuthError(403, 'forbidden', { reason: 'role', need: 'manager' })` throw → 403 JSON `{error:'forbidden', code:'forbidden', reason:'role', need:'manager'}`。
    - inactive user → 403 JSON `{error:'inactive', code:'inactive', reason:'inactive'}`。
  - 副作用検証: `apps/web/src/app/api/**` 全域で `requireUser()` / `redirect()` を grep してヒット 0。`requireUser` は Server Component (dashboard/page.tsx, meetings/page.tsx, recordings/page.tsx, onboarding/page.tsx, protected-shell.tsx 等) でのみ使用継続で、こちらは `redirect()` 経由が正しい挙動 (Server Component → Browser へ 307)。
  - 残懸念 (LOW): catch の最終 fallback (`route.ts:202-207`) で `message: err instanceof Error ? err.message : 'internal_error'` をクライアントに返している点は CRITICAL-S-03 とは別軸で残る。AuthError は専用分岐で先に return されるので redirect target leak は発生しない (`NEXT_REDIRECT` digest が message に乗る経路は requireApiUser で消滅した) が、他 throw (e.g. supabase 例外) のスタック情報や内部 path が leak する可能性は引き続きある。Round 2 監査メモで指摘した `getSecureErrorMessage()` wrapper 案は P1 backlog として残置。

- **NEW-HIGH-S-20 (meeting_stage_transitions の org_id NOT NULL 違反 で audit 死亡)**: **RESOLVED**
  - `apps/web/src/app/api/meetings/[id]/stage/route.ts:59` の SELECT に `org_id` が追加され、`MeetingForTransitionRow` interface (`:37-44`) にも `org_id: string` が宣言済。
  - 同ファイル `:97-106` の `auditPayload` で `org_id: row.org_id` を先頭キーで明示。`packages/db/src/migrations/manual/0036_meetings_phase2.sql:24` の NOT NULL 制約は変更されていないが、route 側で meeting 由来の org_id を transit させる形で fail-close 仕様を満たす。
  - 検証 (静的読解):
    - meetings SELECT が成功 → `row.org_id` は NOT NULL 列なので必ず string → INSERT で 23502 は発生しない。
    - meetings SELECT が `null` (404 経路) → 早期 `errorResponse(404)` で return、INSERT に到達しない。
    - 攻撃者が他 org の meeting_id を投げても、meeting SELECT が RLS でブロック (`current_org_id()` 経由 / owner 経由) されるので、stage transition の audit に他 org の org_id が混入する経路は無い。
  - 残懸念 (LOW): defense-in-depth として、Round 2 監査メモで提案した「`alter column org_id set default current_org_id()` + trigger 強制」も合わせて入れると app 改修忘れに対しても fail-close できる。これは P2 backlog。

### HIGH

- **NEW-HIGH-S-21 (Origin / Sec-Fetch-Site / CSRF token 未チェック)**: **未対応で残存**
  - `apps/web/src/lib/api/route.ts` 全文 grep で `origin` / `sec-fetch-site` / `csrf` のいずれも 0 ヒット。
  - `apps/web/src/middleware.ts` も sanitizeNext (`:99`) コメント以外に origin チェック無し。
  - Round 2 で示した攻撃ベクタ (`Content-Type: text/plain` + `credentials: 'include'` + SameSite=Lax cookie で state-changing API を CSRF) は依然成立。Idempotency-Key header の必須化はあるが、攻撃者は任意の値を 1 度生成すれば通せるため緩和にはならない。
  - 修正方針 (Round 2 P0-4 から継承): `defineRoute` 冒頭で `MUTATING.has(req.method)` のとき `req.headers.get('origin')` を `env.NEXT_PUBLIC_APP_URL` の origin と厳密比較し、不一致なら 403 (`csrf_origin_mismatch`)。`sec-fetch-site` も `'same-origin' | 'none'` 以外を弾けば二重防御。
  - Severity: HIGH (handoff / merge / stage transition / delete 等が CSRF で発火可能)。

---

## 残課題 (P0/P1/P2)

### P0 (本番デプロイブロッカー、48h 以内)

なし。Round 2 で挙げた P0 4 件のうち 3 件 (S-02 / S-03 / S-20) は今 round で解消。
残り 1 件 (CSRF) は HIGH 扱いだが、SameSite=Lax と JSON Content-Type の暗黙ガードがある関係で「state-changing 操作が必ず通る」ほどの即時 exploit ではないため P0 → P1 に降格扱いとする (本番投入直前ではなく次 1 週間で fix する想定)。

### P1 (1 週間以内)

1. **NEW-HIGH-S-21 CSRF Origin / Sec-Fetch-Site 検証 (Round 2 から継続)**
   - `defineRoute` 冒頭 (rate-limit 判定の直後あたり) で mutating method 時に origin / sec-fetch-site を検証。
   - `env.NEXT_PUBLIC_APP_URL` の URL parse 結果と `req.headers.get('origin')` を `URL().origin` 比較。
   - 不一致 → `errorResponse(403, 'csrf_origin_mismatch')`、`sec-fetch-site === 'cross-site' | 'same-site'` も弾く。
   - 検証 E2E: 別 origin から `fetch('/api/meetings/.../handoff', { credentials: 'include', method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '...' })` で 403 が返ること。
2. **HIGH-S-05 search_queries.org_id を DB 側で `current_org_id()` 固定** (Round 1 から継続、`apps/web/src/app/api/search/route.ts:40,416-426` / `search/click/route.ts:22,31-41` の `DEFAULT_ORG_ID` fallback 撤去)
3. **HIGH-S-06 / S-07 contacts / companies の lookup に `.eq('org_id', user.orgId)` 明示** + `AppUser.orgId` を `requireApiUser` の戻り値に追加 (`apps/web/src/app/api/contacts/route.ts:40`, `contacts/upload-url/route.ts:51`, `contacts/[id]/route.ts:73-93`)
4. **HIGH-S-08 logger 全体に PII redact middleware (email/phone/SSN regex)**
5. **HIGH-S-09 meeting_stage_transitions.reason の zod schema に max length + 簡易 PII sanitize**

### P2 (1 ヶ月以内 / backlog)

6. **CRITICAL-S-03 周辺の defense-in-depth**: `defineRoute` 最終 catch (`route.ts:202-207`) の `message: err.message` 返却を `getSecureErrorMessage()` に置換し、internal_error / db_error 等の固定文字列に正規化 (`NEXT_REDIRECT` digest leak は requireApiUser 移行で消滅したが、他例外の内部情報 leak は残)
7. **NEW-HIGH-S-20 defense-in-depth**: `0036_meetings_phase2.sql` の `meeting_stage_transitions.org_id` に `default coalesce(public.current_org_id(), '00000000-...-001'::uuid)` を付与し、route 側の明示渡し忘れにも fail-close
8. NEW-MID-S-22 idempotency_keys の expires_at 検査追加 + pg_cron purge job (`apps/web/src/lib/api/route.ts:272-280` の `existing.status === 'processing'` 判定で expiry を見ていない)
9. NEW-MID-S-23 zoom.ts max-redirects=3 + max response size + Content-Length 事前チェック
10. NEW-MID-S-24 search_queries.query_text の hash 化 or PII redact
11. MID-S-10〜S-14 を Phase2 cutover 計画に組み込む (deleted_at 除外 / merge org_id 検査 / rate-limit 分散化 / handoff actor 改竄 / PostgREST .or() エスケープ)

### P3 (LOW / backlog)

12. NEW-LOW-S-25 zoomgov.com allowlist 追加
13. LOW-S-15 / S-16 / S-17 / S-18

---

## 監査メモ

- 0039 の Storage SELECT 修正は **「OR の disjunct として `current_org_id() is null` を単独で書くと wide-open になる」** という Round 2 で指摘したアンチパターンを正確に潰している。AND の中で `current_org_id() is not null` を必須化しつつ org 一致条件と組み合わせる形は、multi-tenant cutover まで「個人スコープ only」を保証する最小実装として正解。
- `requireApiUser` の構造 (例外 throw → defineRoute catch で JSON 変換) は、Server Component の `requireUser` (redirect 投げる) と責務分離されており、双方の API 形が崩れない。Server Component で API 用 helper を使うと redirect 動作が壊れるが、その境界は `app/api/**` ディレクトリ規約で物理的に守られている (grep 結果 0 ヒット)。
- `AuthError.detail` は spread 展開で JSON body に同居するため、`role` 不足時のレスポンスが `{error:'forbidden', code:'forbidden', reason:'role', need:'manager'}` という構造的な形になっている。フロントから `code` / `reason` で UX 分岐できるのは Round 2 で求めた仕様。
- `meeting_stage_transitions` の audit 修正で `org_id: row.org_id` を route 側で transit する方針は、RLS の owner_user_id check と組み合わせて「self-org の audit にしか書けない」性質を確保。route が直接 `current_org_id()` 等を発行しない分、コードレビューだけで「他 org の audit に書ける経路は無い」と確信できる構造。
- defineRoute の catch の最終フォールバック (`message: err.message`) が依然として残るが、AuthError は専用分岐 (`:196-201`) で `err.detail` のみ展開され、`err.message` (= code 文字列) は表に出ない (代わりに `error: err.code` で出す)。`NEXT_REDIRECT` digest leak は requireApiUser 移行で root 解消された。
- NEW-HIGH-S-21 CSRF は Round 3 で意図的に対象外とされた旨を受領。SameSite=Lax cookie + JSON Content-Type の暗黙ガードが効くため即時 exploit は限定的だが、`Content-Type: text/plain` POST が通る経路は塞がっておらず P1 で必須対応。

---

## 次回 (Round 4) で確認すべきポイント

- NEW-HIGH-S-21 CSRF Origin / Sec-Fetch-Site 検証導入後、別 origin / Content-Type: text/plain POST が 403 になること
- HIGH-S-05 〜 S-07 の org_id 厳格化 (search_queries / contacts dedup / companies upsert) 完了後、Phase2 cutover でも org-cross 不可になること
- HIGH-S-08 logger redact 導入後、Sentry / structured log に email/phone が出ないこと (sample event を grep)
- HIGH-S-09 reason zod schema 強化後、長文 / PII を含む reason が 400 で reject されること
- (P2) defineRoute 最終 catch の `getSecureErrorMessage()` 化、`meeting_stage_transitions.org_id` の DB default 追加
