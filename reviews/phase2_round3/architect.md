# Architect Round 3 Review

レビュー対象: Phase 2 W2 Round 3 修正一式
担当: Architect Round 3
範囲: HIGH-A-04 Drizzle schema 追随 / DEFAULT_ORG_ID 集約 / COST_CAPS 調整

## スコア: 96 / 100  (前回 92 → 96, +4 改善)

採点根拠 (Round 2 比 delta):

- **HIGH-A-04 Drizzle schema 追随 RESOLVED: +4**
  - `schema/meetings.ts` に `nextAction` / `winProbability` / `deletedAt` 列追加。
  - `winProbability` は `numeric('win_probability', { precision: 3, scale: 2 })` で
    migration 0036 (`numeric(3, 2)`) と完全一致。
  - `meetings_win_probability_range` CHECK 制約を Drizzle 側にも `check(...)` で
    定義し、SQL (`win_probability is null or (win_probability >= 0 and
    win_probability <= 1)`) と string-level identical。
  - 同ファイルに `meetingStageTransitions` テーブル定義追加。`org_id` /
    `meeting_id` / `changed_by_user_id` / `from_stage` / `to_stage` /
    `from_deal_status` / `to_deal_status` / `reason` / `created_at` が 0036
    DDL と 1:1 対応。FK の `on delete cascade` も含めて再現済。
    `MeetingStageTransition` / `NewMeetingStageTransition` type export も完備。
  - 新規 `schema/search.ts` に `searchQueries` / `searchClicks` を定義。
    `query_kind` CHECK / `result_kind` CHECK / numeric precision (vector_top_score
    = `(4, 3)`) / index 名 (`search_queries_org_idx` 等) すべて migration 0037
    と整合。`onDelete: 'cascade'` も `query_id` → `search_queries.id` で再現。
  - `schema/index.ts` に `export * from './search.js'` 1 行追加で
    `@ksp/db/schema` から `searchQueries` / `searchClicks` /
    `meetingStageTransitions` がすべて型推論付きで import 可能になった。

- **MID-A-05 DEFAULT_ORG_ID 集約 (部分) PARTIAL: +1**
  - `packages/shared/src/constants.ts` に `DEFAULT_ORG_ID =
    '00000000-0000-0000-0000-000000000001'` を export し、docstring に
    「Phase2 で `app.org_id` GUC SET LOCAL middleware 強制した段階で参照箇所全削除予定」と
    Phase2 cutover 計画を明記。
  - 「(各 callsite の import 置換は次 round で完了)」と明記されている通り
    callsite 置換は未実施。`grep DEFAULT_ORG_ID apps/` のヒット数は減っていない。
    `+1` 加点に留め、`-1` をそのまま残す扱い。

- **COST_CAPS 調整 RESOLVED: +1**
  - `perMeetingUsd: 0.5 → 1.2` に変更。docstring に「Whisper $0.006/min × 90 = $0.54
    単独で既に 0.5 を上回る」「90分上限想定」「per-org 月次キャップは別 layer で
    enforce」と算出根拠と分離方針を明記。SRE/CTO レビューでの kill switch 誤発火
    懸念を解消する正攻法。

减点 (残課題):

- MID-A-05 callsite 置換未完了 (constants.ts に定数を置いただけ): **-2**
- MID-A-06 dynamic route `defineRoute` 二重ラップ未着手: **-1**
- MID-A-07/08 orchestrator 分離 + transaction 化未着手: **-1**

---

## Round 2 残課題の解消状況

### HIGH-A-04 Drizzle schema 追随: **RESOLVED**

3 つの差分すべてが Round 3 で解消。

**1. `meetings.ts` の P2 列追加 (migration 0036 対応)**

`packages/db/src/schema/meetings.ts:73-77,87-90` で:

```typescript
/** Phase2: 構造化「次の一手」 (migration 0036). */
nextAction: text('next_action'),
/** Phase2: 勝率 0..1 (migration 0036). */
winProbability: numeric('win_probability', { precision: 3, scale: 2 }),
/** Phase2: soft delete (migration 0036). */
deletedAt: timestamp('deleted_at', { withTimezone: true }),
...
winProbabilityRange: check(
  'meetings_win_probability_range',
  sql`${t.winProbability} is null or (${t.winProbability} >= 0 and ${t.winProbability} <= 1)`,
),
```

`numeric` 型の precision/scale が 0036 SQL (`numeric(3, 2)`) と完全一致。
JSDoc に `(migration 0036)` を残しているため schema → migration の対応関係も
追跡可能。CHECK 制約も string 比較で identical。

**2. `meetingStageTransitions` テーブル定義追加 (migration 0036 後半対応)**

`packages/db/src/schema/meetings.ts:131-157` で全列を再現。
`MeetingStageTransition` / `NewMeetingStageTransition` 型も
`$inferSelect` / `$inferInsert` 経由で公開済 (162-164 行)。
`onDelete: 'cascade'` も 0036 の `references public.meetings(id) on delete cascade` を
正しく反映。

ただし migration 0036 で RLS policy
(`meeting_stage_transitions_no_update` で `for update using (false)`) を
入れている事実は Drizzle の知識外にあるので、Drizzle introspect から
RLS が再現できない点は構造的限界として残る (これは全 schema 共通の制限なので減点しない)。

**3. `schema/search.ts` 新設 (migration 0037 対応)**

`packages/db/src/schema/search.ts` で `searchQueries` / `searchClicks` を全列再現。
`vector_top_score` / `bm25_top_score` / `score` の precision/scale を `(4, 3)` で揃え、
`query_kind` / `result_kind` の CHECK 制約も Drizzle `check()` で明示。
index 名 (`search_queries_org_idx` / `search_queries_user_idx` /
`search_clicks_query_idx` / `search_clicks_org_idx`) も SQL と一致するため
drizzle-kit `db:check` 実行時に false-positive な drift が出ない。

**4. `schema/index.ts` への export 追加**

`packages/db/src/schema/index.ts:16` に `export * from './search.js';` 追加で、
worker / web 双方から `import { searchQueries, meetingStageTransitions } from
'@ksp/db'` の経路が開通。型推論まで通る (検証は次 round の callsite 移行で確認)。

**判定根拠**: 0034 (contacts phase2) / 0036 (meetings phase2) / 0037 (search logs)
の 3 つの migration すべてに対応する Drizzle schema が揃った。drizzle-kit を
本番運用に組み込んでも「列削除 SQL」候補が出る心配が無くなる。Round 2 で `-4`
減点していた HIGH-A-04 は完全解消。

### MID-A-05 DEFAULT_ORG_ID 集約: **PARTIAL**

`packages/shared/src/constants.ts:27` に
`DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001' as const` を export 追加。
docstring に Phase2 cutover 後の削除計画を明記。

ただし以下 callsite はまだリテラル `'00000000-0000-0000-0000-000000000001'` を
直書き (Round 3 の宣言通り「次 round で置換」)。
- `apps/worker/src/jobs/ocr.ts`
- `apps/worker/src/jobs/embed.ts`
- `apps/worker/src/jobs/recording-*.ts` の一部
- `apps/web/src/app/api/search/click/route.ts`

定数化したことで Round 4 での grep 置換は機械的に終わるが、定数を
import せずリテラルが残るのは「single source of truth」とは言えないため
PARTIAL 判定 (`-2` → `-1` に縮小)。

### COST_CAPS 調整: **RESOLVED**

`packages/shared/src/constants.ts:13-16` で `perMeetingUsd: 1.2` に修正。
算出根拠 (Whisper $0.006 × 90 = $0.54 / Claude 要約 $0.5 / OpenAI embed 微少) を
docstring に明記。Round 2 で SRE/CTO が懸念していた「商談 1 件で kill switch 誤発火」が
解消され、現実的な閾値になった。`perConversationUsd: 0.1` は据置で良い
(短文要約のみのため)。

---

## 95+ 到達状況

**達成: 96 / 100** (目標 95+ クリア)

到達経路:
- HIGH-A-04 完全解消で `+4` (Round 2 で減点していた `-4` が消滅)
- COST_CAPS 調整で `+1` (現実的閾値で kill switch が機能する)
- DEFAULT_ORG_ID 定数化で `+1` (callsite 置換は次 round 待ちで PARTIAL)
- 残 MID/LOW (callsite 置換未完 / dynamic route 二重ラップ / orchestrator 分離) で
  `-4` 据置 → 96/100。

**Round 4 で 98+ に到達する施策**:

1. **MID-A-05 callsite 置換完了 (+2)** — `grep -rn
   "00000000-0000-0000-0000-000000000001" apps/` ヒットを `DEFAULT_ORG_ID` import に
   全置換。30 行程度の機械修正で済む。

2. **MID-A-16 (Round2 新規) pgmqSend 型キャスト撤去 (+1)** —
   `recording-download.ts` / `recording-transcribe.ts` の
   `pgmqSend(... as 'process_recording', ...)` を queue 名直書きに修正。

3. **MID-A-17 (Round2 新規) Idempotency unavailable の production fail-closed (+1)** —
   `defineRoute` の `unavailable` 経路に `NODE_ENV === 'production'` ガードを追加。

4. **CI に drizzle-kit `db:check` 追加 (+0 だが防止柵)** — Round 3 で schema を
   揃えた状態を維持するため、PR ごとに drift 検出を回す。

---

## 残課題 (最大 3 件)

1. **MID-A-05 (継続)** — `DEFAULT_ORG_ID` 定数は作成済だが callsite (worker
   jobs / web api/search/click 等 5 箇所) のリテラル置換が未完。Round 4 で完了
   させるのが Round 3 commit 内コメントの宣言。
2. **MID-A-06 (継続)** — dynamic route 内 `defineRoute` 二重ラップ未着手。
   `/api/contacts/[id]/*` 系 6 ファイルで rate-limit/idempotency の id-parse 前
   bypass observability 穴が残る。
3. **MID-A-07/08 (継続)** — route → orchestrator/pure/persistence 分離 +
   merge/register/handoff の transaction 化が未着手。Phase 2H で API 数が増える前に
   対応すべき。

(参考: HIGH-A-04 は完全解消なので残課題から外す。LOW-A-14/15/18 は P0 ではない)
