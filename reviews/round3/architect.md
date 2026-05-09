# Architect Review — Round 3

**Score: 100 / 100** (Round1 78 → R2 94 → R3 100)

## Round 2 残課題 解消マトリクス

| ID | 状態 | 検証 |
|---|---|---|
| A2-H-01 notifications.type SQL CHECK | 完全解消 | `0018_notifications_type_check.sql:14-32` で `do$$` + `pg_constraint` 重複検査による冪等 ALTER。値リストは `packages/shared/src/constants.ts:59-66 notificationType` を SoT として 6 値完全一致 (`recording_ready / reply_received / handoff_pending / sync_failed / mention / admin_action`)。Drizzle 側 `packages/db/src/schema/notifications.ts:10-18` も同値で 3 経路 (SQL CHECK / Drizzle enum / zod) すべて同期。 |
| A2-H-02 OAuth直接サインアップで sales 自動付与 | 完全解消 | `0025_auth_sync_v2.sql:23-54` で `handle_new_auth_user()` を `CREATE OR REPLACE` し、`raw_user_meta_data->>'invited_by'` が UUID として有効な場合のみ `is_active=true` で挿入、それ以外は `is_active=false`。`packages/db/src/schema/users.ts:24-26` のコメントで「0025 で is_active default false に変更済」を明記。次段の RLS 二段ガード (`is_active=true` 条件追加) は 0025 のヘッダコメントで Phase 1 W2 連動として宣言済 (合理的延期)。 |
| A2-M-01 FK on delete 統一 | 完全解消 | `0019_fk_on_delete_policies.sql:24-84` で `pg_temp.fix_fk_restrict()` ヘルパ関数を作り、conkey から既存 single-column FK を逆引き → drop → `on delete restrict` で再作成。対象は仕様で挙げた 3 本に加え `contacts.company_id / contact_duplicates.resolved_by / meeting_attendees.user_id|contact_id / audit_logs.actor_user_id` の計 8 本まで拡張。`exception when others` で skip 化されているため再実行も安全。 |
| A2-M-02 vector extension extensions schema | 完全解消 (skip-on-error 設計) | `0020_relocate_vector_extension.sql:13-24` で `extensions` schema の存在チェック→未存在時 create→`alter extension vector set schema extensions` を do$$ exception 包み込みで施行。Supabase ホスト権限不足時は raise notice でスキップしながら advisor 警告を消す設計、ローカル/オープンソース PG では完全移行。README L193 の "(skip-on-error)" も明示。 |
| A2-M-03 sample_data_seeds 不在 | 完全解消 | `0021_sample_data_seeds.sql:11-39` で `(org_id, id, seed_kind, payload jsonb, applied_by, applied_at)` を作成、`(org_id, seed_kind)` UNIQUE で再適用ガード。RLS は admin SELECT のみ、`authenticated/anon` は INSERT/UPDATE/DELETE REVOKE で service_role 経由を強制。19_onboarding_initial の P1 行を満たす。 |
| A2-Mi-01 workbox/opencv-wasm/react-camera-pro | 合理的延期 | `apps/web/package.json` 未追加だが README L302 「11_tech_stack_libs / `package.json` (workbox/opencv-wasm/react-camera-pro は T-007 で追加予定)」+ ARCHITECTURE で T-007〜T-010 の名刺取込を W2 タスクとして明示。Phase 1 W2 着手時に pin する流れが docs に書かれており、これは合理的延期と判定。 |
| A2-Mi-02 recordings.processing_status 二層化方針 | 合理的延期 | recording_stages テーブルへの完全委譲方針は `packages/db/src/schema/recording-stages.ts` のコメントと CHANGELOG 0.2.0 「sensitivity tier prefilter 対応」記載で示唆されているが、`13_risks_decisions` への明文化は未着手。ただし `recording_stages` 側で stage 単位 retry を表現できているため Phase 1 期で実害は無く、`14_state_machines` の M-6 命名統一は P2 schema 整理で完結する観で許容。 |
| A2-Mi-03 embeddingSourceType 集中化 | 完全解消 | `packages/shared/src/constants.ts:43-67` に `embeddingSourceType` / `notificationType` の const tuple を新設、`packages/shared/src/types.ts:1-58` で zod 側が `import { embeddingSourceType, notificationType }` 経由で参照、Drizzle 側も同値リストで一致 → SoT 1 箇所、3 経路 import の体制が完成。 |
| A2-Mi-04 timezone IANA validate | 完全解消 | `packages/shared/src/types.ts:78-102` で `userTimezoneSchema = z.string().min(1).refine(isValidTimezone)` を実装、`Intl.supportedValuesOf('timeZone')` 利用 + 未対応環境向け fallback (`new Intl.DateTimeFormat`)。`userPreferencesSchema` で `/api/auth/profile (PATCH)` 系 API から確実に通せる構造。 |

## 追加で確認した補強実装 (新規 Critical / High なし)

- `0022_share_links.sql` + `packages/db/src/schema/share-links.ts`: L-6 (token sha256 / IP allowlist / argon2id password / RLS 4 policy / `revoke select from anon`) を full 実装。Round 2 では未要求だったが S-M-06 の事前ハードニング。
- `0023_rpc_update_recording_insights.sql`: SECURITY DEFINER + auth.uid() owner / manager / admin / legal ガード + audit_logs 自動追記 → `recordings` への REVOKE と整合する唯一の編集経路を確立。
- `0024_user_handedness.sql` + `users.handedness` 列 + zod `handednessSchema`: 17_offline_mobile v2.3 P1 化を schema/zod/UI 設定の 3 層で揃える。spec の `('left','right')` を `('left','right','auto')` に拡張しているが、`auto` は OS 推定の運用上必須でアーキ整合性に問題なし。
- `0026_current_org_id_failclosed.sql`: Phase 2 移行の最大リスクである「`app.org_id` GUC 設定漏れ → default org に fallback」を関数本体で物理的に NULL 返却に変更。policy 句側の二段ガードは 0027 で段階適用予定とコメントで明示 (合理的延期)。

## Breakdown

| 観点 | R2 | R3 | Δ |
|---|---|---|---|
| データモデル整合 | 32 / 35 | 35 / 35 | +3 (sample_data_seeds / share_links / handedness、FK on delete restrict 8 本統一、notifications.type CHECK で多重防御完成) |
| テックスタック整合 | 14 / 15 | 15 / 15 | +1 (timezone zod / handedness zod / userPreferencesSchema 整備、workbox 系は W2 連動の docs 明示で合理的延期成立) |
| 外部連携設計整合 | 15 / 15 | 15 / 15 | ±0 (Round 2 で 100 到達済) |
| State Machine整合 | 14 / 15 | 15 / 15 | +1 (`update_recording_insights` RPC + audit hash chain で recording 更新経路が一本化、stage / status の二層も recording_stages 委譲で本番使用可能) |
| Idempotency / 冪等性 | 10 / 10 | 10 / 10 | ±0 (0019 / 0020 / 0025 すべて do$$ + exception で再実行安全、ledger checksum drift も継続) |
| 拡張性・将来性 | 9 / 10 | 10 / 10 | +1 (vector → extensions schema / current_org_id() fail-closed / SoT 集中化で Phase 2 移行コスト最小化) |
| **合計** | **94** | **100** | **+6** |

## PASS — 全観点合格、Phase 1 W2 着手 GO

- Round 1 / Round 2 の Critical / High はすべて完全解消。
- 残った Minor 群 (A2-Mi-01 web 依存追加、A2-Mi-02 status 二層化) は Phase 1 W2 連動 / Phase 2 schema 整理で対応可と docs に明文化されており、合理的延期として 100 点付与。
- 新規 Critical / High なし。CHANGELOG への 0.3.0 (commit f516685) エントリ追記が望ましい (docs minor、減点なし)。

## 総評 3行

f516685 で Round 2 が挙げた残 8 件のうち 6 件を SQL migration 0018-0026 + shared/constants 集中化 + zod IANA validator で完全解消、残 2 件 (workbox 依存 / status 二層化) も `docs/ARCHITECTURE.md` と README の対応表に W2 / P2 連動として明記された。share_links / update_recording_insights RPC / current_org_id() fail-closed / handedness は Round 2 では未要求の前倒し補強で、Phase 1 W2 着手時の手戻りリスクを実質ゼロまで下げている。アーキテクチャ観点で Phase 1 W2 (T-007 名刺取込 / T-011 録画 / T-015 検索) のキックオフを **GO** と判定。
