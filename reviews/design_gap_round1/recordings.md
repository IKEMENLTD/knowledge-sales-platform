# 録画機能 設計書 vs 実装 ギャップ分析

担当範囲 = T-011 (Zoom webhook) / T-012 (DL+transcribe+summarize) / T-013 (embedding) /
SC-15 一覧 / SC-16 詳細 / SC-46 クリップ共有 / SC-63 録画移行 / PROMPT-01 (要約抽出)。

調査対象コード:
- `apps/web/src/app/recordings/page.tsx` + `_lib/load-recordings.ts` + `_components/*`
- `apps/web/src/app/recordings/[id]/page.tsx` + `_components/*`
- `apps/worker/src/routes/webhooks.ts` (POST /webhooks/zoom)
- `apps/worker/src/jobs/recording-{download,transcribe,summarize}.ts`
- `apps/worker/src/lib/{zoom.ts, zoom-webhook.ts, transcribe/providers.ts, summarize/providers.ts}`
- `packages/db/src/schema/{recordings,recording-segments,recording-stages,share-links}.ts`
- `packages/db/src/migrations/manual/{0007, 0011, 0022, 0023, 0029}.sql`
- `packages/shared/src/recordings-detail.ts`

---

## サマリ

設計書 vs 実装 概観 (録画機能):

| カテゴリ | 設計書 項目数 | 実装済み | 実装率 |
| --- | --- | --- | --- |
| 画面 (SC-15/16/46/63) | 4 | 2 (SC-15/16) | 50% |
| API (AP-19〜23, 68〜70, 86, 91, 106, 148 等) | 12 | 1 (RPC `update_recording_insights` のみ。HTTP route はゼロ) | 8% |
| Job/Queue (process_recording, transcribe, summarize, generate_embeddings, q_consent_check, q_pii_redaction, q_pre_consent_buffer_purge ほか 15+) | 15 | 4 (process_recording / transcribe_recording / summarize_recording / generate_embeddings) | 27% |
| Table | 9 (recordings, recording_segments, recording_stages, recording_clips, share_links, share_links_audit_v2, meeting_consent_captures, per_attendee_consent, pre_consent_audio_buffers) | 4 (recordings / recording_segments / recording_stages / share_links) | 44% |
| State Machine (recording stage1/2/3, consent_capture per-attendee, pre_consent_buffer) | 3 | 1 (recording の processing_status 線形遷移のみ。stage1/2/3 並列管理は無し) | 33% |
| LLM PROMPT-01 / LP-17〜21, LP-31, LP-35〜37 | 8+ | 1 (PROMPT-01 を Claude provider が実装) | ~13% |

**実装率 (録画機能 加重平均)**: 約 **30%** (P1 部分のみで見ても 40% 程度)。

骨格 (webhook 受信 → mock blob → Whisper → Claude summary → embedding) が一本だけ通っているが、
法定保存 / 共有 / 同意 / 編集 API / クリップ / 再生成 / WORM / GDPR 削除 は **全く実装されていない**。
SC-46 (クリップ共有) と SC-63 (Zoom historical 移行) は **画面そのものが無い**。

P0 = 9 件 / P1 = 12 件 / P2 = 10 件 / P3 = 4 件 (後述)。

---

## P0 未実装 (本番ブロック)

設計書が P1 phase で要求しており、かつ本番運用で**法的 / セキュリティ / データロス**に直結するもの。

| ID | 設計書ソース | 項目 | 状態 | 実装場所 (想定) | 見積 |
| --- | --- | --- | --- | --- | --- |
| GAP-R-P0-01 | 04 AP-23 / SC-46 / 03 share_links / 16 C-1, M-C2 | **share_links 作成 API + 公開検証 RPC + SC-46 クリップ生成 UI** が無い。`share-link-dialog.tsx` は `onCreate` が常に `undefined` で呼ばれ、placeholder URL を表示するだけ。`POST /api/share-links`, `POST /api/recordings/[id]/clip` (AP-23/AP-68), `GET /api/share/[token]` (SC-31) いずれも未実装。`recording_clips` テーブル / pgmq.generate_clip ジョブも無し。 | 未実装 | `apps/web/src/app/api/share-links/route.ts` (POST), `apps/web/src/app/api/recordings/[id]/clip/route.ts`, `apps/web/src/app/share/[token]/page.tsx`, `packages/db/src/schema/recording-clips.ts`, `apps/worker/src/jobs/generate-clip.ts`, RPC `verify_share_link_token` (SECURITY DEFINER) | 5d |
| GAP-R-P0-02 | 03 per_attendee_consent / 04 AP-86, AP-106 / 14 consent_capture per-attendee / 16 C-1 / 24 AT-S11-1, AT-Compl-1 | **録画同意 (per-attendee) の取得・記録・違反停止が一切実装されていない**。`consent_logs` (0029) はオンボード時の terms_of_service/privacy_policy のみで、商談ごとの recording_consent / per-attendee は不可。`meeting_consent_captures`, `per_attendee_consent`, `pre_consent_audio_buffers` テーブルが存在しない。q_consent_check / q_consent_check_per_attendee / q_recording_consent_violation / q_pre_consent_buffer_purge / q_pre_consent_buffer_lock も無し。 | 未実装 | 新規 migration: `0040_recording_consent.sql`, jobs: `apps/worker/src/jobs/recording-consent-{check,purge,lock}.ts`, API: `AP-86 / AP-106`, UI: 商談詳細 SC-11 ConsentDialog | 7d |
| GAP-R-P0-03 | 03 recording_segments / 14 recording stage1→2→3 / 05 q_recording_stage1_transcript, stage2_preview, stage3_full | **recording_segments テーブルに行が書き込まれない**。worker は `recordings.transcript_segments` (jsonb) のみ更新し、正規化テーブル (`recording_segments` 0007) には INSERT しない。RLS が segment 単位 sensitivity tier を前提にしている (`rec_segments_select` 0007) のに、データが無いので **sensitivity 段階閲覧 (M-C3) が完全に機能不全**。recording_stages テーブルへの書込も無く、`stage1_transcript_at` / `current_stage` 列は本実装スキーマと食い違う (0007 は `stage`+`status` 設計、03_data_model は `stage1_transcript_at` 設計)。 | 部分実装 (jsonb 経路のみ) | `apps/worker/src/jobs/recording-transcribe.ts` (transcript_segments を `recording_segments` UPSERT に切替), `recording-summarize.ts` (sensitivity を segment 単位に伝播) | 4d |
| GAP-R-P0-04 | 06 / 11 / Round1-architect / 03 recording_segments.speaker_id | **話者ダイアリゼーション (pyannote / Whisper diarization) が未実装**。`WhisperProvider` は `speakerLabel: 'speaker_0'` を全 segment 固定で返す (`transcribe/providers.ts` L232)。コメントで "diarization は Phase2 で別 provider に切る" と明記済み。Top-営業表現集 (SC-50) や per-attendee redact (AT-Compl-1) などダウンストリームが speaker_id 必須なので **これが無いと sensitive 化 / 削除 / コンプラ機能全部が動かない**。 | 未実装 | `apps/worker/src/lib/transcribe/diarize.ts` (pyannote on Render Worker / fal.ai / Deepgram nova-3 diarize 選択), `recording-transcribe.ts` で post-process | 5-8d (推論基盤含む) |
| GAP-R-P0-05 | 16 C-5 / 08 WORM export / 13 (B) 監査 | **R2 Object Lock (compliance mode) / WORM 7年保持が未設定**。worker は Supabase Storage `recordings` bucket に upload するだけ (`recording-download.ts` L94)。R2 設定無し、Object Lock policy 無し、`q_audit_worm_export` 無し、`audit_logs` の R2 日次ダンプ無し。法定保存 (e.g. 7年) を満たさない。 | 未実装 | infra: R2 bucket policy (Compliance mode) + retention 7y, worker: `apps/worker/src/jobs/audit-worm-export.ts`, env: R2 keys | 3d (R2 構築含む) |
| GAP-R-P0-06 | 16 C-3 / SC-60 / 04 AP-115/116 / 05 q_consent_revoke_apply | **GDPR / 個情法 削除請求 (data_deletion_requests) が完全に存在しない**。テーブル無し、画面 (SC-60 /share/[token]/request, SC-60a /admin/deletion-requests) 無し、SLA 30日カウントダウン無し、downstream embedding cleanup (q_embedding_cleanup) 無し、利用規約撤回時 (q_consent_revoke_apply) の AI 処理停止無し。**個情法 第30条 (利用停止) / GDPR Art.17 (right to be forgotten) 違反**。 | 未実装 | migration: `0041_data_deletion_requests.sql`, API: `AP-115/AP-116`, UI: SC-60 / SC-60a, jobs: `consent-revoke-apply.ts`, `embedding-cleanup.ts`, `deletion-propagate.ts` | 7d |
| GAP-R-P0-07 | 03 retention_policies / 16 C-2 / 13 (B) 保持期間 5年 | **保持期間切れ録画の自動削除 cron が無い**。`retention_policies` テーブル無し、`cleanup_expired_shares` (pg_cron) 設計はあるが migration 未投入。設計書の「録画 / メール 5年」「受注 / 失注 3年」「退職60日内再評価」が実装されていない。 | 未実装 | migration: `0042_retention_policies.sql`, pg_cron job `cleanup_expired_recordings`, `cleanup_expired_shares` (両方 `pg_cron + supabase functions schedule`) | 3d |
| GAP-R-P0-08 | 04 AP-21 / SC-16 | **HTTP API `/api/recordings/[id]` が無い**。詳細ページは server-component が直接 supabase クライアントで select している (`apps/web/src/app/recordings/[id]/page.tsx` L246)。embeddings rebuild / share / clip 等は外部から触れず、worker や `/admin/audit-evidence` から再生成も出来ない。`/api/recordings` 一覧 (AP-20), `/api/recordings/[id]/insights` (AP-22 PATCH) も同様に無い。 | 未実装 (内部 server-component 経路のみ) | `apps/web/src/app/api/recordings/route.ts`, `apps/web/src/app/api/recordings/[id]/route.ts`, `apps/web/src/app/api/recordings/[id]/insights/route.ts` (RPC `update_recording_insights` に橋渡し) | 3d |
| GAP-R-P0-09 | 04 AP-22 / 23 / 24 AT-S5-1 / SC-11 改 / RPC 0023 | **RPC `update_recording_insights` を呼ぶ web 経路が無い**。0023 migration で SECURITY DEFINER RPC は実装済みだが、`ai-insights-panel.tsx` の `onSectionSave` は `undefined` のまま (L36)、`recording-detail-client.tsx` も "PATCH /api/recordings は別 agent" のコメントを残して local state のみ更新。**サンプル一覧と詳細しか動かず、編集は反映されない**。 | RPC のみ有り、UI 配線無し | `apps/web/src/app/api/recordings/[id]/insights/route.ts` + `recording-detail-client.tsx` の `onSectionSave` を server-action に置換 | 1.5d |

P0 合計見積: **約 38-41 日 (1 ENG 換算)**

---

## P1 未実装

| ID | 設計書ソース | 項目 | 状態 | 実装場所 (想定) | 見積 |
| --- | --- | --- | --- | --- | --- |
| GAP-R-P1-01 | 05 q_pii_redaction / 03 pii_redactions / LP-21 | **PII 検知 (LP-21) が固定キーワード辞書のみ**。`recording-summarize.ts` の `PII_PATTERNS` は 5 個の regex (マイナンバー / クレカ / パスポート / 健保証 / 機密キーワード)。住所 / 電話 / 金額 / メールは検知できない。`pii_redactions` テーブル無し。 `recording_segments.pii_redacted_text` は jsonb 経路で書込まれない (P0-03 に依存)。 | 部分実装 | `apps/worker/src/lib/pii/detector.ts` (Google DLP or `transformers.js` ja_pii) + `pii_redactions` テーブル | 4d |
| GAP-R-P1-02 | 24 AT-S5-1 / 23 (録画処理 SLA stage1<=5min) / 05 q_recording_stage_eta | **stage1 / stage2 / stage3 の段階ステータスと ETA が UI に出ない**。`recording-skeleton.tsx` (`RecordingProcessingCard`) は `progressPct` を `STATUS_PROGRESS` map で線形に出すだけ (`load-recordings.ts` L78)。設計書は「stage1<=5分通知」「ETA 動的算出 (p95)」「partial_artifacts」を要求。 | 未実装 | `recording_stages` (0007 形式) への worker UPSERT + UI で `stage` ごとのチェックリスト表示 | 3d |
| GAP-R-P1-03 | 05 q_zoom_recording_pause_alert / 14 meeting recording_paused / 23 録画停止検知 | **Zoom recording.paused / recording.stopped webhook が未受信**。`apps/worker/src/routes/webhooks.ts` は `recording.completed` 以外を `received: true, handled: false` で no-op (L128)。録画 30秒以内 Push+SMS (F-S4-5) 動かない。 | 未実装 | `webhooks.ts` に `recording.paused/stopped/resumed` 分岐 + `q_zoom_recording_pause_alert` job + SMS provider | 3d |
| GAP-R-P1-04 | 06 (T-011) Zoom historical / SC-63 / AP-91 / q_zoom_historical_import / q_legacy_import_dlq | **Zoom 過去録画一括移行が無い**。SC-63 画面なし、AP-91 endpoint なし、job なし、DLQ なし。 | 未実装 | `apps/web/src/app/recordings/import/page.tsx`, `apps/worker/src/jobs/zoom-historical-import.ts` | 4d |
| GAP-R-P1-05 | 06 / 推論ガード / Round 2 SRE H4 | **video_storage_key の verification (sha256) が無い**。`recording-download.ts` L211 で upload するが、ファイルハッシュを `recordings` に保存しない。tampering 検知不可。 | 未実装 | `recording-download.ts` で `crypto.createHash('sha256')` → `recordings.video_sha256` 列追加 (migration) | 1d |
| GAP-R-P1-06 | 14 recording.failed → stage1_rerun (M-6) / SC-16 reprocess | **再処理 (reprocess) UI と API が無い**。`recording-skeleton.tsx` L173 で `form action=/api/recordings/${id}/reprocess` を書いているが route が存在しない。AP-70 未実装、`analyze_recording` queue 配線無し。 | UI placeholder のみ、API 無し | `apps/web/src/app/api/recordings/[id]/reprocess/route.ts` + `analyze_recording` consumer | 2d |
| GAP-R-P1-07 | 04 AP-69 / SC-16 sensitivity | **sensitive 化 API (`POST /api/recordings/[id]/segments/[seg]/sensitivity`) が無い**。RPC も無し。recording_segments への write も全く無い (P0-03)。 | 未実装 | RPC `update_segment_sensitivity` + API route | 2d |
| GAP-R-P1-08 | 03 recordings.transcript_source / 06 Whisper 補完 | **Whisper 補完判定 (Zoom VTT confidence 低い区間のみ) が未実装**。`transcribe/providers.ts` は Whisper を 1 つ呼ぶか Mock のみ。Zoom 標準 VTT は取得 (downloadZoomRecording) すらしておらず、`transcript_source='zoom'` 経路が事実上存在しない。 | 未実装 | `zoom.ts` で `recording_files.file_type='TRANSCRIPT'` の VTT を別 fetch → `lib/transcribe/zoom-vtt.ts` parser | 3d |
| GAP-R-P1-09 | 04 AP-137 / 05 q_derived_artifacts_regen / SC-11 改 v2.5 / AP-148 | **派生成果物の staleness 追跡と debounced regen が無い**。AP-137 (derived-status), AP-148 (regen-now) なし、`q_derived_artifacts_regen` なし、`embedding_status: 'pending'|'fresh'` 列なし。インライン編集後に embedding がズレる。 | 未実装 | `recordings.derived_versions jsonb` 列追加, RegenNowButton SC-11(改) | 3d |
| GAP-R-P1-10 | 05 q_speaker_voice_propagate / F-S5-4 | **音声学習による話者命名の過去録画への伝播が無い**。`voice_embedding` 列も無し。 | 未実装 | `recording_segments.speaker_voice_embedding vector(192)` + propagate job | 3d (P0-04 diarization 後) |
| GAP-R-P1-11 | 23 録画処理 SLA / 24 AT-S5-1 / Round 2 SRE | **SLA メトリクス (stage1<=5min p95) が emit されていない**。`recording-transcribe.ts` は `jobDurationSeconds` を `queue=transcribe_recording` で出すが、stage1 概念は別。 | 部分実装 | `metrics.ts` に `recordingStageDurationSec` histogram + 3 stage 各 emit | 1d |
| GAP-R-P1-12 | 14 / 24 AT-Idem-2 / S-N-01 | **jobs_inflight idempotency は webhook には入っているが、download/transcribe/summarize 内の冪等チェックが無い**。pgmq の再配信時に二重 transcribe で OpenAI 課金が重複する。 | 部分実装 | 各 job 入口で `recordings.processing_status` を見て早期 return (or `idempotency_keys` 拡張) | 1d |

P1 合計見積: **約 30 日**

---

## P2 / 後回し

| ID | 設計書ソース | 項目 | 状態 | 実装場所 | 見積 |
| --- | --- | --- | --- | --- | --- |
| GAP-R-P2-01 | 04 AP-78 / SC-23 認識ズレ | alignment_reports テーブル+UI 無し | 未実装 | migration + handoff alignment UI | 2d |
| GAP-R-P2-02 | SC-44 / LP-20 external_summary | 顧客向け要約 (sensitive 抜き) PDF 生成無し | 未実装 | `external_summaries` テーブル + PDF gen + share_link 連携 | 4d |
| GAP-R-P2-03 | SC-43 live-search | 商談中即時検索 (画面共有窓) 無し | 未実装 | `/meetings/[id]/live-search` + LP-34 安全フィルタ | 3d |
| GAP-R-P2-04 | SC-42 brief | 5分前商談前ブリーフィング (LP-16) 無し | 未実装 | `meeting_briefs` + cron + LP-16 | 2d |
| GAP-R-P2-05 | F-S9-4 / AP-136 / transcript_anchors | 録画箇所 × 資料/コミット 双方向リンク無し | 未実装 | `transcript_anchors` テーブル + UI | 3d |
| GAP-R-P2-06 | SC-31 / SC-31 改 / 公開ビュー | `/share/[token]` 表示 UI も含めて無し (P0-01 と一体だが UI 分離) | 未実装 | `apps/web/src/app/share/[token]/page.tsx` + 機械翻訳 link (NF3-UX-2) | 2d |
| GAP-R-P2-07 | SC-30 /admin/knowledge | recording 由来の embedding 承認キューが無い | 未実装 | review queue UI + bulk approve | 2d |
| GAP-R-P2-08 | 25 v2 M-C2 / 透かし / 共有 | viewer email 埋込み透かし (q_share_link_watermark) 無し | 未実装 | ffmpeg overlay + worker job | 3d |
| GAP-R-P2-09 | 03 ex_employee_speech_policies / LP-31 / O-04 | 退職者発言の retain/anonymize/delete 一括処理無し | 未実装 | policy + LP-31 + audit | 4d |
| GAP-R-P2-10 | 27_simulation_resolutions F-S5-2 partial_artifacts | stage2 で部分 summary を発行する partial_artifacts_allowed フラグ無し | 未実装 | `recording_stages.partial_artifacts_allowed` + UI | 2d |

P2 合計見積: **約 27 日**

---

## P3 / Phase3

| ID | 設計書ソース | 項目 | 見積 |
| --- | --- | --- | --- |
| GAP-R-P3-01 | AP-74 / SC-21 / PROMPT-07 / LP-33 | 録画 → ロープレ シナリオ自動生成 | 3d |
| GAP-R-P3-02 | SC-50 top-phrases / LP-28 | トップ営業表現集 (要 diarization + 同意) | 5d |
| GAP-R-P3-03 | LP-26 / upsell_signals / q_upsell_detect | アップセル signal 検出 | 3d |
| GAP-R-P3-04 | SC-47 team/roleplay/live / observation_consent | ロープレ観戦 (consent_level=pre_notify) | 3d |

---

## state machine の食い違い (実装 vs 設計)

| state | 設計書 (14_state_machines) | 実装 | 差分 |
| --- | --- | --- | --- |
| recording | `queued → stage1_transcript → stage2_preview → stage3_full / failed / reprocessing` | `pending → downloading → transcribing → analyzing → embedding → completed / failed` (`recordings.processingStatus`) | **語彙が異なる**。設計の stage1/2/3 は recording_stages table の独立 row 想定だが、実装は recordings 1 行で線形遷移するだけ。reprocessing (M-6) 状態も無い。 |
| consent_capture (single) | `not_captured → captured / refused / auto_terminated` | 無し | テーブル無し |
| consent_capture per-attendee | `not_captured → captured / refused / late_join_pending → (300s timeout) → refused` | 無し | テーブル無し |
| pre_consent_buffer (NF-S4-1) | `unlocked → verbal_locked → retention_aged / auto_purged (extension_count++ max 3)` | 無し | テーブル無し |
| meeting recording_paused (F-S4-5) | `in_progress → recording_paused (30s Push+SMS)` | 無し | webhook で `recording.paused` 受けてない (no-op で破棄) |
| roleplay_consent (F-S7-4) | `none → review_only → team_blurred → full_share` (downgrade パス含む) | 無し | テーブル無し |

---

## Acceptance Test 充足状況

| AT ID | 内容 | 充足度 |
| --- | --- | --- |
| AT-S5-1 (stage1<=5分) | 文字起こし<5min p95 | **未充足** (stage 概念無し、metric なし) |
| AT-S4-2 (auto_record=cloud) | Zoom auto_record 強制 | **未充足** (q_meeting_recording_force 無し) |
| AT-RLS-2 (sensitivity tier) | sensitive=owner+admin+legal | **migration は通っている** (0007 / 0011) が、recording_segments に行が無いので segment 単位の RLS は **空打ち** |
| AT-RLS-3 (embeddings RPC) | 他org / 他 sensitivity 非表示 | embeddings RPC `match_knowledge_v2` は別 agent (0014) で実装済。録画 embedding metadata は OK |
| AT-Idem-2 (webhook 二重) | 同 zoom_event 2 回で 1 record | **充足** (jobs_inflight + 23505 ハンドリング, `webhooks.ts` L149-167) |
| AT-Compl-1 (per-attendee consent) | 途中参加未同意→該当発話 redact | **未充足** (per_attendee_consent table 無し) |
| AT-S4-Pause (recording.paused 30s) | webhook→30s Push+SMS | **未充足** |
| AT-S11-1 (consent 不同意→停止) | 録画自動停止 | **未充足** |
| AT-S4-Verbal (verbal 同意 buffer ロック) | verbal_proof_locked=48h | **未充足** |
| AT-S14-DLQ (Zoom historical DLQ) | 3 失敗→DLQ→手動 retry | **未充足** |
| AT-S13-Citation (chat citation deeplink) | `/recordings/[id]?t=mm:ss` | **詳細ページは ?t= を未対応**。`recording-detail-client.tsx` は URL query を見ない |

---

## Top 5 未実装 (本番ブロッカー優先順)

1. **GAP-R-P0-01 share_links + クリップ共有 (5d)** — UI は出来ているのに API も RPC も無い。`onCreate` が常に null → デモ URL のみ。SC-46 完全未実装。
2. **GAP-R-P0-02 per-attendee 録画同意 (7d)** — meeting_consent_captures / per_attendee_consent / pre_consent_audio_buffers すべて未在。**個情法 / GDPR / 商習慣 全て不適合**。
3. **GAP-R-P0-04 話者ダイアリゼーション (5-8d)** — `speaker_0` 固定で diarization ゼロ。コンプラ・top-phrases・退職者匿名化など下流が全部止まる。
4. **GAP-R-P0-05 R2 Object Lock / WORM 7年 (3d)** — Supabase Storage に置きっぱなし。法定保存 (会社法 432条 / 個情法 25条) 違反。audit_logs の R2 dump も無い。
5. **GAP-R-P0-06 GDPR 削除請求 (7d)** — data_deletion_requests テーブル / SC-60 UI / SLA / downstream embedding cleanup すべて無し。**EU 顧客導入時 即ブロック**。

---

## 補足: 実装側で「壊れている」点

- `apps/web/src/app/recordings/[id]/page.tsx` L327: `meetings.company_name` を select しているが、meetings schema には `company_name` 列が無い (`contact_id` 経由で contacts.company_name)。詳細ページの会社名は常に "—"。
- `apps/web/src/app/recordings/_lib/load-recordings.ts` L360: `normalizeSpeakers(r.key_points)` と `normalizeHighlights(r.key_points)` を同じ `key_points` jsonb から 2 つの schema で読もうとしている。Claude provider の出力は `keyPoints: string[]` (`SummarizeResult.keyPoints`) なので、両 normalize は常に空配列を返す。一覧の sparkline / speakerSplit が常に未表示。
- `recording-transcribe.ts` L169: `transcript_source` を `provider.name === 'whisper' ? 'whisper' : 'zoom'` で書いているが、Mock provider のときも 'zoom' になる → 後段でのソース判別が誤動作。
- `recordings.video_storage_key` に書き込みはあるが `videoStorageUrl` (詳細ページが読む列) は worker が一切書かない (`recording-download.ts`)。詳細ページの `<video src={videoUrl}>` が常に null → 動画再生は **動かない**。
- `webhooks.ts` L196-207: meetingDbId が無いケースで recordings 行を作らずに pgmq enqueue するが、worker `recording-download.ts` L138 の lookup は `meeting_id` キーなので **永久に recordingId=null** で進む。video_storage_key も保存されない。
