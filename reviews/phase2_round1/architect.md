# Architect Round 1 Review

レビュー対象: Phase 2 W2 (T-007 / T-009 / T-010 / T-012 / T-013 / T-014 / T-015 / T-016)
担当: Architect Round 1
範囲: 依存・抽象・エラー・データフロー・fixture fallback・拡張性・migration 整合・モノレポ境界

## スコア: 78 / 100

(95+ には届かず。複数の HIGH 級の整合性破綻あり。)

採点根拠:
- 抽象レイヤ (defineRoute 100% 適用, provider factory パターン統一): +25
- migration / RLS / pgmq の方向性は健全: +20
- 純関数の test 分離 (dedupe / rrf / derive): +15
- 検索 RRF + BM25 + vector の合成設計が現実的に動く: +10
- fixture fallback パターンが共通化されている: +8
减点:
- HIGH-A-01: storage 命名規約と Storage RLS の不整合 (致命): -8
- HIGH-A-02: 名刺重複検知ロジックの二重実装かつ規約不一致 (sploit): -8
- HIGH-A-03: pgmq.read / pgmq.delete の二重インライン実装 + 接続生成過多: -5
- HIGH-A-04: Drizzle schema が migration 0034/0036 に未追随: -4
- MID-A-05: `DEFAULT_ORG_ID` 固定値の濫用で multi-tenant 設計が壊れている: -4
- MID-A-06: dynamic route 内の `defineRoute` 二重ラップによる無駄なクロージャ生成: -3
- MID-A-07: orchestrator/pure/persistence 分離が API route 内に未着手: -3
- LOW-A-08, LOW-A-09, LOW-A-10: 後述

---

## 強み

- **抽象レイヤ統一**: `defineRoute` が 10 ファイル全てで使われ、認証 / rate-limit /
  zod / idempotency-key / 統一エラー JSON フォーマット (`{error, code, details}`) が
  100% カバーされている。errorResponse / ok ヘルパで返却口も統一。
- **Provider Factory パターンの一貫性**: OCR (`apps/worker/src/lib/ocr/providers.ts`) /
  Transcribe (`apps/worker/src/lib/transcribe/providers.ts`) / Summarize
  (`apps/worker/src/lib/summarize/providers.ts`) が同一構造 (interface + Mock +
  StubReal + pickProvider()) で、env 不在時 Mock fallback 規約も統一。将来の
  実 OCR / 実 Whisper / 実 LLM 差し替えポイントが明確。
- **モノレポ境界**: `packages/shared` は外部依存ゼロ (zod のみ)、`packages/db` は
  drizzle のみ、`apps/web` / `apps/worker` は単方向に shared / db を import。
  循環依存なし。
- **純関数分離**: `dedupe.ts`, `rrf.ts`, `derive.ts`, `chunkText`, `normalize.ts` が
  純関数として切り出され、unit test 可能。stage transition の verdict / RRF /
  win probability などビジネスロジックが DB 接続ゼロで evaluate できる。
- **pgmq の RPC + SQL fallback 設計**: `apps/worker/src/lib/pgmq.ts` で RPC 優先 →
  PGRST202 検知時のみ postgres-js 直接 SQL fallback、という保守的な経路選択。
- **append-only audit**: `meeting_stage_transitions` を専用テーブルに切り、
  `for update/delete using (false)` で migration レベルから改竄不可。stage 変更を
  PATCH `/meetings/[id]` でも書ける弱さは認識済み (route のコメントで言及)。
- **fixture fallback の共通形**: page.tsx (server component) が
  `try → DB → 空/error → DEMO_* → isFallback=true` パターンで揃っている
  (`meetings/page.tsx`, `recordings/_lib/load-recordings.ts`, `search/page.tsx`)。
- **検索 BM25 + vector + RRF の現実解**: PostgREST `.textSearch()` で BM25
  ts_rank 直取りできない制約を承知の上で、ランキング順位を RRF に流す妥当な妥協。
  RRF k=60, top30 ずつ、kind 別 bucket、score breakdown を hit に同梱、demo flag
  まで設計されている。

---

## 主要な懸念

### HIGH-A-01: business-cards storage key 規約と RLS の不整合 (致命)

3 つの実装が同じ bucket に対し別の path 形を使っている:

| 場所 | path 形 |
|------|---------|
| `0035_storage_business_cards.sql` (RLS check) | `{org_id}/{contact_id}/{yyyy-mm-dd}/{uuid}.{ext}` で `storage_object_org_id(name) = current_org_id()` |
| `apps/web/src/lib/api/storage.ts` (コメント) | "auth.uid() = path 先頭セグメント" 想定 |
| `apps/web/src/app/api/contacts/upload-url/route.ts` (実装) | `${user.id}/${uuid}.{ext}` |

結果として:
- 本番で 0035 が適用された Supabase 環境では、INSERT の RLS check
  `storage_object_org_id(name) = current_org_id()` が `auth.uid() (user.id)` を
  `org_id::uuid` にキャストしようとして **uuid 形式は同じだが値は完全に別物** で
  100% reject される (RLS は silent fail → signed-URL の PUT が 403)。
- 加えて `with check (owner = auth.uid())` 制約もある。signed upload URL は
  `owner = service_role` で書かれる可能性が高く、これも fail し得る。
- worker の `downloadImage()` は `STORAGE_BUCKETS.businessCards` から
  storageKey で素直に download() するため、書き込めなければ全 OCR パイプラインが
  止まる。

**規約統一を即決すべき**:
- 案 A: `{user.id}/{uuid}.{ext}` を正規化 → 0035 を 0038 で書き直し
  (`storage_object_owner_uuid()` ヘルパ + `auth.uid()` 比較)
- 案 B: `{org_id}/{user.id}/{uuid}.{ext}` を正規化 → route 側を変更
- 個人的推奨は **案 B**: dedupe / soft-delete / multi-tenant 観点で org-scoped
  bucket prefix の方が将来運用しやすい。

### HIGH-A-02: 名刺重複検知ロジックの二重実装 + アルゴリズム不一致

`apps/web/src/lib/api/contacts-dedupe.ts` と `apps/worker/src/lib/dedupe.ts` で
**同じ責務を担う関数が別実装**になっており、規約も食い違っている:

| 項目 | web (`contacts-dedupe.ts`) | worker (`dedupe.ts`) |
|------|---------------------------|----------------------|
| MATCH_WEIGHTS.email | 0.85 | 0.9 |
| MATCH_WEIGHTS.phone | 0.7 | 0.8 |
| MATCH_WEIGHTS.name_company | 0.4 | 0.7 |
| score 合成 | noisy OR (`1 - Π(1-w)`) | max |
| normalizePhone | digits only, no '+' | NFKC + `+81` 補完 |
| normalizeName | NFKC + lower + collapse | NFKC + collapse (lower は別) |
| linkedin 正規化 | trim+lower のみ | URL parser で host/path 抽出 |
| name_company 判定 | `companyId` 完全一致が必要 | `buildNameCompanyKey` (会社名正規化) |

実害:
1. **`contacts.normalized_phone` が source によって別物になる**: web の
   PATCH `/api/contacts/[id]` 経由で書くと `0312345678`、worker OCR 経由で書くと
   `+81312345678`。同一人物が unique index で重複扱いされず、`contacts_normalized_phone_idx`
   ベースの dedupe スキャンが silent に miss する。
2. **同じ候補ペアでも web の `/duplicates` API と worker の OCR では
   重複と認識されるか否かが異なる**。UX 上 "API では候補に出たのに OCR では
   見つからない" / "OCR では merged_suspect だが UI では一致しない" などの
   reconcile 不能なバグが発生する。
3. 修正コスト: shared package に `@ksp/shared/dedupe` を切り出し、両方を
   `import` させるのが正解。Phase2B 完成宣言前に着手必須。

### HIGH-A-03: pgmq.read / pgmq.delete を 2 ファイルで重複インライン実装 + 接続生成過多

`apps/worker/src/jobs/ocr.ts` と `apps/worker/src/jobs/embed.ts` がそれぞれ独自の
`async function pgmqRead<T>()` と `async function pgmqDelete()` を持つ
(`lib/pgmq.ts` は `send` しか持たない)。問題:

1. **重複実装**: 同じ責務のコードが 2 箇所にコピーされ、片方修正すると
   他方が忘れ去られる典型パターン。
2. **接続の生成過多**: 各呼び出しで `postgres()` を new し、`sql.end()` で
   close している。`pgmqRead` 1 回 + per-message `pgmqDelete` 1 回 = 1 tick で
   `batch+1` 個の接続生成 / close が発生。RPM が増えると `pg_stat_activity` が
   暴走する可能性。Worker は long-lived プロセスなので **module-level singleton** で
   接続 pool を共有すべき。
3. **TS 型ハック**: `pgmqSend(TRANSCRIBE_QUEUE as 'process_recording', ...)` の
   ように queue 名で型キャストしてる箇所が複数ある (`recording-download.ts`,
   `recording-transcribe.ts`)。`PgmqQueue` enum 自体を拡張 (`transcribe_recording`,
   `summarize_recording` を追加) すれば回避できる。

修正方針: `lib/pgmq.ts` に `pgmqRead<T>(queue, vt, batch)` / `pgmqDelete(queue, id)` /
`pgmqEnsureQueue(queue)` を集約。postgres-js の sql client は file-level singleton。
PgmqQueue を `'process_business_card' | 'process_recording' |
'generate_embeddings' | 'transcribe_recording' | 'summarize_recording'` に拡張。

### HIGH-A-04: Drizzle schema が migration 0034 / 0036 に未追随

migration では追加されているが Drizzle schema には反映されていない列 / table:

- `contacts.normalized_email` / `normalized_phone` / `business_card_image_hash` /
  `review_status` / `captured_at` / `deleted_at` / `created_by_user_id` — **追従済** ✓
- `meetings.next_action` / `win_probability` / `deleted_at` — **未追従** ✗
- `meeting_stage_transitions` テーブル — **未追従** ✗ (schema/meetings.ts に
  存在しない)
- `search_queries` / `search_clicks` テーブル (0037) — **未追従** ✗
- `contact_duplicates` テーブル — schema/contacts.ts に存在は確認 ✓

実害:
- drizzle-kit による migration 生成 / introspection が「列を消す」suggestion を
  出す可能性。
- TypeScript 側で `meetings.$inferSelect` を使うと next_action / win_probability /
  deleted_at が型に出てこない (= 直接 select したコードで型推論が壊れる)。
- `meeting_stage_transitions` を ORM 経由で操作できない。現状は raw query で
  逃げているが、テスト時に schema を spawn できない。

修正: `packages/db/src/schema/meetings.ts` に三列 + 新 table を追加。
`packages/db/src/schema/search.ts` を新規作成し、index にも export。

### MID-A-05: `DEFAULT_ORG_ID = '00000000-...-001'` を 6 ファイルで使い回し

`apps/worker/src/jobs/ocr.ts`, `apps/worker/src/jobs/embed.ts`,
`apps/worker/src/lib/audit.ts`, `apps/worker/src/routes/webhooks.ts`,
`apps/web/src/app/api/search/click/route.ts`,
`apps/web/src/app/api/search/route.ts` で同じハードコードリテラルが散在。

- INSERT 時に常に `org_id = DEFAULT_ORG_ID` を入れているコードがあり
  (`contact_duplicates` への INSERT 等)、本来 user の所属 org を resolve すべき
  ところで shortcut している。multi-tenant が本格化したら全件が同じ org に
  落ちる sploit になる。
- `search/route.ts` と `search/click/route.ts` は冒頭で `users.org_id` を
  resolve するが、worker 側の INSERT path はそれをしない。
- 修正: `packages/shared/src/constants.ts` に `DEFAULT_ORG_ID` を export し、
  「`DEFAULT_ORG_ID` を使うのは migration 適用前 / dev / test に限る」という
  コメントを必ず付ける。worker は contacts.org_id / meetings.org_id を join で
  resolve するヘルパ (`resolveOrgIdForResource`) を作る。

### MID-A-06: dynamic route 内で `defineRoute` を毎リクエスト構築

`/api/contacts/[id]/*` と `/api/meetings/[id]/*` 全 6 ファイルで以下パターン:

```ts
export async function PATCH(req, ctx) {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) return errorResponse(...);
  const id = idParse.data.id;
  const handler = defineRoute({ body: ... }, async ({ ... }) => { ... use id ... });
  return handler(req);
}
```

問題:
1. **毎リクエストで `defineRoute` クロージャを再構築**。リクエストごとに
   handler factory を呼ぶ無駄。
2. 例外パスの統一: `idParse.success === false` の場合、`defineRoute` の
   `try/catch` / rate-limit / idempotency check を **bypass** している。
   逆に通常パスは全て通る。観測性 (rate-limit log の有無) に齟齬。
3. `defineRoute` 自体が「next の dynamic segment context (ctx.params)」を
   受け取れない設計上の限界。

修正方針: `defineRoute` を `(req: NextRequest, ctx: { params: Promise<Record<...>> })`
を受けられるよう一段拡張する。または、`ctx.params` を `req` から
`req.nextUrl.pathname` 経由で取り出す helper (`extractRouteParam(req, 'id')`) を
作って、handler 中で zod validate する方式に統一。

### MID-A-07: API route 内に orchestrator / pure / persistence の分離なし

ルートハンドラに 100-200 行のビジネスロジックが直書き:

- `merge/route.ts` (191 行): meeting_attendees relink → meetings relink → slave
  soft-delete → master update → contact_duplicates record の 5 ステップ
  transaction 相当ロジックが route 内。
- `duplicates/route.ts` (170 行): OR clause 構築、DB query、純粋スコアリング、
  view-model 化が混在。
- `api/search/route.ts` (670 行): 全ロジック単一ファイル。bm25Recordings /
  bm25Meetings / bm25Contacts / vectorSearch / bucketVectorRows / hydrate /
  filter / RRF / 統計挿入が並ぶ。

CLAUDE.md / docs/SERVICE_CREATION_GUIDE.md の方針 (orchestrator → pure →
persistence → adapter) に沿うなら、route は薄く保ち、`lib/api/contacts-merge.ts`
や `lib/search/orchestrator.ts` に逃がす。今後 Phase 2 H / I で API 数が増える
ので、雛形固定は今が最後のチャンス。

### MID-A-08: トランザクション境界の欠如 (merge / handoff / stage / register)

複数 DB 書き込みを並べているが Postgres トランザクションで括っていない:

- `merge/route.ts`: meeting_attendees update → meetings update → slave update →
  master update → contact_duplicates upsert。途中で失敗すると整合性破綻
  (slave だけ deleted / master の verified が立たない)。
- `stage/route.ts`: audit INSERT 成功 → meetings update 失敗時、audit は
  append-only で巻き戻せない (route コメントで認識済だが対処なし)。
- `handoff/route.ts`: notifications INSERT 成功 → meetings.manual_notes append
  失敗時、二重通知。
- `api/contacts/route.ts`: contacts INSERT 成功 → pgmqSendWeb 失敗時、row が
  「pending_ocr のまま OCR が起きない」孤立 row を生む (route コメントで
  認識済)。

Supabase RPC で transaction 化するのが正解 (PostgREST 単発呼び出しは
auto-commit)。今すぐ全箇所を RPC 化するのは大変なので、**少なくとも
merge と register は Postgres function 経由に倒す** べき。

### MID-A-09: 検索の DB 二度引き / N+1 パターン

`api/search/route.ts` の 6) hydrate ブロック:
- `bm25Recordings` で既に recordings row を持っているが、`vec.recordings` 経由で
  追加された id (例: meetings.title が hit せず chunk_text のみ hit した recording)
  については `recordings.in(missingRec)` で再 SELECT。3 entity 種類 × 2 query =
  6 SQL を pre-page で発行。
- そのあと `sorted.slice(offset, offset+limit)` で **paginate しているのに
  全件 hydrate**。limit=20 でも 60 row 引いてしまう。
- `bm25Recordings` 内部でも `summary` で hit しなければ `transcript_full` に
  textSearch する 2 段クエリ。transcript_full は重い列。

修正: `sorted` を先に paginate してから hydrate。BM25 fallback (transcript_full)
は別 endpoint に切り出す。検索 RPC を統合する Phase 2H で `match_knowledge_v2`
側に BM25 を畳み込むのが本筋。

### MID-A-10: orgId 未挿入 / RLS との衝突可能性

`audit` INSERT は `org_id: DEFAULT_ORG_ID` を入れている (worker)。だが
`contact_duplicates` table への INSERT (`worker/src/jobs/ocr.ts` line 369-376) は
`org_id: DEFAULT_ORG_ID` を入れているが、`contacts.org_id` と一致しない
ケースで RLS が拒否する可能性。`search_queries` は `users.org_id` resolve するが
`worker` は同じことをしていない。一貫性を取る必要。

### LOW-A-11: defineRoute の Idempotency claim 未呼び出し

`defineRoute` は `idempotencyKey` を ctx に渡すが、`beginIdempotency` / `claim`
を呼んでいるルートは現時点で **0 件**。idempotency-key を required にしているが
本当に冪等にはなっていない (今のところ DB level の unique index 経由で
duplicate 防止しているのみ)。
- `/api/contacts/register` → 同じ key で 2 度叩くと 2 つの row が立つ
  (contents_sha256 が同じなら check で reject されるが、別画像で別 contact なら
  二重発行)。
- `/api/meetings/[id]/handoff` → 同じ key で 2 度叩くと 2 通の notification が
  飛ぶ (route コメントで認識済)。

修正: `beginIdempotency` を `defineRoute` 内で自動的に呼ぶか、各 route に
ボイラープレートを追加。

### LOW-A-12: search の sanitizeForTextSearch が ASCII 専用

```ts
function sanitizeForTextSearch(q: string): string {
  return q.replace(/[ -]/g, ' ')   // <-- これは [space, hyphen] にしかマッチしない
    .replace(/["'`\\]/g, ' ')
    .replace(/[(){}\[\],:;]/g, ' ')
    ...
}
```

最初の `[ -]` は意図不明 (`-` が範囲指定の終端文字に近い)。日本語クエリへの
sanitize 効果は実質ゼロ。`config: 'simple'` を使っているので tokenizer は
半角空白で切るだけ → 日本語のフルテキスト検索は基本動かない設計になっている。
これは Phase 2F 後で `pgroonga` / `tsearch japanese config` 切り替え時に
本格対応する想定だが、現状 BM25 は英文混じりの query にしか効かない点を
docstring に明記すべき。

### LOW-A-13: recording-download.ts の zoom mock 判定が ad-hoc

```ts
const haveZoomKeys =
  env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET &&
  !env.ZOOM_ACCOUNT_ID.startsWith('zoom-acct-test');
```

`ZoomAdapter` を作って `adapter.isConfigured()` を返す形にすれば、test
プレフィックス判定の hard-code を avoid できる。OcrProvider と
TranscribeProvider に合わせて Zoom も Provider/Adapter パターン化すべき。

---

## 修正方針 (優先順)

### P0 — Phase 2 W2 完成宣言の前に必須
1. **HIGH-A-01**: storage 命名規約と RLS を整合させる migration を 0038 で追加。
   `{org_id}/{user_id}/{uuid}.{ext}` に倒し、route と policy の両方を変更。
2. **HIGH-A-02**: dedupe / normalize を `packages/shared/src/dedupe.ts` に
   切り出し、web / worker 両方から import。E2E test で「web の register と
   worker の OCR が同じ `normalized_phone` を吐く」ことを assert。
3. **HIGH-A-03**: `apps/worker/src/lib/pgmq.ts` に read / delete / ensure を
   集約。postgres-js client は module-level singleton。PgmqQueue 型を
   transcribe / summarize 含めて拡張。

### P1 — Phase 2 完了までに
4. **HIGH-A-04**: Drizzle schema を migration 0034 / 0036 / 0037 に追随。
   meeting_stage_transitions / search_queries / search_clicks の table 追加。
5. **MID-A-05**: `DEFAULT_ORG_ID` の使用を migration 適用前の dev / test に限定。
   worker 側で resource → org_id を引く helper を作る。
6. **MID-A-06**: `defineRoute` を dynamic segment に対応させ、毎リクエスト
   factory を消す。
7. **MID-A-07**: route から `lib/api/contacts-merge.ts` / `lib/search/orchestrator.ts`
   等にビジネスロジックを移管。route は I/O とエラー変換のみ。
8. **MID-A-08**: merge / register は Supabase RPC でトランザクション化。
9. **MID-A-09**: 検索の hydrate を pre-pagination → fetch only paged rows に。

### P2 — Phase 3 に持ち越し可
10. **LOW-A-11**: `beginIdempotency` の自動化。
11. **LOW-A-12**: 日本語 BM25 の真面目な対応 (`tsvector` + 形態素解析)。
12. **LOW-A-13**: ZoomAdapter / WhisperAdapter / OcrAdapter の adapter
    パターンの抽象を `apps/worker/src/lib/_adapter.ts` 等に統一。
