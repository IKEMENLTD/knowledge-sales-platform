# 05_jobs_queues

| pgmq ジョブ仕様 |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| Worker プロセスで処理する非同期ジョブ |  |  |  |  |  |  |
| ■ ジョブ一覧 |  |  |  |  |  |  |
| キュー名 | トリガー | ペイロード | 処理内容 | リトライ | タイムアウト | 並列度 |
| process_business_card | /api/ocr/business-card 後 | {contact_id, image_url} | 1) Vision API Document AI 呼び出し
2) 結果を Claude で構造化整形(姓名分離・フリガナ推定・敬称除去)
3) 重複検知(domain+name 類似度)
4) contact 更新
5) 完了通知 | 3回(指数バックオフ) | 60秒 | 4 |
| process_recording | Zoom Webhook recording.completed | {meeting_id, zoom_meeting_id, zoom_recording_id, download_token} | 1) Zoom API で動画+VTT取得
2) 動画を R2 にアップロード(マルチパート)
3) VTT パース→segments
4) Whisper で品質補完(任意)
5) speakerに同席者ラベル付け
6) Claude で要約・key_points・customer_needs・objections・commitments 抽出
7) チャンク分割→embedding生成→knowledge_embeddings保存
8) 完了通知 | 5回(指数バックオフ) | 30分 | 2 |
| analyze_recording | recordings 編集後の再解析 | {recording_id} | 6,7のみ再実行 | 3回 | 15分 | 2 |
| send_scheduling_email | ドラフト確認画面の送信ボタン | {draft_id} | 1) Gmail API send
2) email_messages作成
3) thread状態を awaiting_reply に
4) Pub/Sub watch 開始(history.list用) | 3回 | 30秒 | 4 |
| parse_email_reply | Gmail Pub/Sub通知 | {user_id, history_id} | 1) history.list で新着取得
2) 関連 email_thread を引き当て
3) Claude で意図分類:slot_accept / slot_reject / counter_propose / unrelated
4) 信頼度低いものは needs_review に
5) 通知作成 | 3回 | 60秒 | 4 |
| generate_embeddings | knowledge_items 作成・更新 | {source_type, source_id} | 1) 対象テキスト取得(資料/録画/メモ)
2) チャンク分割(800トークン重なり100)
3) OpenAI text-embedding-3-small 一括生成
4) knowledge_embeddings upsert | 3回 | 5分 | 4 |
| analyze_document | ナレッジファイルアップロード | {knowledge_item_id} | 1) PDF/PPTX/画像からテキスト抽出
2) 画像なら Claude Vision で内容説明
3) ai_description / ai_tags 生成
4) 後段で generate_embeddings 投入 | 3回 | 5分 | 4 |
| generate_clip | クリップ作成リクエスト | {recording_id, start_seconds, end_seconds, clip_id} | 1) R2 から動画ダウンロード
2) ffmpeg で切り出し
3) R2 アップロード
4) clips 更新 | 3回 | 10分 | 2 |
| generate_handoff_draft | 引き継ぎ作成リクエスト | {handoff_id, contract_id} | 1) 関連商談の録画・抽出を集約
2) Claude で構造化引き継ぎ書生成
3) handoffs.content 更新 | 3回 | 5分 | 2 |
| generate_roleplay_scenario | シナリオ自動生成 | {from_meeting_ids, scenario_id} | 1) 録画抽出データ集約
2) Claude でペルソナ・初回発話・評価基準生成
3) scenarios 更新 | 3回 | 5分 | 2 |
| cleanup_expired_shares | pg_cron daily | - | expires_at < now() の share_links を削除 | - | 5分 | 1 |
| aggregate_usage | pg_cron hourly | - | llm_usage_logs を月次集計、上限超過アラート | - | 5分 | 1 |
| ■ Worker 実装パターン(Hono + pgmq) |  |  |  |  |  |  |
| // apps/worker/src/queue.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function consumeQueue(name: string, vt: number, handler: (msg: any) => Promise<void>) {
  while (true) {
    const { data } = await sb.schema('pgmq_public').rpc('read', { queue_name: name, vt, qty: 1 });
    if (!data || data.length === 0) { await sleep(2000); continue; }
    const msg = data[0];
    try {
      await handler(msg.message);
      await sb.schema('pgmq_public').rpc('delete', { queue_name: name, msg_id: msg.msg_id });
    } catch (err) {
      if (msg.read_ct >= MAX_RETRIES) {
        await sb.schema('pgmq_public').rpc('archive', { queue_name: name, msg_id: msg.msg_id });
        // dead letter 通知
      }
      // それ以外は visibility timeout 切れで再取得される
    }
  }
} |  |  |  |  |  |  |
| ■ 追加ジョブ(v2) |  |  |  |  |  |  |
| キュー | ペイロード | 処理内容 | リトライ | DLQ | 頻度 | Phase |
| q_offline_sync | {client_id, items[]} | オフラインキューの再送 | exp 5回 | yes | online復帰時 | P1 |
| q_event_tag_propagate | {event_id, contact_ids[]} | イベントタグ一括付与 | 3回 | yes | 即時 | P2 |
| q_internal_invite_timeout | {invite_id} | 2時間後にtimeout判定 | - | yes | 2時間後 | P2 |
| q_calendar_hold_release | {hold_id} | 48時間で自動解放 | - | yes | 48時間後 | P2 |
| q_scheduling_redraft | {thread_id} | 全NG時の再ドラフト生成 | 2回 | yes | 即時 | P2 |
| q_meeting_brief | {meeting_id} | 5分前にブリーフィング生成+push | - | yes | 商談15/5分前 | P2 |
| q_meeting_recording_force | {meeting_id} | auto-record失敗時の警告/リトライ | 3回 | yes | 商談開始5分後 | P2 |
| q_recording_stage1_transcript | {recording_id} | 文字起こしのみ(数分) | 2回 | yes | 録画完了後 | P1 |
| q_recording_stage2_preview | {recording_id} | プレビュー要約(10分) | 2回 | yes | stage1完了後 | P1 |
| q_recording_stage3_full | {recording_id} | ニーズ/反論/約束抽出(20分) | 2回 | yes | stage2完了後 | P1 |
| q_pii_redaction | {recording_id, share_target} | PIIマスキング | 2回 | yes | 共有時 | P2 |
| q_external_summary | {meeting_id} | 顧客向け要約生成 | 2回 | yes | オンデマンド | P2 |
| q_quick_search_cache | {customer_id} | CS用Top発言キャッシュ | - | - | 顧客変更時 | P2 |
| q_complaint_link | {complaint_id} | 関連商談の自動紐付け | 2回 | yes | クレーム登録時 | P3 |
| q_roleplay_failure_aggregate | {period} | 失敗パターン集計 | - | - | 週次 | P3 |
| q_renewal_alerts | - | 契約更新3ヶ月前検出 | - | - | 日次 | P2 |
| q_upsell_detect | {recording_id} | アップセル機会検出 | 2回 | yes | 録画完了後 | P3 |
| q_email_undo_finalize | {undo_token} | 30秒後に確定送信 | - | - | 30秒後 | P2 |
| q_soft_delete_purge | - | 保持期限超過の物理削除 | - | - | 日次 | P2 |
| q_pitr_snapshot | - | PITRスナップショット | - | - | 継続 | P2 |
| q_consent_check | {meeting_id} | 録画同意確認(冒頭5分) | - | yes | 録画開始5分後 | P2 |
| q_deletion_request_review | {ticket_id} | 削除依頼の人手レビュー振り分け | - | - | 即時 | P2 |
| q_legal_export | {period, customer} | 法的開示エクスポート | - | - | オンデマンド | P3 |
| q_legacy_import | {job_id} | CSV/Sansan/Eight インポート | 2回 | yes | オンデマンド | P2 |
| q_zoom_historical_import | {period} | Zoom過去録画一括 | 2回 | yes | オンデマンド | P3 |
| q_recent_view_log | {user_id, resource} | 最近見た記録(buffered) | - | - | リアルタイム | P1 |
| q_search_index_rebuild | {table} | BM25/vector再構築 | - | - | 週次 | P1 |
| q_hallucination_audit | {conversation_id} | 引用なし回答の検査 | - | - | 日次 | P3 |
| q_voice_memo_transcribe | {memo_id} | Whisper文字起こし | 2回 | yes | 即時 | P2 |
| q_push_dispatch | {user_id, payload} | Web Push送信 | 2回 | yes | 即時 | P2 |
| q_realtime_state_broadcast | {resource_id, state} | Realtime同期 | - | - | 即時 | P2 |
| q_ab_test_result | {exp_id} | A/Bテスト結果集計 | - | - | 日次 | P3 |
| q_ff_rollout_check | - | FFのロールアウト健全性 | - | - | 時次 | P2 |
| q_recording_consent_violation | {meeting_id} | 不同意録画の自動停止 | - | yes | 即時 | P2 |
| q_anonymize_ex_employee | {user_id} | 退職者発言のポリシー実行 | - | yes | 退職時 | P3 |
| ■ Round1指摘反映で追加ジョブ(v2.1) |  |  |  |  |  |  |
| キュー | ペイロード | 処理内容 | リトライ | DLQ | 頻度 | Phase |
| q_pre_consent_buffer_purge | {meeting_id, until_consent_at} | 同意前録音をR2/DBから物理削除(C-1) | 2 | yes | 同意取得後即時 | P2 |
| q_consent_check_per_attendee | {meeting_id, attendee_id} | attendee別consent確認(C-1) | - | yes | 参加検知時 | P2 |
| q_soft_delete_reminder | - | 30日期限の7日前/1日前リマインド(G-6) | - | yes | 日次 | P2 |
| q_deletion_propagate | {ticket_id} | R2/Anthropic/OpenAI/PITR への伝播削除(C-3) | 3 | yes | 承認時 | P2 |
| q_audit_chain_verify | {period} | audit_logs hash chain健全性検査(C-5) | - | yes | 日次 | P2 |
| q_audit_worm_export | - | audit_logsをR2 WORMへエクスポート(C-5) | 2 | yes | 日次 | P2 |
| q_offboarding_orchestrate | {user_id} | 退職SOP M-Day〜M+60自動進行(C-6) | - | yes | オンデマンド | P2 |
| q_offboarding_owner_transfer | {user_id, target_owner} | 所有権一括移管(C-6) | 2 | yes | 退職day | P2 |
| q_speaker_propagate | {speaker_id, name} | 話者命名の遡及伝搬(G-26) | 2 | yes | 命名時 | P2 |
| q_renewal_3m_alert | - | 契約更新3ヶ月前push(US-74重複回避) | - | - | 日次 | P2 |
| q_embedding_cleanup | {source_kind,source_id} | 元レコード削除時のembedding掃除(M-3) | 2 | yes | 削除時 | P1 |
| q_dr_backup_replicate | - | ap-northeast-3への暗号化バックアップ(M-C4) | 2 | yes | 日次 | P2 |
| q_consent_revoke_apply | {user_id, version} | 利用規約撤回時のAI処理停止+embeddings削除(M-C5) | - | yes | 撤回時 | P2 |
| q_llm_cost_guard | - | Anthropic tokens/sec監視+月予算150%でhard stop(T-6,M-C6) | - | - | 継続 | P1 |
| q_secret_rotation_check | - | _OLD/_NEW併存7日窓監視(M-C1) | - | yes | 日次 | P2 |
| q_idempotency_keys_purge | - | TTL超過のidempotency_keys掃除(T-5) | - | - | 日次 | P1 |
| q_jobs_inflight_release | - | 期限切れinflightロック解除(T-3) | - | - | 継続 | P1 |
| q_onboarding_kpi_check | - | 初週KPI未達検出+CSM/上司alert(G-13) | - | - | 日次 | P3 |
| q_share_link_watermark | {share_token} | viewer email埋込み透かし(M-C2) | 2 | yes | アクセス時 | P2 |
| q_search_zero_result_log | {query, user_id} | ゼロ件クエリ記録+did_you_mean生成(G-20) | - | - | 即時 | P2 |
| ■ v2.3 追加ジョブ(実演シミュ反映) |  |  |  |  |  |  |
| キュー | ペイロード | 処理内容 | リトライ | DLQ | 頻度 | Phase |
| q_audit_evidence_pack | {period} | 監査エビデンスパック自動生成(F-S10-2) | 2 | yes | 月次 | P2 |
| q_handoff_sla_check | - | 48h/72h SLA違反検出+escalate(F-S9-1) | - | - | 継続 | P2 |
| q_behavioral_anomaly | - | 部下行動異常検知(F-S8-4) | - | - | 週次 | P3 |
| q_cost_actuals_aggregate | - | per-user/team/featureコスト集計(F-S10-4) | - | - | 日次 | P2 |
| q_meeting_brief_degraded | {meeting_id} | 縮退版brief即時生成(F-S4-4) | 2 | yes | 15分前 | P2 |
| q_meeting_brief_full | {meeting_id} | 完全版brief(F-S4-4) | 2 | yes | 5分前 | P2 |
| q_recording_stage_eta | - | stage1/2/3 ETA算出(F-S5-2) | - | - | 分次 | P2 |
| q_derived_artifacts_regen | {meeting_id, kinds[]} | summary/handoff/embeddingsの差分再生成(F-S5-1) | 2 | yes | インライン編集後 | P2 |
| q_speaker_voice_propagate | {voice_embedding_id, name} | voice学習で過去録画にも反映(F-S5-4) | 2 | yes | 命名時 | P2 |
| q_post_meeting_checklist | {meeting_id} | 商談後タスク自動生成(F-S5-5) | - | - | 商談終了 | P2 |
| q_zoom_recording_pause_alert | {meeting_id} | 録画停止30秒以内Push+SMS(F-S4-5) | 2 | yes | webhook | P1 |
| q_voice_memo_segments_merge | {memo_id} | 中断分割の最終連結(F-S14-2) | 2 | yes | 録音終了 | P2 |
| q_sync_success_dispatch | - | 同期成功toast配信(throttle 10s bundle, F-S14-3) | - | - | 継続 | P2 |
| q_notification_dedup | {event_id, user_id, channels[]} | クロスチャネル重複抑制(F-UX-4) | - | yes | 即時 | P2 |
| q_onboarding_kpi_alert | - | 初週KPI未達alert(F-S12-3再強化) | - | - | 日次 | P3 |
| q_dr_restore_request | {request_id} | PITR復元実行(承認後)(F-S10-1) | - | yes | 承認時 | P3 |
| q_legacy_import_resume | {job_id} | staged_stateから再開(F-S12-2) | 2 | yes | 中断時 | P2 |
| q_observation_consent_update | {user_id, level} | 観戦同意レベル更新(F-S8-2) | - | - | 設定変更時 | P3 |
| q_internal_invite_dynamic_timeout | {invite_id} | 役職/外出ステータスでtimeout延長(F-S2-1) | - | - | 即時 | P2 |
| q_calendar_hold_release_dynamic | {hold_id} | 他候補確定/timeoutで解放(透明性反映)(F-S2-2) | - | - | 即時/timeout | P2 |
| q_handoff_quality_score | {handoff_id} | 品質スコア+6m churn相関(F-S9-5) | - | - | 引継ぎ完了+6M | P3 |
| q_top_attention_generate | - | Top5案件/Top3部下生成(F-S8-1) | - | - | 日次/月曜朝 | P3 |
| q_role_default_notifications_apply | {user_id, role} | 新規ユーザにロール別初期値適用(F-S12-4) | - | - | サインアップ時 | P3 |
| q_audit_chain_incident_open | {broken_row_id} | 破断検知時にincident起票(F-S10-3) | - | yes | 検知時 | P2 |
| q_help_articles_seed | - | help_articles 20件seed(F-UX-5) | - | - | P1リリース時 | P2 |
| q_export_template_render | {locale, kind, payload} | i18n PDF/メール/透かしレンダリング(F-UX-1) | 2 | yes | オンデマンド | P3 |
| ■ v2.4 追加ジョブ(再シミュ残課題) |  |  |  |  |  |  |
| キュー | ペイロード | 処理内容 | リトライ | DLQ | 頻度 | Phase |
| q_pre_consent_buffer_purge(改v2.4) | - | verbal_proof_locked=false のみ対象に修正(NF-S4-1) | - | yes | 継続 | P2 |
| q_pre_consent_buffer_lock | {meeting_id, segment_range} | verbal同意取得時にbufferをロック(NF-S4-1) | 2 | yes | 即時 | P2 |
| q_legacy_import_zoom(改v2.4) | - | max_retries=3, exponential backoff(2^n min, max 16min), 失敗→q_legacy_import_dlq | 3 | yes | オンデマンド | P3 |
| q_legacy_import_dlq | {job_id, error} | DLQ管理(F-S14-4再) | - | - | - | P3 |
| q_voice_memo_translate | {memo_id, target_locale} | オンザフライ翻訳(NF-UX-1) | 2 | yes | share token閲覧時 | P3 |
| q_taxonomy_review | {taxonomy_id} | 法務→情シス順承認フロー(NF-S9-1) | - | yes | オンデマンド | P3 |
| q_away_heuristic_detect | {user_id} | Gmail flight + calendar holds密度から自動away推定(NF-S2-1) | - | - | 日次 | P2 |
| q_derived_artifacts_regen(改v2.4) | - | debounce 60秒+OCC追加(NF-S5-1) | 2 | yes | インライン編集後60秒静止 | P2 |
| q_zoom_recording_pause_alert(改v2.4) | - | paused_by_user_idで分岐(NF-S4-2): 本人=Pushのみ, admin=Push+SMS | 2 | yes | webhook | P1 |
| ■ v2.5 追加・改修(R3 minor) |  |  |  |  |  |  |
| キュー | ペイロード | 処理内容 | リトライ | DLQ | 頻度 | Phase |
| q_voice_memo_translate_human | {memo_id, target_locale} | 人手翻訳発注+SLA 5営業日(NF3-UX-2) | - | yes | オンデマンド | P3 |
| q_roleplay_clip_reencode | {clip_id, blur_level} | downgrade時の遡及ぼかし再エンコード(NF3-S7-1) | 2 | yes | downgrade時 | P3 |
| q_taxonomy_migration | {old_taxonomy_id, replaced_by_id} | archive後の代替版migration(NF3-S9-1) | 2 | yes | オンデマンド | P3 |
| q_review_backlog_aggregate | - | 信頼区間<0.4退避バックログ集計(NF3-S8-1) | - | - | 週次 | P3 |
| q_speaker_confidence_aria_announce | {citation_id, new_confidence} | aria-live通知発火(NF3-A11Y-1) | - | - | 再識別完了 | P3 |
| q_away_heuristic_detect(改v2.5) | - | en-US/zh-CN regex+LLM分類追加, confidence>=0.7閾値(NF3-S2-1) | - | - | 日次 | P2 |
| q_pre_consent_buffer_extend | {buffer_id, by_user_id, reason} | verbal_proof再延長(最大3回)(NF3-S4-1) | - | yes | オンデマンド | P2 |