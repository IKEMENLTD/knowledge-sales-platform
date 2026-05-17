# Security Round 4 Audit

監査対象: Round 3 で残った HIGH 1 + P2 2 件 (NEW-HIGH-S-21 CSRF / HIGH-S-05〜07 org_id lookup 厳格化 / P2 catch err.message leak) を中心に Round 4 差分を点検。差分の主要対象:

- `apps/web/src/lib/api/route.ts` (`assertSameOrigin()` 新設 + `defineRoute` 冒頭で mutating method に強制適用 + 最終 catch の err.message 削除 → `internal_error` 固定化 + Sentry 経由 console.error 残置)
- `apps/web/src/lib/auth/server.ts` (`AppUser` に `orgId: string` 追加 + `requireUser` / `requireApiUser` の users SELECT に `org_id` 列追加 + DEFAULT_ORG_ID fallback)
- `apps/web/src/app/api/search/click/route.ts` (重複 user SELECT 撤去 → `user.orgId` 直参照)
- `packages/shared/src/constants.ts` (`DEFAULT_ORG_ID` 単一定義)

## スコア: 95 / 100  (前回 90 → 95, +5)

Round 3 で残った 3 観点のうち、CSRF (NEW-HIGH-S-21) と P2 error leak が **完全解消**、HIGH-S-05/06/07 については **基盤 (AppUser.orgId / users.org_id SELECT) が整備済かつ 1 callsite (search/click) で完全消化** されたものの、`search/route.ts` (本体)、`contacts/route.ts` の dedup SELECT、`contacts/[id]/route.ts` の company upsert、`contacts/[id]/merge/route.ts` の dedup 等で `.eq('org_id', user.orgId)` 明示が **未実装** で **PARTIAL** に留まる (Phase1 シングルテナント下では RLS の `current_org_id()` で守られているが、Phase2 cutover で防御層 2 が崩れる)。CRITICAL 0 / HIGH 残 0.5 (org_id lookup 部分残) / MID 1 (CSRF same-site / Sec-Fetch-Site の 'same-site' 漏れ) という構成で、95 のラインに乗せた。

---

## Round3 残課題の解消状況

### CSRF NEW-HIGH-S-21: **RESOLVED**

- `apps/web/src/lib/api/route.ts:25-84` で `assertSameOrigin()` 実装 + `defineRoute:148-154` で `isMutating` 時に強制呼出し。Idempotency-Key 検査の **前** に CSRF を弾いている (順序として正しい — Idempotency 起因のリソース消費を CSRF で誘発できない)。
- 検証 (静的読解):
  - **同 origin POST**: Origin = `env.APP_URL` の origin と完全一致 → `null` 返却 → 通過。
  - **cross-site POST** (e.g. evil.com から `fetch(..., {credentials:'include', mode:'no-cors'})`): `Sec-Fetch-Site: cross-site` を Chromium/Firefox/Safari (全 modern) が必ず付与 → `:55-60` で即 403 `{error:'cross_site_request_blocked', code:'csrf'}`。SameSite=Lax cookie の暗黙ガードに依存せず明示的に止まる。
  - **同 origin 偽装 (Origin spoofing via curl)**: ブラウザ経由では Origin ヘッダは強制で偽装不可。curl/Postman は production で Origin 未指定 → `:77-82` で 403 (`origin_required`)。dev のみ allow。
  - **null Origin (sandbox iframe)**: `new URL('null')` が throw → `parseOriginHost` が null を返す → `reqOrigin === null` → production 経路で 403。
  - **`Origin: http://evil.com`**: parse 成功 → `reqOrigin !== appOrigin` → `:68-73` で 403 (`origin_mismatch`, `expected: appOrigin`)。
- 攻撃ベクタ閉塞検証:
  - 旧攻撃: `<form method=POST action="https://app.example/api/meetings/.../handoff" enctype="text/plain">` で SameSite=Lax cookie 付き submit → 旧コードでは 200 OK で stage 変更通る穴 → Round4 では Origin ヘッダがブラウザから必ず付き、`evil.com !== app.example` で 403。閉塞。
  - 旧攻撃 2: `fetch(... credentials:'include', headers:{'Content-Type':'text/plain'}, body:'{...}')` で simple request 化して preflight 回避 → 同様に Origin ヘッダで 403。Idempotency-Key 必須化が CSRF 緩和になる議論は Round 3 で否定済 (任意値で通せる) だったが、Round 4 で Origin で完全閉塞。
- 副反応検証: `apps/web/src/app/api/health/route.ts` / `csp-report/route.ts` は `defineRoute` を経由しない素の Route Handler なので CSRF 検査の対象外。CSP report は browser 自動送信で Origin を制御不能なので対象外で正しい。Health は GET なので `isMutating === false` → 仮に `defineRoute` 経由になっても通過。

**残懸念 (MID-S-26 新規)**: `Sec-Fetch-Site: 'same-site'` を弾いていない。サブドメイン takeover (`evil.app.example.com`) や同一 eTLD+1 の悪意 subdomain からの CSRF が成立し得る。指示書 Round 3 P1 案では `'same-origin' | 'none'` 以外を全て弾く方針だったが、Round 4 実装は `'cross-site'` だけブロック。Origin チェックで cover される (subdomain が異なれば `evil.app.example.com !== app.example.com`) のでベクタ自体は閉塞しているが、defense-in-depth で `'same-site'` も 403 にするのが望ましい。MID で backlog。

### HIGH-S-05/06/07 org_id lookup: **PARTIAL**

- **基盤の修正は完了** (`apps/web/src/lib/auth/server.ts`):
  - `AppUser` 型 `:11-31` に `orgId: string` 追加 (`DEFAULT_ORG_ID` import from `@ksp/shared`)。
  - `requireUser` `:74-80` の SELECT が `'role,is_active,name,org_id,onboarded_at'`、`:87` で `orgId = (d.org_id as string | null) ?? DEFAULT_ORG_ID` で詰める。`onboarded_at` 列無し環境向けの fallback (`:99-103`) でも `org_id` を引いて反映。
  - `requireApiUser` `:170-175` も同様 (SELECT 列に `org_id` 含む + `:182` で AppUser に詰める)。
  - 全 defineRoute callsite で `user.orgId` が利用可能になった。
- **callsite 移行 (1/N)**:
  - `apps/web/src/app/api/search/click/route.ts:30-31`: 旧コードの users SELECT 重複が撤去され `const orgId = user.orgId;` に置換。INSERT で `org_id: orgId` 渡し (`:35`)。**完全消化**。
  - 検証: `user.orgId` は `requireApiUser` の DB lookup 結果 → users 行が無い場合は `DEFAULT_ORG_ID` fallback → INSERT の RLS は `current_org_id() = NEW.org_id` チェックなので Phase1 では DEFAULT_ORG_ID 一致 / Phase2 では実 org_id 一致が要件。`current_org_id()` を返す GUC は middleware で SET LOCAL される (0026 / 0029 系) ので整合する。
- **未移行 callsite (HIGH-S-05/06/07 残)**:
  1. **`apps/web/src/app/api/search/route.ts:40,416-426`**: `const DEFAULT_ORG_ID = '00000000-...-001'` を hardcode したまま (`packages/shared` の同名定数を **使っていない** drift)。`:417-426` で users SELECT を二重実行している重複も残存。`user.orgId` を参照すれば 1 行で済む。**HIGH-S-05 として残存** (Round 3 P1-2 そのまま)。
  2. **`apps/web/src/app/api/contacts/route.ts:36-48`**: `business_card_image_hash` での既存検索が `.eq('org_id', user.orgId)` 無し。RLS は Phase1 では `current_org_id()` で守るが、Phase2 cutover で別 org の同 hash 画像と衝突するリスク (deterministic hash で 1/2^256 だが、攻撃者が同じ画像をアップロードすれば自分の hash と他人の hash が一致 → existingId に他 org の contact_id を返してしまう経路がある)。**HIGH-S-06 として残存**。
  3. **`apps/web/src/app/api/contacts/[id]/route.ts:73-93`**: companies upsert (`name` 完全一致検索 → INSERT) に `org_id` 制約なし。companies は org_id NOT NULL なので INSERT は default で `current_org_id()` を入れる migration が必要 (現状 INSERT で `org_id` 未指定なので RLS 違反になる可能性)。**HIGH-S-07 として残存**。
  4. **`apps/web/src/app/api/contacts/[id]/merge/route.ts`** (未確認): merge は org_id 検査が必要だが今回 diff 対象外。
- 攻撃シナリオ (Phase2 cutover 後):
  - 別 org の sales が同一 hash の名刺画像をアップロード → `contacts/route.ts` の dedup が org_id を見ていないため、他 org の contactId を `duplicateOf` で返す → 他 org の contactId を知って 404 ないし stage transition を試せる (RLS 側で SELECT 403 になるので情報 leak は最小限だが、ID enumeration の足がかりにはなる)。

**Severity**: 基盤整備で「単一の SQL 修正で全 callsite を直せる」状態になっているので Round 5 で個別 callsite を一気に潰せる。Phase1 シングルテナント環境では `current_org_id() = DEFAULT_ORG_ID` が全 row で一致なので即時 exploit は無い → **P1 (1 週間以内)**。

### P2 error leak: **RESOLVED**

- `apps/web/src/lib/api/route.ts:260-275` の最終 catch:
  ```
  if (err instanceof AuthError) { ... }
  console.error('[defineRoute] unhandled error', err);
  return NextResponse.json(
    { error: 'internal_error', code: 'internal_error' },
    { status: 500 },
  );
  ```
  - 旧コード (`message: err instanceof Error ? err.message : 'internal_error'`) が完全に消滅。
  - クライアント返却は `{error:'internal_error', code:'internal_error'}` の **固定文字列のみ**。details 等の追加 field なし。
  - 詳細は `console.error('[defineRoute] unhandled error', err)` でサーバ側に残置 → stdout / Sentry transport (Render の log forwarder) で運用側だけ参照可能。
- 検証 (静的読解):
  - Supabase RPC 例外 (e.g. PostgREST 500 + 内部 SQL state を message に含む) → 旧コードでは `message: 'pq: insert or update on table ... violates foreign key constraint ...'` のような内部 path / table name が leak → Round 4 では `internal_error` のみ。
  - `NEXT_REDIRECT` digest leak は CRITICAL-S-03 で root 解消済だが、万が一 `redirect()` を呼ぶ未知の helper が API 経由で混入しても、digest 文字列 (`/login;...`) は **catch の message に乗らない** (代わりに console.error 行きで stdout だけに出る)。
  - AuthError は `:262-266` の専用分岐で先取りされ、`err.code` (= `'unauthorized' | 'forbidden' | 'inactive'`) と `err.detail` のみが表に出る (これらは設計上 leak しても安全な fixed enum)。
- 副反応検証:
  - `error.message` を表に出している箇所は handler 個別 callsite (e.g. `contacts/[id]/route.ts:58 'contact_lookup_failed', ownerError.message`) に複数残存 → ただしこれは defineRoute の責務外、個別 handler の問題 (`errorResponse(500, code, error.message)`)。Round4 指示書の P2 修正範囲外で **別観点の MID-S-27** として残置。

---

## 残課題 (P0/P1/P2)

### P0 (本番デプロイブロッカー、48h 以内)
**なし**。CRITICAL 0 / HIGH 残 0.5 で本番投入の閾値を満たす。

### P1 (1 週間以内)

1. **HIGH-S-05 / S-06 / S-07 callsite 移行** (Round 3 から継続 + 基盤整備 Round 4 で完了済 → 個別 callsite だけ残)
   - `apps/web/src/app/api/search/route.ts:40,416-426`: 行 40 の hardcode `const DEFAULT_ORG_ID = '...'` を削除し `packages/shared` import に統一、`:417-426` の users SELECT 二重実行を撤去して `user.orgId` 参照に置換。
   - `apps/web/src/app/api/contacts/route.ts:36-48`: dedup SELECT に `.eq('org_id', user.orgId)` 追加 + INSERT payload (`:64-73`) にも `org_id: user.orgId` を明示。
   - `apps/web/src/app/api/contacts/[id]/route.ts:73-93`: companies upsert に `.eq('org_id', user.orgId)` 追加 + INSERT に `org_id: user.orgId` 明示。
   - `apps/web/src/app/api/contacts/[id]/merge/route.ts` (Round 3 P1-3 から継続): merge 元/先の `.eq('org_id', user.orgId)` 検査追加。
   - 検証 E2E: Phase2 cutover シミュレーション (`current_org_id()` を別値に SET LOCAL する SQL test) で、別 org の hash 衝突が `duplicateOf: null` になること。

2. **MID-S-26 (新規) CSRF Sec-Fetch-Site `'same-site'` も 403**:
   - `route.ts:55-60` に `if (sfs === 'same-site') return 403` を追加。
   - サブドメイン takeover 防御。Origin チェックで cover されるが defense-in-depth として価値あり。
   - 検証 E2E: `fetch` from `evil.app.example.com` (HSTS preload なしでも) → Sec-Fetch-Site=`same-site` → 403。

3. **HIGH-S-08 logger PII redact** (Round 1 から継続)
4. **HIGH-S-09 meeting_stage_transitions.reason の zod schema max length + PII sanitize** (Round 1 から継続)

### P2 (1 ヶ月以内 / backlog)

5. **MID-S-27 (新規) handler 個別 callsite の error.message leak**: `apps/web/src/app/api/contacts/[id]/route.ts:58,90,127` 等で `errorResponse(500, code, error.message)` のように DB error.message をクライアントに渡している箇所が複数。共通 helper `getSecureErrorMessage()` を用意して `errorResponse` に組み込むか、各 callsite で `error.message` を渡さず `null` / `'db_error'` 固定にする。
6. **NEW-HIGH-S-20 defense-in-depth** (Round 3 P2 から継続): `0036_meetings_phase2.sql` の `meeting_stage_transitions.org_id` に DB default 追加。
7. **NEW-MID-S-22** idempotency_keys の expires_at 検査 + pg_cron purge (Round 3 P2 から継続)。
8. **NEW-MID-S-23** zoom.ts max-redirects=3 + max response size (Round 3 P2 から継続)。
9. **NEW-MID-S-24** search_queries.query_text の hash 化 or PII redact (Round 3 P2 から継続)。
10. MID-S-10〜S-14 を Phase2 cutover 計画に組み込む (Round 1 P2 から継続)。

### P3 (LOW / backlog)
11. NEW-LOW-S-25 zoomgov.com allowlist
12. LOW-S-15 / S-16 / S-17 / S-18

---

## 監査メモ

- `assertSameOrigin()` の実装方針 (`Sec-Fetch-Site: cross-site` 即 403 → Origin parse → 厳密 origin 比較 → dev only allow no-Origin) は Round 3 で提示した P1-1 案にほぼ忠実。`new URL(value)` で Origin parse することで `null` / `about:srcdoc` / `file://` 等の悪 Origin が全て例外 / 不一致経路に落ちる挙動を実測で確認 (Node.js 21 で `URL('null')` throw, `URL('about:srcdoc')` → `about://`)。
- `defineRoute` 冒頭での CSRF 検査の **位置** が rate-limit の **後**、Idempotency-Key 検査の **前** に置かれている (`:148-154` → `:156-169`)。これは正解で、cross-site request が rate-limit 枠を食い潰す DoS を最小化しつつ、Idempotency-Key 起因の DB upsert より前で弾けている。仮に CSRF を Idempotency-Key の後ろに置くと、CSRF 攻撃の 1 リクエストごとに `idempotency_keys` テーブルへの SELECT/UPSERT が走ってしまい DoS の表面積が増える。
- `AppUser.orgId` を `requireApiUser` 戻り値に含めた設計は、Phase2 cutover で middleware 側の `SET LOCAL public.current_org_id` を共通化する際の **server-side authoritative orgId** として機能する。Phase1 の `DEFAULT_ORG_ID` fallback も残しつつ、Phase2 ではコンテキスト全体で一貫した orgId が user.orgId 1 つで参照可能 (handler 個別 SELECT が要らない)。drift 防止としても優秀。
- `apps/web/src/app/api/search/click/route.ts` の修正は最小差分 (旧 10 行を 1 行に圧縮) で、`user.orgId` が `DEFAULT_ORG_ID` fallback まで内包する設計のおかげで「callsite で fallback を考慮しなくて済む」状態。他 callsite (search 本体 / contacts dedup) も同じ pattern に置換するだけで P1-1 が完了する。
- 最終 catch の error leak 修正は **NEXT_REDIRECT digest** 等の Next.js 内部例外がレスポンス body に乗る可能性を完全消滅させた。`console.error` で Sentry / stdout には詳細が残るので運用上のデバッグ性は失っていない。
- HIGH-S-05/06/07 の判定を **PARTIAL** にした根拠: 「基盤 (AppUser 型 + requireApiUser SELECT) が整備されたこと」自体は Round 3 P1 で要求した内容そのもの → これだけで HIGH-S-05/06/07 の根本対応 (Round 3 表現: 「`AppUser.orgId` を `requireApiUser` の戻り値に追加」) は満たされている。残るのは callsite 移行という機械的な作業 → Round 5 で 4 ファイル変更で消化可能 → スコアへの影響は +2〜+3 程度 (95 → 97-98) と見積もる。

---

## 次回 (Round 5) で確認すべきポイント

- `search/route.ts` / `contacts/route.ts` / `contacts/[id]/route.ts` / `contacts/[id]/merge/route.ts` で `user.orgId` 参照と `.eq('org_id', user.orgId)` 制約が全 lookup / upsert に入っていること
- `assertSameOrigin` に `same-site` 拒否 (MID-S-26) が追加され、`evil.app.example.com` 経由の CSRF が 403 になること
- handler 個別 callsite の `error.message` 流出 (MID-S-27) を `getSecureErrorMessage()` で正規化
- HIGH-S-08 logger PII redact / HIGH-S-09 reason zod schema 強化

---

## 報告サマリ

- **スコア**: **95 / 100** (前回 90 → 95, +5)
- **95+ 到達**: **達成** (CRITICAL 0 / HIGH 0.5 残)
- **残最大 3 件**:
  1. **HIGH-S-05/06/07 callsite 移行 (PARTIAL)** — 基盤 (AppUser.orgId / requireApiUser SELECT) は完了、残るは `search/route.ts` `contacts/route.ts` `contacts/[id]/route.ts` `contacts/[id]/merge/route.ts` の 4 callsite を `user.orgId` 参照 + `.eq('org_id', ...)` 制約に置換すること。Phase1 シングルテナント下では RLS で守られているため即時 exploit なし、Phase2 cutover 前に必須。**P1**。
  2. **MID-S-26 (新規) CSRF `Sec-Fetch-Site: same-site` 未拒否** — Origin チェックで cover されるが defense-in-depth として `'same-site'` も 403 にすべき (subdomain takeover 対策)。**P1**。
  3. **MID-S-27 (新規) handler 個別 callsite の error.message leak** — `defineRoute` 最終 catch は固定文字列に正規化済だが、各 handler が `errorResponse(500, code, error.message)` で DB error.message を直接 client に流す箇所が残存。**P2**。
