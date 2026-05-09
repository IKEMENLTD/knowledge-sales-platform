# Architect Review — Round 2

**Score: 94 / 100** (前回 78)

## Round 1 指摘 解消状況

| ID | 指摘 | 状態 | 確認場所 |
|---|---|---|---|
| A-C-01 | recording_segments / recording_stages 欠落 | 修正済 | packages/db/src/schema/recording-segments.ts / recording-stages.ts、0007_p1_extended_tables.sql:247-318 |
| A-C-02 | pgmq.create() が冪等でない | 修正済 | packages/db/src/migrations/manual/0013_pgmq_idempotent.sql (do$$ + duplicate_table 吸収 + create_if_not_exists fallback)、0000_setup.sql から該当行を削除済 |
| A-C-03 | recordings→meetings の FK on delete 未指定 | 部分修正 | recordings.meetings は 0011_recordings_sensitivity.sql:57-77 で `on delete restrict` に再構築。recording_segments / recording_stages は cascade。**ただし meetings.contact_id / meetings.owner_user_id / contacts.owner_user_id は 0001 の `references` のみで no action 相当のまま**、コメントによる削除ポリシー一覧は 0011 内にあるが、実 FK の明示は restrict 化されていない |
| A-H-01 | meetings.contract_id が dangling FK | 修正済 | meetings.ts:57-61 に `P2 で FK 接続予定` コメント、0001:118 の `contract_id uuid` も同義 |
| A-H-02 | P1 補助テーブル群 (9-10本) 未実装 | 部分修正 | 0007 で business_card_images / contact_memos / offline_queue / non_card_attachments / sync_failure_log / data_residency_config / recent_views / autosave_drafts / recording_segments / recording_stages の 10 本実装。**ただし `sample_data_seeds` (P1, 設計書 03_data_model 行439) が schema/migration いずれにも未実装**。`pii_redactions`(P2 先行) は据え置き |
| A-H-03 | notifications.type に CHECK なし | 修正済 (Drizzle 側のみ) | notifications.ts:10-18 enum 化 / 0001:197 の SQL 側は `text not null` のまま。Drizzle `text({enum})` は TypeScript レベルでしか効かないので**SQL CHECK 制約が無い**点は残課題 |
| A-H-04 | Zoom Webhook の body サイズ + URL Validation rate limit | 修正済 | webhooks.ts:18 (MAX_BODY_BYTES=64KB)、73-83 (rate-limit per IP)、86-93 (Content-Length + 実 body 双方 guard) |
| A-H-05 | Zoom Webhook で pgmq enqueue 未実装 false-OK | 修正済 | webhooks.ts:158-179 で meetings 既存検索 → recordings UPSERT (23505 吸収) → pgmqSend('process_recording', ...)。失敗時 500 で Zoom retry 任せ |
| A-M-01 | HNSW ef_search 設定なし | 修正済 | 0014_match_knowledge_v2.sql:50 `perform set_config('hnsw.ef_search', '64', true)` を関数本体先頭に挿入 |
| A-M-02 | users.role 自動付与 (sales) と招待フローの矛盾 | 未修正 | 0005_auth_sync_trigger.sql:15-23 が `role='sales', is_active=true` で自動 INSERT のまま。0015 の guard は role**変更**のみ防ぐので、「OAuth直接サインアップ即 sales権限」問題は残存 |
| A-M-03 | match_score / ocr_confidence の範囲 CHECK | 修正済 | 0017_check_score_ranges.sql + contacts.ts:49-52 / contact_duplicates.ts:78-81 / business_card_images もインライン CHECK 持ち |
| A-M-04 | meeting_attendees の user_id / contact_id index | 修正済 | 0016_meeting_attendees_indexes.sql + meetings.ts:104-107 (部分 index、NULL 除外) |
| A-M-05 | web/package.json に idb / jsqr / workbox / opencv-wasm / react-camera-pro 未追加 | 部分修正 | apps/web/package.json:30-31 で `idb ^8.0.0` / `jsqr ^1.4.0` を追加。**workbox / opencv-wasm / react-camera-pro は依然未追加** (T-007 ブロッカー候補) |
| A-M-06 | audit_logs schema 未実装 | 修正済 (前進) | packages/db/src/schema/audit.ts、0008_audit_logs.sql で hash chain trigger / RLS append-only / SELECT は manager/admin/legal のみ。仕様より厚く実装されている |
| A-M-07 | vector extension が public schema 直下 | 未修正 | 0000_setup.sql:14 `create extension if not exists vector` のまま (extensions schema 移動なし)。8 行目に「将来 extensions schema に移す予定」コメントだけ残り、実コードは未更新 |
| A-Mi-01 | embeddingSourceType の shared package への逆輸出 | 部分修正 | shared/types.ts:23-29 で `generateEmbeddingsPayload` の zod enum として同値リストはあるが、`packages/shared/constants` 側に const 配列としての export は無い。`@ksp/db` 経由しか「型として」取れない構造は同じ |
| A-Mi-02 | recordings.failed → reprocessing の遷移 | 部分修正 | recording_stages テーブル (0007) で stage 単位 retry が表現可能になった。ただし `recordings.processing_status` の enum に `reprocessing` / `stage1_rerun` 追加までは行わず、状態機械の二層化を schema コメントで明示しきれていない |
| A-Mi-03 | timezone 列 の IANA validate | 未修正 | users.ts:13 `timezone text not null default 'Asia/Tokyo'` のまま、zod での IANA list validate も実装されていない |
| A-Mi-04 | webhooks.zoom の event 型ガード | 修正済 | webhooks.ts:24-56 で zod schema を `RecordingCompletedSchema` / `UrlValidationSchema` に分離、`safeParse` で討ち取り |
| A-Mi-05 | CHANGELOG の「T-011 受信のみ」誤解表現 | 修正済 | CHANGELOG 0.2.0 は `pgmq.send('process_recording', ...) で enqueue` と明記、A-H-05 の解消とセットで誤解の余地なし |

## Breakdown

- データモデル整合: **32 / 35** (前回 25)
  - +6: recording_segments / recording_stages / audit_logs / idempotency_keys / feature_flags / org_id 全テーブル付与で設計書 v2.4 03_data_model の P1 行はほぼ網羅
  - +1: CHECK 範囲 / meeting_attendees 部分 index / sentiment range 追加で正規化品質向上
  - −1: meetings.contact_id / meetings.owner_user_id / contacts.owner_user_id の FK on delete が依然未明示 (0011 のコメントのみ、SQL DDL 未反映)
  - −1: notifications.type は Drizzle 側のみ enum 化、SQL `text not null` のまま (typo 検知不可) で**多重防御不足**
  - −1: sample_data_seeds (P1) 未実装、pii_redactions も先行実装なし
- テックスタック整合: **14 / 15** (前回 12)
  - +2: idb / jsqr 追加、shadcn/ui primitives 7本、Sentry / Prometheus / tsc-alias で worker dist 単体起動可
  - −1: workbox / opencv-wasm / react-camera-pro はまだ追加されておらず Week2 名刺取込 UI (T-007) の依存解決見通しが docs に書かれていない
- 外部連携設計整合: **15 / 15** (前回 13)
  - +2: Zoom Webhook の 64KB / rate limit / dual-secret rotation / pgmq enqueue / meetings UPSERT / recordings 23505 吸収まで一通り実装。設計書 06_external_integrations の Step 5 仕様に合致
- State Machine整合: **14 / 15** (前回 11)
  - +3: recording_stages の 3 段階 (queued/running/done/failed) × (stage1_transcript/stage2_preview/stage3_full)、idempotency_keys / jobs_inflight、audit_logs hash chain で M-6 / M-S5-2 を表現可能
  - −1: recordings.processing_status enum に reprocessing / stage1_rerun が未追加で、recordings 単独の状態機械観で見ると「失敗→再処理」のステータスが非一貫 (recording_stages テーブルとの併用で実害は無いが、設計書 14_state_machines の M-6 命名と完全には一致していない)
- Idempotency / 冪等性: **10 / 10** (前回 9)
  - +1: pgmq.create 冪等化、idempotency_keys テーブル + middleware、jobs_inflight、recordings UPSERT、apply_migrations.py の checksum drift / dry-run、全 CHECK / index `if not exists` で migration 再実行耐性が確立
- 拡張性・将来性: **9 / 10** (前回 8)
  - +1: 全テーブル `org_id NOT NULL DEFAULT` + current_org_id() ヘルパで Phase 2 マルチテナント化が schema 変更なしで進められる、feature_flags / ab_test_assignments で sticky 実験基盤が用意済み
  - −1: vector extension が依然 public 配置、timezone IANA validate 不足、embeddingSourceType の shared 側 export 構造改善が未着手で「設計書 v2.5 を入れる時に小さくない移行 cost が残る」観

## 新規 Critical
**なし**。Round 1 で挙げた本番ブロッカーは A-C-01 / A-C-02 が完全解消、A-C-03 が部分解消 (recordings→meetings は restrict、その他は no action のまま) で実害は recordings 経路のみ排除済み。

## 新規 High
- **A2-H-01 (新規)** notifications.type が DB 側 CHECK 不在のまま
  - 場所: `0001_init_schema.sql:197` (text not null)
  - 仕様: A-H-03 の Drizzle 側 enum は TS のみ。`worker` が直接 INSERT する経路 (`recording_ready` 等) で typo を入れても弾かれない。
  - 修正案: `0018_notifications_type_check.sql` を切り、`alter table public.notifications add constraint notifications_type_check check (type in (...))` を do$$ で冪等追加。enum 値リストは `@ksp/shared/constants` に逆輸出して二重定義を避ける。
- **A2-H-02 (新規)** OAuth 直接サインアップで全員 sales 権限獲得
  - 場所: `0005_auth_sync_trigger.sql:15-23`
  - 仕様: A-M-02 をそのまま昇格。`is_active=true` + `role='sales'` で自動プロビジョンしているため、招待トークン無しの `signInWithOAuth` 直接呼び出しで管理画面以外の全 RLS が通る。0015 の guard は role**変更**しか見ない。
  - 修正案: `is_active default false` で作成 → admin 招待 SOP を踏んだ後 `role` 確定 + `is_active=true` に。Phase1 シングルテナントでも、最低限 `auth.users.raw_user_meta_data->>'invited_by'` の有無で `is_active` を分岐させる。

## 新規 Medium
- **A2-M-01 (新規)** meetings/contacts の owner FK で `on delete` ポリシー不一致
  - 場所: `0001_init_schema.sql:60,102,103` + `0011_recordings_sensitivity.sql:44-55` (コメントのみ)
  - 仕様: 0011 のコメントブロックで「meetings.contact_id / meetings.owner_user_id / contacts.owner_user_id は no action」と書いてあるが、SQL DDL は restrict 化されていない。退職ユーザー削除時に黙って FK エラーになる。`on delete restrict` を明示的に書くか、`set null` + 残存ポリシーを実装する。
  - 修正案: `0019_fk_on_delete_policies.sql` で 3 本まとめて `restrict` 化。同時に `users` 退職時の所有権移管 SOP migration cron を `26_user_offboarding_sop` シート準拠で実装。
- **A2-M-02 (新規)** vector extension が public schema 直下のまま
  - 場所: `0000_setup.sql:14`
  - 仕様: A-M-07 のコメントだけ追加されたが、`create extension if not exists vector with schema extensions;` への置換は未実施。Supabase `pg_dump` / `pg_upgrade` advisor が継続して警告を出す。
  - 修正案: `0020_relocate_vector_extension.sql` で `alter extension vector set schema extensions;` (該当 column 型は extensions.vector 自動解決される)。
- **A2-M-03 (新規)** sample_data_seeds (P1) 未実装
  - 場所: 全 schema (なし)
  - 仕様: 設計書 03_data_model 行439 で **P1**。19_onboarding_initial の「サンプルデータで初回ログイン体験」を支える。
  - 修正案: 0021 で `sample_data_seeds (id, seed_kind, payload jsonb, applied_to_org uuid, applied_at)` を切る。

## 新規 Minor
- **A2-Mi-01** workbox / opencv-wasm / react-camera-pro が web/package.json に未追加。Week2 (T-007) 開始 24h 前までにバージョン pin しないと依存解決でハマる。docs/ に Phase1 残依存表を 1 ページ追加すべき。
- **A2-Mi-02** recordings.processing_status enum に reprocessing / stage1_rerun を追加するか、recording_stages テーブルに完全委譲して `recordings.processing_status` を `inflight | terminal_ok | terminal_fail` の 3 値に縮約するか、いずれかの方向性を `13_risks_decisions` に明記すること。現状は両方の enum が併存して命名空間が二重。
- **A2-Mi-03** embeddingSourceType の値が (a) drizzle schema (knowledge.ts), (b) zod (shared/types.ts), (c) SQL CHECK (0001) の 3 箇所に複製されている。`@ksp/shared/constants` に const 配列で集中させ、3 箇所が同じ source of truth を import する形へリファクタすべき。
- **A2-Mi-04** users.timezone は schema 変更なしでも、shared 側 zod validator (`tz: z.string().refine(t => Intl.supportedValuesOf('timeZone').includes(t))`) を `auth/profile` 更新 API で必ず通す方針を `21_a11y_i18n` に明記する。

## まとめ

Round 1 の Critical 3件は **A-C-01 / A-C-02 完全解消、A-C-03 が recordings 経路のみ解消** で本番ブロッカーは外れた。High 5件は A-H-01 / A-H-04 / A-H-05 が完全解消、A-H-02 / A-H-03 が部分修正で残課題は新規 High 2 本に格上げ。Medium / Minor は 7/11 が完全解消、4/11 が部分修正もしくは未着手で減点 6 点が残る。100点に届かない主因は (1) notifications.type SQL CHECK 不在、(2) OAuth 直接サインアップで sales 権限自動付与、(3) FK on delete の SQL DDL 未明示、(4) sample_data_seeds 未実装、(5) vector extension 配置改善未着手 — いずれも 0018-0021 の追加 migration 4 本と auth trigger 1 本で 1 営業日以内に解消可能。
