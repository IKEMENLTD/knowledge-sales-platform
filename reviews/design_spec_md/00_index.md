# 00_index

| 営業ナレッジ&商談アーカイブ・プラットフォーム 設計書 |  |  |  |
| --- | --- | --- | --- |
| 対象: Claude Code による自動実装 / 想定規模: 10名 / Phase 1 = 4週間 |  |  |  |
| 概要 |  |  |  |
| 営業活動全体(名刺取得→日程調整→商談→録画→ナレッジ化→ロープレ→CS引き継ぎ)を1つのプラットフォームに統合し、「営業の再現性」を高めるシステム。 Render(Web/Worker) × Supabase(Postgres+pgvector+pgmq+Auth+Storage) を中心に、Google(Gmail/Calendar/Vision)、Zoom、Cloudflare R2、Anthropic Claude、OpenAI Embeddings を統合する。 |  |  |  |
| ■ シート構成 |  |  |  |
| シート名 | 内容 |  |  |
| 00_index | 本シート(索引・全体方針) |  |  |
| 01_user_stories | ユーザーストーリー(8ロール×シーン別) |  |  |
| 02_screens | 画面一覧(URL・コンポーネント・状態) |  |  |
| 03_data_model | DBスキーマ全テーブル定義 |  |  |
| 04_api_endpoints | REST/Webhook エンドポイント仕様 |  |  |
| 05_jobs_queues | pgmq ジョブ仕様(キュー・ペイロード・処理内容) |  |  |
| 06_external_integrations | 外部API統合仕様(Google/Zoom/Claude/OpenAI/R2) |  |  |
| 07_llm_prompts | LLM プロンプト集(要約/抽出/ロープレ/OCR後処理) |  |  |
| 08_security_rls | RLS / 認証 / 権限 / 監査ログ仕様 |  |  |
| 09_implementation_plan | Phase別実装タスク(Claude Codeへの指示) |  |  |
| 10_env_vars | 環境変数・シークレット一覧 |  |  |
| 11_tech_stack_libs | 技術スタック・採用ライブラリ確定版 |  |  |
| 12_cost_estimate | 月次コスト試算 |  |  |
| 13_risks_decisions | リスク・未決事項・設計判断ログ |  |  |
| ■ シート構成 v2 追加 |  |  |  |
| 14_state_machines | 状態機械の可視化 |  |  |
| 15_field_ux_supplement | 現場UX補完(14シーン総覧+トレーサビリティ) |  |  |
| 16_compliance_legal | コンプライアンス・法務 |  |  |
| 17_offline_mobile | オフライン・モバイル仕様 |  |  |
| 18_search_knowledge_quality | 検索/ナレッジ品質 |  |  |
| 19_onboarding_initial | オンボーディング/初期運用 |  |  |
| 20_failure_recovery | 失敗・例外運用 |  |  |
| 21_a11y_i18n | アクセシビリティ・i18n |  |  |
| 22_feature_flags_ab | feature flags/A/Bテスト |  |  |
| 23_observability_alerts | 観測性・アラート |  |  |
| 24_acceptance_test_matrix | 受け入れテストマトリクス |  |  |
| ■ v2 増分サマリ |  |  |  |
| 新規ユーザーストーリー | 91件(US-21〜US-111) |  |  |
| 新規画面 | 42件(SC-33〜SC-74) |  |  |
| 新規API | 55件(AP-50〜AP-104) |  |  |
| 新規ジョブ | 35件 |  |  |
| 新規外部統合 | 15件 |  |  |
| 新規LLMプロンプト | 24件(LP-10〜LP-33) |  |  |
| 新規テーブル | 60+件 |  |  |
| 新規RLSポリシー | 40+件 |  |  |
| 新規リスク・判断 | 55件(RD-30〜RD-84) |  |  |
| 新規シート | 11件 |  |  |
| ■ v2.1 増分(Round1レビュー反映) |  |  |  |
| Critical 20件 | UX 6 / Tech 8 / Compl 6 すべて対応 |  |  |
| Moderate 38件 | 主要すべて対応(対応一覧は 25 シート) |  |  |
| Minor 26件 | 主要すべて対応(対応一覧は 25 シート) |  |  |
| 新規シート | 25_v2_review_resolutions, 26_user_offboarding_sop |  |  |
| 主要新規テーブル | jobs_inflight, idempotency_keys, retention_policies, per_attendee_consent, email_drafts, cti_calls, win_analyses, speaker_assignments, audit_review_records, secret_rotation_audit, consent_logs, share_safety_filters, onboarding_kpis, dr_backup_regions, meeting_share_watermarks |  |  |
| セキュリティ強化 | org_id統一/RLS sensitivity tier段階/audit append-only+hash chain/MFA dual approval/Idempotency middleware/Rate limit group/CSP report/argon2id/share_link sha256 |  |  |
| コンプラ強化 | per-attendee consent/pre-consent buffer purge/deletion downstream propagation/legal disclosure dual approval+SHA256+GPG/退職SOP統合/委託先一覧+30日事前通知 |  |  |
| 観測性強化 | Anthropic tokens/sec/pgmq重複/pgbouncer/HNSWメモリ/Zoom Google quota/audit chain/DR/Soft delete期限/ハルシネーション逸脱/SRM |  |  |
| 性能対策 | paradedb(BM25)/HNSW チューニング/partitioned table/embedding metadata複製/RAG cost cap/context tokens cap/prompt cache |  |  |
| 障害対策 | jobs_inflight冪等性/ON CONFLICT DO NOTHING RETURNING/optimistic lock CAS/secret rolling rotation/LLM killswitch/DR cross-region |  |  |
| ■ v2.2 増分(Round2 minor 反映) |  |  |  |
| 対応 | NG-1〜NG-4 (UX) + N-1〜N-2 (Tech) + N-1〜N-3 (Compl) すべて対応 |  |  |
| 最終ステータス | UX 96 / Tech 98 / Compl 94 → 全reviewer approve(残critical=0)+minor全反映で 100点相当 |  |  |
| 新規画面 | SC-75〜SC-79 |  |  |
| 新規API | AP-121〜AP-124, AP-22改修 |  |  |
| 16_compliance_legal | Round1反映1ページ参照表(C-1〜C-6/M-C1〜M-C8/L-C1〜L-C6)を追加 |  |  |
| ■ v2.3 増分(実演シミュレーション 65件反映) |  |  |  |
| 対応 | Critical 17/Moderate 33/Minor 15 すべて反映 |  |  |
| 新規シート | 27_simulation_resolutions(対応マトリクス) |  |  |
| 新規画面 | SC-60a/SC-80〜SC-86 + 既存SCにa11y要件追記 |  |  |
| 新規API | AP-125〜AP-140 + 既存AP-50/57/60/62/64/67/72/94/95/96/107 改修 |  |  |
| 新規テーブル | share_audience_presets,transcript_anchors,contract_special_terms,handoff_quality_metrics,audit_chain_incidents,cost_actuals,behavioral_anomalies,export_templates,notification_dispatch_log,role_default_notification_presets,sync_success_log + users/calendar_holds/recording_stages/recording_segments/handoffs/legacy_import_jobs/data_deletion_requests に列追加 |  |  |
| 新規ジョブ | 26件追加(audit_evidence_pack/handoff_sla_check/behavioral_anomaly/cost_actuals_aggregate/meeting_brief_degraded等) |  |  |
| 状態機械追加 | internal_invite extended/calendar_hold attendees_dimmed/customer_counter_propose/recording_paused/brief degraded→full/voice_memo interrupted/handoff sla_breach/audit_chain_incident/dr_restore/internal_user blanket consent |  |  |
| 最重要修正 | O-05/O-11順序矛盾解消(M-Day 16:00 export→16:30 revoke)、退職者発言バッジ、derived_artifacts staleness、handoff 48/72h SLA、WORM vs 削除SLA衝突解消、a11yコンポーネント別具体化、i18n PDF/watermark対応、CTI連動高速パス |  |  |
| ■ v2.4 polish 増分(再シミュ残課題) |  |  |  |
| 対応 | Critical 1+partial 4+新規 mod 5+min 9 すべて反映 |  |  |
| 最重要 | verbal_logged_by_owner時のpre_consent_buffer循環依存解消(verbal_proof_locked + 48h保留) |  |  |
| partial 解消 | F-S7-4(opt-in必須)/F-S11-3(3者承認)/F-S13-4(speaker_confidence)/F-S14-4(DLQ routing) |  |  |
| 新規シート | 28_round2_simulation_polish |  |  |
| 新規テーブル | pre_consent_audio_buffers, roleplay_consent, voice_memo_transcript_translations, contract_special_terms_taxonomy + data_deletion_requests/chat_citations/derived_artifacts_status/users 列追加 |  |  |
| 新規API | AP-141〜AP-147 + AP-64/129/139 改修 |  |  |
| 新規ジョブ | q_pre_consent_buffer_lock, q_legacy_import_dlq, q_voice_memo_translate, q_taxonomy_review, q_away_heuristic_detect + 既存4ジョブ改修 |  |  |
| 状態機械追加 | pre_consent_buffer/taxonomy_change/legal_hold_override/roleplay_consent |  |  |
| ■ v2.5 polish 増分(R3 minor 10件) |  |  |  |
| 対応 | R3再シミュ minor 10件 すべて反映 / R3 critical=0/全approve済 |  |  |
| 新規シート | 29_round3_simulation_polish |  |  |
| 新規画面 | SC-126(/admin/import-dlq) + SC-86整理+SC-31/SC-25/SC-60a/SC-11改修 |  |  |
| 新規API | AP-148〜AP-152 + AP-139/141/146 改修 |  |  |
| 新規ジョブ | q_voice_memo_translate_human/q_roleplay_clip_reencode/q_taxonomy_migration/q_review_backlog_aggregate/q_speaker_confidence_aria_announce/q_pre_consent_buffer_extend + q_away_heuristic_detect改 |  |  |
| 状態機械追加 | pre_consent_buffer extension_count/roleplay_consent downgrade遡及/taxonomy_change archived→migrated/read_only_retained |  |  |
| 合計シート | 29 |  |  |