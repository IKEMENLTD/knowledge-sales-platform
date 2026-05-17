# 名刺機能 設計書 vs 実装 ギャップ分析

担当範囲: T-007 (web 取込) / T-008 (mobile 撮影) / T-009 (OCR worker) / T-010 (review/merge)
SC: SC-06, SC-07, SC-08, SC-33, SC-34, SC-35, SC-62, SC-82, SC-126
LLM: PROMPT-02, LP-10, LP-11
関連シート: 02_screens, 03_data_model, 04_api_endpoints, 05_jobs_queues, 07_llm_prompts, 14_state_machines, 17_offline_mobile, 24_acceptance_test_matrix

## サマリ

| カテゴリ | 設計書記載 | 実装済 (full) | 実装済 (partial) | 未実装 |
|---|---|---|---|---|
| 画面 (SC) | 9 件 | 3 (SC-06, SC-08, /contacts list) | 0 | 6 (SC-07/33/34/35, SC-62, SC-82, SC-126) |
| API | 18 件 | 5 | 1 (API-04 は upload-url 分割で代替) | 12 |
| Data model (table) | 8 件 | 6 (contacts, contact_duplicates, business_card_images, contact_memos, offline_queue, non_card_attachments) | 0 | 2 (events, contact_event_tags) |
| pgmq queue | 6 件 (名刺関連) | 1 (process_business_card) | 0 | 5 (q_offline_sync, q_event_tag_propagate, q_quick_search_cache, q_legacy_import, q_legacy_import_dlq) |
| LLM Prompt | 3 件 | 0 | 0 | 3 (PROMPT-02, LP-10, LP-11) |
| State machine 遷移 | 5 件 (contact lifecycle + review_status + offline_queue) | 2 (review_status 一部, lifecycle 列のみ) | 1 (offline_queue 列はあり、遷移配線なし) | 2 (lifecycle 遷移 hook, audit_logs 遷移 log) |
| Acceptance Test | 17 件 | 0 (E2E 実行可能 0 件) | 8 (実装側で素地のみ) | 9 |
| **合計** | **66** | **17** | **2** | **47** |

- **実装率: 約 26%** (full のみ。partial も full に積めば 29%)
- 既に出来ているのは **PC web の単票取込パイプライン (D&D → SHA-256 → EXIF 剥離 → upload-url → register → OCR worker → review)** のみで、**モバイル / オフライン / イベントタグ / 一括取込 / 重複バッジ系は全滅**。

## P0 未実装 (本番ブロック / Phase1 リリース必須)

| ID | 設計書ソース | 項目 | 状態 | 実装場所推奨 | 見積 |
|---|---|---|---|---|---|
| P0-CT-01 | 04_api L11 (API-05) | `GET /api/contacts` 一覧 (q / owner / status / page) | 未実装 (SC-04 は demo fixture を直叩き) | `apps/web/src/app/api/contacts/route.ts` に GET 追加 | 4h |
| P0-CT-02 | 04_api L12 (API-06) | `GET /api/contacts/[id]` 詳細 | 未実装 (review page は server-component で直接 supabase) | `apps/web/src/app/api/contacts/[id]/route.ts` に GET 追加 | 3h |
| P0-CT-03 | 02_screens SC-04 / 03_data_model contacts | `/contacts` 一覧画面 (実データ + 検索 + status filter) | partial — UI は `DEMO_CONTACTS` fixture のみ参照 | `apps/web/src/app/contacts/page.tsx` を GET /api/contacts に差し替え | 6h |
| P0-CT-04 | 02_screens SC-05 | `/contacts/[id]` 詳細 view (review と別)。商談履歴 / メール履歴タブ | 未実装 (review 画面しかない) | `apps/web/src/app/contacts/[id]/page.tsx` 新設 | 8h |
| P0-CT-05 | 03_data_model L438-450 | `business_card_images` テーブルへの INSERT 配線 (front/back, 画像本体の永続化) | 未実装 — table は 0007 で作成済だが INSERT 経路がない | `apps/web/src/app/api/contacts/route.ts` register 内で INSERT、worker `ocr.ts` で classification/light_quality を書き戻し | 5h |
| P0-CT-06 | 14_state_machines L62-64 | `pending_ocr → pending_review → duplicate_suspect → verified → merged` の `audit_logs` INSERT hook | partial — worker 完了時のみ appendAudit。merge / kept_separate / verified 遷移は無 log | `apps/web/src/app/api/contacts/[id]/merge/route.ts` と PATCH route 内に audit 記録追加 | 4h |
| P0-CT-07 | 07_llm_prompts PROMPT-02 / LP-10 | OCR 後処理 (姓名分離 / フリガナ推定 / 敬称除去 / 漢字社名補正) | 未実装 — worker は heuristicExtract のみで Claude post-process が無い | `apps/worker/src/lib/ocr/postprocess.ts` 新設 + claude SDK 接続 | 8h |
| P0-CT-08 | 24_AT AT-S1-1 | 暗所撮影 OCR 成功率 >=90% — 暗所/反射判定 (`light_quality`) を OcrResult に含めない | 未実装 — OcrResult schema に light_quality / blur 評価が無い | `packages/shared/contacts.ts` ocrResultSchema 拡張 + GoogleVision provider で `pages[].confidence` 補強 | 4h |
| P0-CT-09 | 17_offline L7-9 + AT-S1-1 (Shake) | `fallback_capture_mode` (volume_button / long_press / voice_command / 3s→1s 静止緩和) | 未実装 (SC-33 は placeholder) | `apps/web/src/app/mobile/scan/page.tsx` を実装 | 24h |
| P0-CT-10 | 03_data_model L1008 | `users.handedness` 設定の参照 / CSS ミラーリング (F-S1-1) | partial — 0024 migration で列追加済だが UI が読まない | mobile/scan ページ内で `useUserHandedness()` hook → tailwind logical 切替 | 4h |
| P0-CT-11 | 24_AT AT-S14-Wipe / 17_offline L27 | `is_active=false` 時の IndexedDB wipe (session-bound key TTL + logout) | 未実装 — IndexedDB 自体未使用 | `apps/web/src/lib/offline/indexeddb.ts` 新設 + SW boot 時 wipe | 12h |
| P0-CT-12 | 04_api AP-131 + SC-82 | `GET /api/contacts/unreviewed-count` 未レビュー件数バッジ (F-S1-2) | 未実装 | `apps/web/src/app/api/contacts/unreviewed-count/route.ts` 新設 | 2h |
| P0-CT-13 | 24_AT AT-RLS-1/2/3 + 0034 RLS | `contacts_select_exclude_deleted` 以外の RLS pgTAP 検証 (org_id 分離 / sensitivity tier) | partial — 単発手動 SQL のみ。pgTAP 自動テスト無 | `packages/db/src/migrations/manual/test_*` に pgTAP 追加 | 8h |
| P0-CT-14 | 05_jobs_queues L75 (q_offline_sync) | オフラインキュー再送 worker | 未実装 — table はあるが consumer なし | `apps/worker/src/jobs/offline-sync.ts` 新設 | 8h |
| P0-CT-15 | 02_screens SC-34 + AP-53/54 | `/mobile/queue` 画面 + offline-queue API | 未実装 (placeholder) | `apps/web/src/app/mobile/queue/page.tsx` + `/api/offline-queue` route 群 | 12h |

P0 合計見積: **約 112 時間 (約 3 人週)**

## P1 未実装 (1〜2 週間以内)

| ID | 設計書ソース | 項目 | 状態 | 実装場所推奨 | 見積 |
|---|---|---|---|---|---|
| P1-CT-01 | 04_api API-04 / AP-50 | `POST /api/ocr/business-card` (multipart, side=front\|back, event_id, voice_memo) | 未実装 — 設計書では multipart 単発 endpoint。実装は upload-url + register に分割済 | 互換 wrapper を `apps/web/src/app/api/ocr/business-card/route.ts` に追加 (旧 SC-06 / mobile から呼ばれる) | 6h |
| P1-CT-02 | 04_api API-08 | `POST /api/contacts/duplicates/resolve` | partial — `POST /api/contacts/[id]/merge` で代替実装。設計書 path と乖離 | 同等の resolve エンドポイント追加 or 設計書 update | 2h |
| P1-CT-03 | 04_api AP-51 + LP-11 | `POST /api/ocr/qr` (裏面 QR vCard 読取) | 未実装 | `apps/web/src/app/api/ocr/qr/route.ts` + worker side で zxing-js | 8h |
| P1-CT-04 | 04_api AP-52 | `POST /api/contact-memos` 音声/手書きメモ添付 | 未実装 — table はあるが API なし | `apps/web/src/app/api/contact-memos/route.ts` | 6h |
| P1-CT-05 | 04_api AP-55 | `GET /api/contacts/quick-search` (オフライン優先) | 未実装 | `apps/web/src/app/api/contacts/quick-search/route.ts` + SC-35 実装 | 12h |
| P1-CT-06 | 03_data_model L460-468 | `events` テーブル + `/api/events` (AP-56) | 未実装 — migration 自体なし | `packages/db/src/migrations/manual/0040_events.sql` + route | 6h |
| P1-CT-07 | 03_data_model L469-473 | `contact_event_tags` テーブル + イベントタグ一括付与 | 未実装 — migration なし | 0040 と合わせて | 4h |
| P1-CT-08 | 05_jobs L76 | `q_event_tag_propagate` worker | 未実装 | `apps/worker/src/jobs/event-tag-propagate.ts` | 6h |
| P1-CT-09 | 07_llm_prompts LP-11 | 名刺以外の判別 (pamphlet/memo/qr_only/other) | 未実装 — `classification` 列は schema にあるが書き手なし | OCR worker 内に分類 step 追加 (gemini-flash or claude-haiku) | 6h |
| P1-CT-10 | 17_offline L7-9 / 24_AT AT-S1-2 | 両面名刺 (front + back) を 1 contact に紐付け | 未実装 — register API は side 受けない | `contactRegisterRequestSchema` に side 追加 + business_card_images INSERT | 4h |
| P1-CT-11 | 17_offline L33 / 24_AT AT-S1-3 | バーストレビュー (100枚連続 + 共通項目一括適用 + チャンク非同期 OCR) | 未実装 (SC-06 の UploadController は単票連続のみ) | `import/_components/upload-controller.tsx` を BurstMode 拡張 | 16h |
| P1-CT-12 | 03_data_model L1030 / SC-62 | `dedupe_keys = ['email','phone','company_name+contact_name']` の優先順位設定 | partial — code 内 `MATCH_WEIGHTS` で固定。設定 table がない | `org_settings.dedupe_keys` 列追加 + UI | 6h |
| P1-CT-13 | 14_state_machines L57-60 | `contact lifecycle` (lead → qualified → customer → churned → at_risk) の遷移実装 | 未実装 — `status` enum にこれらが入っていない | `contactSalesStatusValues` に追加 + meeting confirm 時の trigger | 8h |
| P1-CT-14 | 24_AT AT-S1-Defer | `status='deferred_review'` 低信頼度時に次撮影へ進める | 未実装 — register response に deferred_review が無い | `contactRegisterResponseSchema.status` に enum 追加 + UI で skip 動線 | 4h |
| P1-CT-15 | 03_data_model L446-449 | `business_card_images.captured_lat / lng / light_quality` 書き込み (撮影位置) | 未実装 — clientResize で EXIF 剥離してしまうため意図的削除が先。GPS 任意保存ルールが未配線 | mobile/scan で Geolocation API 取得 → register 経由で別列に渡す | 6h |
| P1-CT-16 | 04_api AP-86 + 18_search_quality | `POST /api/contacts/[id]/reocr` 再 OCR (low_conf 時のユーザ起点リトライ) | 未実装 — pgmq.send の手段が UI に無い | `apps/web/src/app/api/contacts/[id]/reocr/route.ts` 新設 (process_business_card 再投入) | 3h |
| P1-CT-17 | 02_screens SC-62 / AP-90 | `/contacts/import/legacy` (CSV/Sansan/Eight) + `POST /api/contacts/import/legacy` | 未実装 | `apps/web/src/app/contacts/import/legacy/page.tsx` + route + worker | 24h |
| P1-CT-18 | 02_screens SC-126 + 04_api AP-150/142 | `/admin/import-dlq` DLQ 可視化 + 手動再実行 | 未実装 (Round v2.5 P3 だが Phase1 でも DLQ 観測は欲しい) | `apps/web/src/app/admin/import-dlq/page.tsx` | 12h |
| P1-CT-19 | 24_AT AT-Idem-1/2 | OCR 二重起動防止 (jobs_inflight + idempotency) E2E 検証 | partial — `acquireInflight` 実装はあるが test なし | `apps/worker/__tests__/ocr.idempotent.test.ts` | 4h |
| P1-CT-20 | 24_AT AT-LLM-Schema-1/2 | OCR JSON 出力崩壊耐性 (tool_use + zod + 1回再生成 + cost cap) | partial — zod parse はあるが retry / cost cap は最小限 | post-process 実装と同時 | 4h |
| P1-CT-21 | 24_AT AT-OCC-1 | 楽観ロック (2 デバイス UPDATE で 409) | 未実装 — contacts に version 列なし (recordings 系は 0023 で導入済) | `0040_contacts_version.sql` で version 列追加 + PATCH route で OCC | 6h |
| P1-CT-22 | 03_data_model L92-99 + 24_AT | `contact_duplicates` の audit / undo (merge_undo_window_hours=72) | partial — merge 実装はあるが undo 経路なし | `apps/web/src/app/api/contacts/[id]/merge/undo/route.ts` | 6h |

P1 合計見積: **約 160 時間 (約 4 人週)**

## P2 / 後回し (バックログ)

| ID | 設計書ソース | 項目 | 見積 |
|---|---|---|---|
| P2-CT-01 | 02_screens SC-82 | 未レビュー件数バッジ + batch_review_mode deeplink (F-S1-2) | 4h |
| P2-CT-02 | 04_api AP-147 | `GET /api/contacts/from-cc-prompt` 未登録 CC を contact 化する prompt fields (NF-S3-1) | 6h |
| P2-CT-03 | 04_api AP-138 | `POST /api/onboarding/sample-mode` 新人パス『見るだけ』モード (F-S12-3) | 4h |
| P2-CT-04 | 05_jobs_queues L87 | `q_quick_search_cache` (顧客変更時に CS Top 発言キャッシュ) — 名刺取込連動部分のみ | 6h |
| P2-CT-05 | 17_offline L34 | Pin for offline (G-14) — ユーザー指定キャッシュ | 8h |
| P2-CT-06 | 17_offline L29 | 音声中断ハンドリング (G-4) — 名刺メモ録音中の電話/BG 切替 | 8h |
| P2-CT-07 | 17_offline L30 | RNNoise / WebAudio noise suppression (G-9) | 6h |
| P2-CT-08 | 14_state_machines L86-89 (v2.4) | `pre_consent_buffer` (名刺取込時の verbal 同意 buffer) — 録画機能側だが名刺音声メモにも波及 | 4h |
| P2-CT-09 | 03_data_model L1035 | `identity_verification_method` enum (削除依頼用) | 2h |
| P2-CT-10 | 11_tech_stack | ServiceWorker + manifest.json + PWA install (SC-75 改修) — iOS Safari 向け | 8h |

P2 合計見積: **約 56 時間**

## State Machine 未実装

設計書 14_state_machines + Phase2 で要求されている遷移のうち、現実装に **配線がない / audit_logs INSERT が落ちている** もの。

- **`pending_ocr → pending_review`**: ✅ worker `markPendingReview()` で実装済 / ✅ appendAudit あり
- **`pending_ocr → duplicate_suspect`**: ✅ worker `processOcrJob` 内で実装 / ✅ appendAudit あり (`op: 'ocr_completed'`)
- **`duplicate_suspect → verified` (kept_separate)**: ⚠️ merge route で update のみ。**audit_logs INSERT 欠落**
- **`duplicate_suspect → merged` (slave 側)**: ⚠️ merge route で deleted_at + review_status='merged'。**audit_logs INSERT 欠落** + `q_embedding_cleanup` (M-3) 投入なし
- **`pending_review → verified` (manual)**: ⚠️ PATCH route で reviewStatus を受けるが、`verified` 遷移時の hook (audit / 通知) なし
- **`offline_queue: queued → syncing → done / failed`**: ❌ table はあるが worker (consumer) も client (producer) もまだ。state そのものが死んでいる
- **`contact lifecycle: lead → qualified → customer → churned → at_risk`** (Round1 L-2): ❌ enum に値が足りない。meeting.status='completed' 時の trigger なし
- **`audit_log chain` (C-5)**: ❌ contact 関連の audit_logs が hash chain に乗っていない (0029 / 0027 でも contacts 側は対象外)
- **`jobs_inflight: acquired → released` (T-3)**: ✅ acquireInflight / releaseInflight で実装済。expires_at 超えの自動解除 (`q_jobs_inflight_release`) は ❌ 未実装

修正コスト合計: **約 16h** (`audit_logs` INSERT 配線 6h + lifecycle enum + trigger 8h + jobs_inflight 期限解除 2h)

## Acceptance Test 未充足

| ID | 試験項目 | 状態 | 必要作業 |
|---|---|---|---|
| AT-S1-1 | 暗所撮影 OCR>=90% or 確認 UI 到達 | ❌ | 暗所 fixture + Playwright 環境構築 |
| AT-S1-2 | 両面名刺 → 1 contact | ❌ | side=back の API/UI 両方 |
| AT-S1-3 | 非名刺 → non_card_attachments | ❌ | classification worker step |
| AT-S1-4 | オフライン取り込み (SW + IndexedDB) | ❌ | mobile/scan 実装が先 |
| AT-S1-5 | 音声メモ → Whisper → memo 保存 | ❌ | AP-52 contact-memos + Whisper 連携 |
| AT-S1-6 | イベントタグ全件付与 | ❌ | events / contact_event_tags 全部 |
| AT-S1-Shake (v2.3) | 揺れ撮影 fallback_capture | ❌ | mobile/scan |
| AT-S1-Defer (v2.3) | 低信頼度 deferred_review | ❌ | response schema 拡張 |
| AT-S1-EventLate (v2.3) | 取込中イベント切替 一括付与 | ❌ | BulkActions + events |
| AT-RLS-1/2/3 | contacts org_id / sensitivity / embeddings RPC RLS | ⚠️ partial — 単発 SQL 検証のみ | pgTAP 化 |
| AT-DLQ-1 | OCR 失敗 → DLQ → 手動 resume | ⚠️ partial — pgmq archive はあるが UI なし | SC-126 実装 |
| AT-Idem-1/2 | 二重 send / webhook 二重 → 1 record | ⚠️ partial — code はあるが unit test 欠落 | __tests__ 追加 |
| AT-OCC-1 | 2 デバイス UPDATE 楽観ロック 409 | ❌ | contacts に version 列 |
| AT-Compl-2 | 削除依頼下流伝播 (R2/Anthropic/OpenAI/PITR) | ❌ | 名刺画像/raw_ocr の伝播削除 |
| AT-Voice-1 (G-4) | 録音中断 → 部分保存 → 再開 | ❌ | mobile voice memo flow |
| AT-SW-1 | SW 更新整合 (skipWaiting + 旧キャッシュ) | ❌ | SW 自体未実装 |
| AT-S14-Wipe | `is_active=false` で IndexedDB wipe | ❌ | IndexedDB / SW 自体未実装 |

E2E 通せる名刺 AT: **0 / 17**。

## Round 4 実装から発見された設計書未記載要素 (追加すべき項目)

実装側 (Phase2B R4) で対応済だが設計書に記載のない / 矛盾している項目。

1. **`contacts.business_card_image_hash`** (SHA-256 hex) — 画像重複検知用列。0034 で追加し、upload-url と register の両段で `duplicateOf` 判定に利用。**設計書 03_data_model の contacts カラム表に未記載**。
2. **`contacts.normalized_email` / `normalized_phone`** — 重複検知決定性確保のためのキャッシュ列。worker 側で書き込み。**設計書には normalize_* 概念はあるが contacts への列追加が未記載**。
3. **`contacts.created_by_user_id`** — 「誰が取り込んだか」 (owner_user_id とは別概念)。**設計書未記載**。
4. **`contacts.deleted_at` (soft delete)** — RLS で `deleted_at is null` を強制。**設計書未記載** (sales_funnel `status='archived'` で代替する設計だった)。
5. **`contacts.captured_at` (撮影時刻)** — created_at と分離。**設計書未記載**。
6. **Storage path 規約 `{user_id}/{uuid}.{ext}`** — 設計書 0035 では `{org_id}/{contact_id}/{yyyy-mm-dd}/{uuid}.{ext}` を想定していたが、実装は user_id 先頭 (0038/0039 で RLS 再設計)。**設計書を実装に合わせて改訂すべき**。
7. **`contacts/upload-url` と `contacts/[register]` の 2 段分割** — 設計書 API-04 / AP-50 は multipart 単発 endpoint だが、SHA-256 重複検知 + EXIF 剥離をクライアント側で完結させるため 2 段化。**設計書改訂 or 互換 wrapper のどちらか必須**。
8. **クライアント側 EXIF 剥離 + リサイズ** (`upload-pipeline.ts`) — GPS / Maker note を「サーバに送る前」に剥がすプライバシー設計。**設計書 17_offline では「位置メタデータ削除」言及があるが client side で行う規約は未記載**。
9. **`UploadPipelineError.endpointUnavailable` sentinel** — 404 / network error を赤エラーではなく「準備中」表示に振り分ける UX 規約。**設計書未記載**。
10. **`OcrImageTooLargeError` (20MB / 25MB hard reject)** — Vision REST API 制限の二段ガード。**設計書 (17_offline 上限) では撮影側のみ言及、worker 側の reject 規約は未記載**。
11. **`MockOcrProvider` (dev/CI fallback)** — 鍵がなくても起動可能にする factory 規約。**設計書未記載 だが運用上必須なので明文化推奨**。
12. **`heuristicExtract` の優先順位ルール** (email > phone > company > title > name > address) — Vision REST の paragraph 単位出力を field に振る規則。**設計書 07_llm_prompts PROMPT-02 が「Claude で構造化」前提のため、Vision-only 経路の heuristic ルールは未記載**。
13. **`DEFAULT_ORG_ID` 単一定義** (`packages/shared`) — drift 防止のため worker 側 hardcode を撤廃。**設計書 03_data_model L846 「org_id 追加」記述だけでは run-time fallback の必要性が表現されていない**。
14. **`current_org_id() is null` 経路** (0026 / 0032 / 0033 で Phase1 fallback 構築) — GUC 未 SET 環境での fail-closed 設計が必要。**設計書 08_security_rls 改訂要**。
15. **review_status と sales status の独立 2 軸** (`review_status` enum を `status` とは別に新設) — 設計書 03_data_model 当初は sales status 1 軸のみ。実装で `pending_ocr / pending_review / duplicate_suspect / verified / merged` を独立 enum 化。**0034 で実装済だが設計書 反映漏れ**。
16. **`business-cards` Storage bucket RLS** が path 先頭 = `auth.uid()` 規約 (0038/0039) — **設計書では org_id プレフィックスだが、実装は user_id プレフィックス**。Phase2 multi-tenant cutover 時の再設計が必要。

これら 16 項目は **設計書 v2.6 (Phase2B Round4 反映版) として明文化** すべき。

## 参考: 実装場所マップ

### 実装済 (full)

- `packages/db/src/schema/contacts.ts` — contacts / contact_duplicates schema
- `packages/db/src/migrations/manual/0034_contacts_phase2.sql` — review_status / image_hash / captured_at / created_by_user_id / deleted_at / normalized_* 追加
- `packages/db/src/migrations/manual/0035_storage_business_cards.sql` — Storage bucket + RLS
- `packages/db/src/migrations/manual/0038_round2_storage_fix.sql` + `0039_round3_storage_select_strict.sql` — RLS 修正
- `packages/db/src/migrations/manual/0007_p1_extended_tables.sql` — business_card_images / contact_memos / offline_queue / non_card_attachments テーブル本体 (API は無)
- `packages/shared/src/contacts.ts` — 全 zod schema (upload/register/update/duplicate/merge/ocr)
- `packages/shared/src/contacts-normalize.ts` — normalize + dedupe scoring (canonical)
- `apps/web/src/app/api/contacts/upload-url/route.ts` — signed URL 発行 + dup hash check
- `apps/web/src/app/api/contacts/route.ts` — POST 登録 + pgmq enqueue
- `apps/web/src/app/api/contacts/[id]/route.ts` — PATCH (owner / role / company upsert)
- `apps/web/src/app/api/contacts/[id]/duplicates/route.ts` — GET 重複候補
- `apps/web/src/app/api/contacts/[id]/merge/route.ts` — POST merge / kept_separate
- `apps/web/src/app/contacts/page.tsx` — 一覧 (demo fixture)
- `apps/web/src/app/contacts/import/page.tsx` + `_components/*` + `_lib/upload-pipeline.ts` — D&D 取込フロー
- `apps/web/src/app/contacts/[id]/review/page.tsx` + `_components/*` — レビュー画面
- `apps/worker/src/jobs/ocr.ts` — OCR pgmq consumer (acquireInflight + dedupe + audit)
- `apps/worker/src/lib/ocr/providers.ts` — Mock / GoogleVision (本実装) / Claude (stub)
- `apps/worker/src/lib/dedupe.ts` + `normalize.ts` — shared re-export

### 未実装 (placeholder のみ)

- `apps/web/src/app/mobile/scan/page.tsx` — SC-33 placeholder
- `apps/web/src/app/mobile/queue/page.tsx` — SC-34 placeholder
- `apps/web/src/app/mobile/quick-lookup/page.tsx` — SC-35 placeholder

### 完全に存在しない

- `apps/web/src/app/api/ocr/business-card/` (API-04 / AP-50)
- `apps/web/src/app/api/ocr/qr/` (AP-51)
- `apps/web/src/app/api/contact-memos/` (AP-52)
- `apps/web/src/app/api/offline-queue/` (AP-53/54)
- `apps/web/src/app/api/contacts/quick-search/` (AP-55)
- `apps/web/src/app/api/contacts/import/legacy/` (AP-90)
- `apps/web/src/app/api/contacts/unreviewed-count/` (AP-131)
- `apps/web/src/app/api/contacts/from-cc-prompt/` (AP-147)
- `apps/web/src/app/api/events/` (AP-56)
- `apps/web/src/app/admin/import-dlq/` (SC-126)
- `apps/worker/src/jobs/offline-sync.ts` (q_offline_sync)
- `apps/worker/src/jobs/event-tag-propagate.ts` (q_event_tag_propagate)
- `apps/worker/src/lib/ocr/postprocess.ts` (PROMPT-02 / LP-10 / LP-11)
- `packages/db/src/migrations/manual/0040_events.sql` (events / contact_event_tags)

---

**結論**: 実装率 26%、P0 15 件 (112h) + P1 22 件 (160h) で **約 7 人週 (1.5 人月)** が Phase1 リリースまでに必要。最優先は **(a) /contacts 一覧の実データ化 / (b) `business_card_images` INSERT 配線 / (c) audit_logs 配線 / (d) mobile/scan 実装 / (e) PROMPT-02 OCR 後処理** の 5 本柱。
