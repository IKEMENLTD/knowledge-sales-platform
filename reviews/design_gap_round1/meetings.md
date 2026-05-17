# 設計書 vs 実装 ギャップ分析 — 商談 (Meetings)

担当範囲: T-014 / SC-09 (一覧) / SC-10 (新規) / SC-11 (詳細) / SC-12 (ライブメモ)
関連 SC: SC-23 (引き継ぎ作成) / SC-24 (契約詳細) / SC-42 (商談前ブリーフ) / SC-43 (商談中ライブ検索) / SC-44 (顧客向け要約) / SC-53 (引き継ぎ予習)
関連シート: 02_screens, 03_data_model, 04_api_endpoints, 05_jobs_queues, 06_external_integrations, 13_risks_decisions, 14_state_machines, 15_field_ux_supplement, 23_observability_alerts, 24_acceptance_test_matrix

参照コミット: HEAD (`apps/web/src/app/meetings/**`, `apps/web/src/app/api/meetings/**`, `packages/db/src/schema/meetings.ts`, `0036_meetings_phase2.sql`)

---

## サマリ

| 区分 | 件数 |
| --- | --- |
| P0 (致命/即時) | 5 |
| P1 (P1 範囲必須) | 13 |
| P2 (P2 必須) | 16 |
| P3 (将来) | 8 |
| **合計** | **42** |
| 設計書記載スコープ概算 | 約 60 (商談 + 関連連携) |
| 実装率 (粗) | **約 30%** (T-014 CRUD + stage audit + handoff notification は完成、外部連携・自動化系は未着手) |

「実装済み」と判定したもの: T-014 CRUD、`win_probability` 自動導出、`meeting_stage_transitions` audit、handoff 通知 (notifications) + manual_notes 追記、ステージ DnD UI (kanban)、加重パイプライン KPI、ステージ遷移逆走 warning。
「未実装」と判定したもの: Google Calendar / Gmail 連携、contracts/handoffs/email_threads/scheduling_proposals テーブル、商談自動議事録、失注後フォロー、forecast monte carlo、担当者別 KPI、商談前 brief、ライブメモ (SC-12)、外部要約 (SC-44)、リスケ・新規作成エンドポイント、attendees CRUD UI、ブロードキャスト通知。

---

## P0 — 即時修正 (実装ある機能が動かない)

### P0-M-01. ステージ変更 UI が API と HTTP メソッド不一致で全壊
- 該当: `apps/web/src/app/meetings/_components/kanban-board.tsx:107-110` / `apps/web/src/app/meetings/[id]/_components/stage-select-client.tsx:40-44`
- 実装: フロントは `fetch('/api/meetings/{id}/stage', { method: 'PATCH', body: { stage } })`
- API 側: `apps/web/src/app/api/meetings/[id]/stage/route.ts` は `export async function POST` のみ。`{ toStage }` を受ける `meetingStageTransitionRequestSchema` 検証。
- 結果: kanban DnD・ステージ select ともに **405 Method Not Allowed / 422 Bad Request** で必ず失敗する (catch 内で silent fallback 表示)。`meeting_stage_transitions` audit も書かれない。
- 修正案: フロントを `method: 'POST', body: { toStage: to }` に統一。あるいは route に PATCH ハンドラを追加。
- 影響: SC-09 (kanban) と SC-11 (stage select) の中核動線。

### P0-M-02. 商談新規作成 UI (SC-10) が 0 % — `/meetings/new` ルート不在
- 設計: SC-10 `/meetings/new` `ContactPicker, AttendeesPicker, EmailTemplatePicker, AvailabilityPreview` (P2)
- 実装: `apps/web/src/app/meetings/` 配下に `new/page.tsx` 存在せず。API は `POST /api/meetings` (route.ts:46) があるが画面が触れない。
- 結果: 商談を UI から手動作成できない。Zoom webhook 経由でしか meetings row が生まれない。
- 修正案: SC-10 ページを scaffolding + AP-09 availability / AP-13 confirm を後段で接続。最低限 contact_id+title だけでも作れる "簡易フォーム" 先行が必要。
- Phase: P2 だが、現在の UX 上は P0 抜け。

### P0-M-03. `/api/meetings` GET の `stage` クエリ enum が UI の kanban ステージと別物
- 該当: フィルタバー `meetings/_components/meeting-filter-bar.tsx` は `stage='scheduled'|'in_progress'|'won'|'lost'|'on_hold'` を URL に積む。
- API: `apps/web/src/app/api/meetings/route.ts:36-44` は `meetingStageSchema = z.enum(['first','second','demo','proposal','negotiation','closing','kickoff','cs_regular','cs_issue'])` を期待。
- 結果: フィルタバーから API を直接叩くと 422。現状 `apps/web/src/app/meetings/page.tsx` は Supabase 直 SELECT で API を経由しないので "画面は動く" が、API クライアント (将来の mobile/外部) は破綻。
- 修正案: API 側に `dealStatus` のみ受ける運用に整理し、`stage` (DB enum) と `kanbanStage` (画面 enum) を別フィールドで明示分離。`page.tsx:51` の `ALLOWED_STAGES` も同じ前提で。

### P0-M-04. `meeting_stage_transitions.created_at` vs API 仕様の `changed_at` 不整合
- 該当: `packages/db/src/schema/meetings.ts:151` は `createdAt`、`0036_meetings_phase2.sql:33` も `created_at`。
- 設計: 14_state_machines / 02_screens (SC-11 stage history) は `changed_at` 想定で議論。
- 実装: `apps/web/src/app/meetings/[id]/page.tsx:286` の SELECT は `.select('id,from_stage,to_stage,reason,changed_by,changed_at')` → **存在しないカラム** を要求。`try/catch` で握りつぶされて transitions=[] 化。
- 結果: 「ステージの軌跡」セクション (StageHistory) が**常に空表示**。
- 修正案: schema を `changedAt` に rename するか、page.tsx の SELECT を `created_at` + `changed_by_user_id` に修正。reason エイリアスも同様。

### P0-M-05. 商談詳細の contact 結合が schema 不一致 — `full_name` / `company_name` / `job_title` カラム参照
- 該当: `apps/web/src/app/meetings/[id]/page.tsx:248,265,370-373`
- 設計 DM (03_data_model): `contacts` は `name`、所属は `company_id → companies.name`。商談一覧 (`apps/web/src/app/meetings/page.tsx:108`) はその仕様で書かれている。
- 詳細ページのみ `full_name, job_title, company_name` を直接 SELECT → Supabase エラーで catch、demo fixture に fallback。
- 結果: live DB が存在しても**商談詳細が常にサンプル表示**になる潜在バグ。
- 修正案: detail page も一覧と同じ pattern (contacts.name + companies join) に統一。

---

## P1 — P1 範囲で必須 (未実装が設計書 P1)

### P1-M-06. `contracts` テーブル未作成 (P2 だが FK だけ schema に用意)
- 設計 03_data_model 行 223-235: `contracts(id, company_id, contract_number, product, amount, start_date, end_date, document_url, cs_owner_user_id, sales_owner_user_id, created_at)`
- 実装: `meetings.contractId` の uuid 列のみ存在 (`packages/db/src/schema/meetings.ts:71` コメント "P2 で接続予定"). migration / schema ファイルなし、RLS なし。
- 影響: `/contracts/[id]` (SC-24), handoffs (FK 親), renewal alert (US-74) すべてブロック。
- Phase: P2 だが商談機能の終端のため P1 で型だけは入れたい。

### P1-M-07. `handoffs` テーブル未作成 (handoff 機能の永続化が無い)
- 設計 03_data_model 行 236-246: `handoffs(id, contract_id, from_user_id, to_user_id, content jsonb, status, reviewed_at, comments)` + 03 行 1022-1029 で `staged_state, merge_undo_window_hours` 追加列。
- 実装: 該当 schema / migration 不在。`POST /api/meetings/[id]/handoff` は notifications 1 件 + meetings.manual_notes に文字列追記しているだけ。handoff の workflow (draft → submitted → accepted → revised) が成立しない。
- 影響: SC-23 (`/handoffs/new`), SC-53 (preview), AP-37〜40, 14_state_machines の handoff lifecycle, AT-S9-SLA (48/72h escalate), F-S9-1 SLA, F-S9-5 quality metrics 全滅。
- Phase: P2 だが、現状の "manual_notes 追記" だけでは商談機能 R-014 のスコープが半分しか満たせない。

### P1-M-08. Google Calendar 双方向 sync 不在 (P1 で API 配備せず)
- 設計 06_external_integrations: `Google Calendar API` events.insert/update/delete + freebusy.query (P2)、scheduling_proposal `confirm` → Calendar event 作成 (14_state_machines), watch channel 受信 (Push notification) 言及あり。
- 実装: `meetings.google_calendar_event_id` 列はある (`schema/meetings.ts:58`)。だが Calendar API 呼び出しコード、watch channel handler (`/api/webhooks/calendar` 等)、event → meeting auto INSERT パイプライン**すべて未実装**。`apps/worker/src/jobs/` 配下 0 件。
- 影響: AP-09 availability, AP-13 confirm, AP-18 reschedule, AP-62 calendar-holds, SC-39 (`/share/[token]/scheduling`)。
- Phase: P2 で必須。商談ファネルの入り口が動かない。

### P1-M-09. Gmail thread 連携テーブル + auto-tag 不在
- 設計 03_data_model 行 175-203: `email_threads`, `email_messages`, `email_templates`, `scheduling_proposals` 全 4 テーブル。
- 実装: schema / migration 全て不在。`/api/webhooks/gmail` (API-43), `/api/scheduling/parse` (AP-64), thread の meeting 自動 attach (`email_threads.meeting_id`) も無い。
- 影響: SC-13 (email draft), SC-14 (scheduling inbox), AP-10/11/12/13 全滅。`commitments` 抽出と並ぶ T-014 のもう一つの中核。
- Phase: P2 必須。

### P1-M-10. 商談自動議事録 — 録画完了 → `meetings.manual_notes` 自動草稿 不在
- 設計: 05_jobs_queues `q_post_meeting_checklist {meeting_id}` (F-S5-5 商談後タスク自動生成), `q_recording_stage3_full` 完了 → 「ニーズ/反論/約束抽出」(P1)
- 実装: `apps/worker/src/jobs/recording-summarize.ts` は存在するが、`meetings.manual_notes` への自動書き込みは無い。`recordings.summary` 列にのみ保存。
- 修正案: stage3 job 完了時に `meetings.manual_notes` が空なら AI 草稿を自動 INSERT (or 別 `meetings.ai_draft_notes` 列を起こす)。
- 影響: 営業の議事録作成負荷ゼロ化という商品価値 1 等の体験。
- Phase: P1。

### P1-M-11. `lost_reason` の構造化 (enum/category) 化が未実装
- 設計 13_risks_decisions / 24_acceptance_test_matrix AT-S8-2 (失注分析) + SC-52 `/dashboard/manager/losses` (loss_analyses) + AP-77 `/api/dashboard/losses`
- 実装: `meetings.lost_reason` は `text` (`schema/meetings.ts:66`) のフリーテキスト。Category enum 列 (`lost_reason_category`) なし、loss_analyses テーブルなし、SC-52/AP-77 ルートなし。
- 修正案: `lost_reason_category text CHECK (... in ('budget','timing','competitor','feature_gap','no_decision','contact_lost','other'))` + 既存 free text を併存。
- 影響: マネージャー失注分析 (AT-S8-2) 完全に成立しない。
- Phase: P3 だが商談データモデルの欠落として P1 で入れるべき。

### P1-M-12. 失注後フォロー scheduler (3/6ヶ月後 auto reminder) 不在
- 設計 13_risks_decisions RD-57 (運用): 「契約更新失念 → 解約 → 3ヶ月前/1ヶ月前アラート」採用済み。23_observability_alerts 行 16 「契約更新 3ヶ月前 Slack/Push」P2。
- 失注側のフォロー (3/6ヶ月後の再アタック) は 13_risks_decisions / 27_simulation_resolutions に直接対応 ID は見当たらないが、`/api/dashboard/losses` のループ前提として要件化されている。
- 実装: `q_renewal_3m_alert` (05 行 121) も含めて cron job 配備ゼロ。`meetings.deal_close_date='lost'` を起点とした reminder logic 無し。
- 修正案: `apps/worker/src/jobs/lost-followup.ts` を新設、`deal_status='lost' AND deal_close_date < now() - interval '3 months'` を日次クエリ → notifications.handoff_pending 風の `lost_followup_due` 通知。
- Phase: P2。

### P1-M-13. attendees の CRUD UI 不在 (meeting_attendees は読み取り専用)
- 設計 SC-11 (RelatedContacts) + meeting_attendees スキーマ + `speaker_label` ラベル付け (06 行 28)
- 実装: 詳細ページに `RelatedContacts` 表示はあるが、attendee 追加 / 削除 / role 変更 / speaker_label 修正の UI なし。API も `POST /api/meetings/[id]/attendees` 系列なし。
- Phase: P1 (speaker_label がここで決まらないと録画 RLS の per-attendee sensitivity が機能しない)。

### P1-M-14. `meeting_consent_captures` 連携 (per-attendee consent) 不在
- 設計 03_data_model 行 700-703 + 行 889-899 `per_attendee_consent`; 14_state_machines F-S4-3, F-S4-5; AP-86, AP-106 (P2 consent API)
- 実装: 該当 schema / migration / API 全て不在。Phase 2 必須。

### P1-M-15. リスケ (AP-18 / AP-66) 不在
- 設計 04_api_endpoints API-18 `POST /api/meetings/[id]/reschedule` (P2), AP-66 (P2 reschedule 起動)
- 実装: route 不在。`meetings.scheduled_at` を PATCH で書き換えるだけは可能 (`/api/meetings/[id]` 経由) だが、Calendar / Zoom / 顧客への再提案メール / scheduling_proposals 更新ロジック無し。
- Phase: P2。

### P1-M-16. `meeting_briefs` (SC-42 / AP-67 / 05 q_meeting_brief) 不在
- 設計 03_data_model 行 578-581 `meeting_briefs(meeting_id, generated_at, version, content)`, 14_state_machines F-S4-4 (degraded / full / full_failed), 05_jobs_queues q_meeting_brief_degraded / full
- 実装: 該当全て無し。
- Phase: P2 (現場 UX 補完で高優先)。

### P1-M-17. SC-12 `/meetings/[id]/live-notes` (リアルタイムメモ) 不在
- 設計 SC-12: `TimestampedNotePad`, `AutoSaveIndicator`, `meeting_notes` テーブル (03 行 133-140), API-17 `POST /api/meetings/[id]/notes`
- 実装: `meeting_notes` schema 自体不在 (Glob 0 件)。`ManualNotes` (meetings/[id]/_components) は `meetings.manual_notes` に書く別物。
- Phase: P2 だが商談中 UX のため P1 でも価値高。

### P1-M-18. handoff_pending notification の RLS / type CHECK 確認漏れ
- 設計 03 行 339: `notifications.type` `'recording_ready','reply_received','handoff_pending',...`
- 実装: `/api/meetings/[id]/handoff` route.ts:95 で `type: 'handoff_pending'` を INSERT、`packages/db/src/schema/notifications.ts` で CHECK にこの値が含まれていない場合は 23514 で失敗。`0018_notifications_type_check.sql` で許可されているか要検証 (本レビューでは未開封)。
- 修正案: 0018 migration の enum リストを確認し、`handoff_pending` を必ず含める。実装テストも `apps/worker/src/__tests__/` に追加。

---

## P2 — P2 範囲で必須

### P2-M-19. 加重パイプライン UI はあるが forecast monte carlo 不在
- 実装: `apps/web/src/app/meetings/_lib/forecast.ts` は `weightedPipeline` / `forecastCloseDate` (月別 sum) のみ。
- 設計 (商談機能ゴール): 確率分布を持つ forecast (monte carlo シミュ) で「下振れ / 上振れ」を見せる前提が SC-25 / SC-49 (`/dashboard/manager/diagnostics`) で議論される。
- ギャップ: 分散 / 信頼区間 (NF3-S8-1 で信頼区間<0.4 は退避タブへの要件あり) が無い。stage 別 win_probability 既定値も固定テーブル (`STAGE_DEFAULT_PROB`) で行動データから学習しない。
- 修正案: stage_transition 滞留時間と historical close-rate から win_probability を Empirical Bayes で更新する `apps/worker/src/jobs/forecast-recalc.ts`。

### P2-M-20. 担当者別 KPI (勝率 / サイクル / ATV) 不在
- 設計 (商談機能の付随KPI): `meeting_stage_transitions` の滞留時間 × deal_status から、担当者別の (1) 勝率 (2) 平均サイクルタイム (3) 平均取引金額 (ATV) を出すと明示。SC-25 (manager) の TeamScoreboard が依存。
- 実装: `_lib/forecast.ts` は **全体** 集計のみで担当者次元なし。`/api/dashboard` ルート未配備。
- 修正案: `forecast.ts` に `summarizeByOwner(meetings)` を追加 + 滞留時間計算用の `meeting_stage_transitions` join を server で。

### P2-M-21. 滞留時間 (stage stuck days) は計算関数はあるが UI 表示無し
- 実装: `forecast.ts:166 stageStuckDays()` 関数だけ存在。詳細ページ / kanban カードで使われていない (Grep 0 件)。
- 設計 23_observability_alerts: 滞留が長い deal は alert 化。
- 修正案: `MeetingCard` に「N日滞留」バッジ + 一定閾値超で警告色。

### P2-M-22. `q_handoff_sla_check` (48/72h SLA 違反検出 + escalate) 不在
- 設計 05_jobs_queues q_handoff_sla_check (P2 継続), AP-134 `/api/admin/handoffs/sla-breaches`, AP-135 escalate
- 実装: 全部不在 (handoffs テーブルそのものが無いため当然)。AT-S9-SLA acceptance も未通過。

### P2-M-23. `meeting_duplicates` (重複アプローチ警告) 不在
- 設計 03_data_model 行 554-558 `meeting_duplicates(existing_meeting_id, ...)`, AT-S2-7 重複アプローチ警告 E2E
- 実装: schema 無し、判定 logic 無し。

### P2-M-24. `internal_attendee_invites` (社内同席依頼) 不在
- 設計 03 行 535-538, SC-37 `/inbox/internal-invites`, AP-57/58/59
- 実装: schema / API / SC 全て不在。

### P2-M-25. `complaint_meeting_links` / SC-54 `/complaints` 不在
- 設計 03 行 628-632, SC-54, AP-73 `/api/complaints`
- 実装: 不在。

### P2-M-26. external summary SC-44 `/meetings/[id]/external-summary` 不在
- 設計 SC-44, AP-71, q_external_summary
- 実装: 不在。

### P2-M-27. `q_post_meeting_checklist` 不在
- 設計 05 q_post_meeting_checklist (商談後タスク自動生成 F-S5-5)
- 実装: worker job 不在。

### P2-M-28. share-safe-clip (AP-107) → meeting への参照欠落
- meeting recording から clip 生成して exclude_internal 共有する流れ。実装側に `apps/web/src/app/api/recordings/[id]/clip/route.ts` 不在 (Glob で確認済み)。

### P2-M-29. zoom_password の取り扱い未整備
- schema: `zoom_password: text` 平文。0036 migration で暗号化されず。
- 設計 25_v2_review_resolutions Round1 sec: `Aes_gcm` 保存推奨。
- 修正案: vault / app-level encrypt。

### P2-M-30. `dealCloseDate` の自動セット欠落
- 実装: `deal_status` が won/lost に切り替わった瞬間に `deal_close_date` を自動で `now()::date` セットするロジックなし。`derive.ts:computeWinProbability` は確率は変えるが日付は触らない。
- 設計: forecast の月別集計 (`forecast.closeDate ?? scheduledAt`) が close_date 前提なため、won/lost 時に必ず close_date が入っていることを期待する仕様。
- 修正案: `/api/meetings/[id]` PATCH と `/api/meetings/[id]/stage` で `toDealStatus in ('won','lost')` の時に `deal_close_date` を自動 fill。

### P2-M-31. handoff API は `role: 'manager'` ガード — 営業本人の handoff 起動不可
- 該当: `/api/meetings/[id]/handoff/route.ts:60-62` は `role: 'manager'` 必須。
- 設計 14_state_machines `handoff draft → review (営業送信)` — 営業 (sales role) が draft 起動するのが正規。
- ギャップ: 営業から CS への移管を営業自身が始められない。
- 修正案: `role: ['sales','manager','admin']` または `owner_user_id === user.id` 許容。

### P2-M-32. handoff `content` jsonb の構造化未実装
- 設計 03 行 367 `handoffs.content = {customer_overview, decision_makers[], key_pain_points[], agreed_scope[], commitments[], risks[], next_steps[]}` 7 field
- 実装: フリーテキスト `draftNotes` を `manual_notes` に追記するだけ。

### P2-M-33. handoff 受領 (CS) API AP-40 不在
- 設計 AP-40 `POST /api/handoffs/[id]/accept`
- 実装: 不在。

### P2-M-34. handoff alignment report (AP-78) 不在
- 設計 AP-78 `POST /api/handoffs/[id]/alignment-report`
- 実装: 不在。

---

## P3 — 後回し可

### P3-M-35. `loss_analyses` テーブル (失注分析) 不在 (03 行 400)
### P3-M-36. `win_analyses` テーブル (勝因分析) 不在 (03 行 855)
### P3-M-37. SC-25 `/dashboard/manager` の Top5/Top3 注目案件 + KPI 急変 polite 通知不在
### P3-M-38. SC-52 `/dashboard/manager/losses` + AP-77 不在
### P3-M-39. SC-49 `/dashboard/manager/diagnostics` (受注率診断) + AP-76 不在
### P3-M-40. SC-50 トップ営業表現集 (`/team/top-phrases`) — 商談録画から抽出 が無い
### P3-M-41. `q_upsell_detect` (アップセル検出) 不在 (05 q_upsell_detect)
### P3-M-42. SC-86 a11y 要件 (TranscriptTimeline aria-label, focus order) 既に "ステージの軌跡" / kanban に部分実装あるが、SC-11 行 103 で要求された focus_order (Header→Player→Transcript→Insights) と一致しているか未検証

---

## 実装済みの主な機能 (確認のため列挙)

| 機能 | 実装ファイル | 状態 |
| --- | --- | --- |
| meetings CRUD | `apps/web/src/app/api/meetings/route.ts` `[id]/route.ts` | ok |
| stage transition + audit | `[id]/stage/route.ts` + `meeting_stage_transitions` table (0036) | ok (P0-M-01 で frontend 接続壊) |
| win_probability 自動導出 | `lib/meetings/derive.ts:computeWinProbability` | ok |
| stage 逆走 warning | `validateStageTransition` | ok |
| soft delete | `meetings.deleted_at` + RLS exclude_deleted | ok |
| handoff notification | `[id]/handoff/route.ts` | partial (P1-M-07 で永続化が manual_notes だけ) |
| 加重パイプライン KPI | `meetings/_lib/forecast.ts` | partial (P2-M-19/20/21) |
| kanban DnD UI | `meetings/_components/kanban-board.tsx` | UI のみ (P0-M-01) |
| stage history UI | `[id]/_components/stage-history.tsx` | UI のみ (P0-M-04 で常に空) |
| manual_notes auto-save | `[id]/_components/manual-notes.tsx` | ok |
| inline title/amount/closeDate 編集 | `header-edit-fields-client.tsx` | ok |
| sample fixture fallback | `meetings/page.tsx`/`[id]/page.tsx` | ok (P0-M-05 で常に fixture mode 化のリスク) |

---

## 推奨修正順序

1. **P0-M-01** (kanban / stage select の HTTP メソッド不一致) — 1 行 fix で UI が生き返る。最優先。
2. **P0-M-04** (`changed_at` → `created_at` の SELECT 修正) — StageHistory が空表示の原因。
3. **P0-M-05** (詳細ページの contacts カラム名不整合) — live mode 時にも詳細が落ちる。
4. **P0-M-03** (API GET の stage enum) — 将来の API client 障害予防。
5. **P0-M-02** (`/meetings/new` 仮実装) — 商談を UI から作れない不便を解消。
6. **P1-M-18** (notifications.type CHECK) — handoff route が落ちている可能性の検証。
7. **P1-M-13 / P1-M-17** (attendees CRUD / live-notes) — meeting 中の UX を埋める。
8. **P1-M-10** (録画完了 → manual_notes 自動草稿) — 商品の旗艦機能。
9. **P1-M-06/07** (contracts / handoffs テーブル + 一連の P2 API) — 商談スコープの後半全部に依存。
10. **P1-M-08/09** (Google Calendar / Gmail 連携) — schema (`email_threads` 等) が無く、P2 を本格化するなら最初に着手。

---

## 参考 — 設計書側の主な根拠行

- 02_screens: SC-09/10/11/12/23/24/42/43/44/53/54
- 03_data_model: 100-122 (meetings), 123-132 (attendees), 133-140 (notes), 175-203 (email), 214-222 (scheduling_proposals), 223-235 (contracts), 236-246 (handoffs), 554-558 (duplicates), 578-581 (briefs), 700-703 (consent), 855-857 (win_analyses)
- 04_api_endpoints: API-13/14/15/16/17/18/37/38/39/40, AP-57/60/62/64/66/67/71/78/79/106/107/134/135/136/137
- 05_jobs_queues: q_recording_stage3_full, q_meeting_brief_*, q_handoff_sla_check, q_post_meeting_checklist, q_renewal_3m_alert
- 06_external_integrations: Google Calendar (freebusy/events), Gmail (send/readonly/modify + users.watch + Pub/Sub)
- 13_risks_decisions: RD-57 契約更新失念
- 14_state_machines: meeting/handoff/calendar_hold/consent_capture/scheduling_proposal の各 lifecycle
- 23_observability_alerts: 契約更新 3ヶ月前 alert, handoff SLA, derived staleness
- 24_acceptance_test_matrix: AT-S2-7, AT-S8-2, AT-S9-SLA, AT-S5-Stale, AT-S5-ETA
