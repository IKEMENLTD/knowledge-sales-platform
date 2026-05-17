# 15_field_ux_supplement

| 現場UX補完(14シーン総覧) |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 各シーンのギャップ→対応US/SC/AP/ジョブ/テーブルへのトレーサビリティ |  |  |  |  |  |  |  |
| シーン | ギャップ | 対応(US) | 対応(SC) | 対応(AP) | 対応(ジョブ) | 対応(テーブル) | 受け入れ条件 |
| S1: 名刺(現場) | 片手/暗所/反射 | US-21 | SC-33 | AP-50 | - | business_card_images | 暗所/反射時もOCR confidence>=0.7 or 確認UI |
| S1: 名刺(現場) | 両面名刺(QR) | US-22 | SC-33 | AP-50,AP-51 | - | business_card_images(side) | 裏面追加→1コンタクトに紐付け |
| S1: 名刺(現場) | 非名刺混入 | US-23 | SC-33 | AP-50(classification) | - | non_card_attachments | 非名刺はnon_card_attachmentsに格納+UI明示 |
| S1: 名刺(現場) | 会場検索 | US-24 | SC-35 | AP-55 | - | contacts(index) | オフライン優先で<200ms |
| S1: 名刺(現場) | オフライン取り込み | US-25 | SC-34 | AP-53,AP-54 | q_offline_sync | offline_queue | 100件まで保持・自動同期成功率99% |
| S1: 名刺(現場) | 音声/手書きメモ | US-26 | SC-33 | AP-52,AP-98 | q_voice_memo_transcribe | contact_memos,voice_memos | 60秒上限・文字起こし精度測定 |
| S1: 名刺(現場) | イベント一括タグ | US-27 | SC-33,SC-36 | AP-56 | q_event_tag_propagate | events,contact_event_tags | イベント選択→自動付与 |
| S1: 名刺(現場) | OCR誤認識 | US-28 | SC-08(改修) | AP-50(LP-10) | - | contacts | 低信頼度はハイライト・確認UI |
| S2: アポ取り | 上司同席合意 | US-29 | SC-37 | AP-57,AP-58,AP-59 | q_internal_invite_timeout | internal_attendee_invites | accept済みのみカレンダー登録 |
| S2: アポ取り | 業務時間外排除 | US-30 | SC-38 | AP-60,AP-61 | - | user_availability_settings | work_hours外は候補から除外 |
| S2: アポ取り | 顧客TZ | US-31 | SC-13(改修) | AP-60 | - | customer_timezones | 両TZ併記・ICS guest TZ |
| S2: アポ取り | 会議室予約 | US-32 | SC-10(改修) | AP-60 | - | meeting_rooms,room_reservations | onsiteは会議室付候補のみ |
| S2: アポ取り | オン/対面分岐 | US-33 | SC-10 | AP-60 | - | meetings.location_type | onsite住所必須+online自動Zoom |
| S2: アポ取り | Calendly風UI | US-34 | SC-39 | AP-60 | - | share_links | 顧客1クリック確定 |
| S2: アポ取り | 仮押さえ | US-35 | SC-10 | AP-62,AP-63 | q_calendar_hold_release | calendar_holds | 送信時hold→確定/解放 |
| S2: アポ取り | 重複アプローチ | US-36 | SC-10 | - | - | meeting_duplicates | 他営業接触履歴あり時に警告 |
| S2: アポ取り | 代理メール | US-37 | SC-40 | - | - | delegate_grants | scope限定+audit |
| S3: 返信パース | 全NG | US-38 | SC-41 | AP-65 | q_scheduling_redraft | scheduling_proposals | auto-redraft成功率>=80% |
| S3: 返信パース | 電話/訪問意図 | US-39 | SC-41 | AP-64 | - | email_intents | intent分類>=0.7信頼度で自動分岐 |
| S3: 返信パース | CC追加 | US-40 | SC-41 | AP-64 | - | email_intents,meeting_attendees | 検出時に確認UI |
| S3: 返信パース | 添付振り分け | US-41 | SC-44(改修) | - | - | email_attachments | NDA/RFP自動分類 |
| S3: 返信パース | 状態機械 | RD-65/US-104 | - | - | - | - | 14_state_machinesに準拠 |
| S3: 返信パース | 別スレッド | US-42 | SC-41 | - | - | thread_merge_log | References/Subjectで吸収 |
| S3: 返信パース | 確定後リスケ | US-43 | SC-11 | AP-66 | - | scheduling_proposals(state) | reschedule検出→専用フロー |
| S4: 商談直前/中 | ブリーフィング | US-44 | SC-42 | AP-67 | q_meeting_brief | meeting_briefs | 5分前push+ブリーフ画面 |
| S4: 商談直前/中 | Zoom 1クリック | US-45 | SC-42 | - | - | meetings.zoom_join_url | deep link |
| S4: 商談直前/中 | 録画自動開始 | US-46 | SC-11 | - | q_meeting_recording_force | recordings | auto_record強制+5分後検査 |
| S4: 商談直前/中 | 当日同席変更 | US-47 | SC-11 | - | - | meeting_attendees | リアルタイム反映 |
| S4: 商談直前/中 | 未登録話者 | US-48 | SC-11 | - | - | recording_segments(speaker_id) | 後で命名→学習 |
| S4: 商談直前/中 | 商談中検索 | US-49 | SC-43 | AP-94 | - | - | 期限付きURL+閲覧ログ |
| S4: 商談直前/中 | 録画長乖離 | US-50 | - | - | - | recordings | 延長/短縮を自動扱い |
| S5: 商談後 | 段階処理 | US-51 | SC-11 | - | q_recording_stage1/2/3 | recording_stages | stage1<=5分通知 |
| S5: 商談後 | インライン編集 | US-52 | SC-17(改修) | - | - | recording_segments | 検索結果から編集 |
| S5: 商談後 | PIIマスキング | US-53 | SC-31 | - | q_pii_redaction | pii_redactions | 共有時自動マスク |
| S5: 商談後 | sensitive化 | US-54 | SC-16 | AP-69 | - | recording_segments(sensitivity) | 削除せず非公開 |
| S5: 商談後 | 重なり発話 | US-48,US-50 | SC-11 | - | - | recording_segments(overlap) | 色分け表示 |
| S5: 商談後 | 顧客向け要約 | US-55 | SC-44 | AP-71 | q_external_summary | external_summaries | 社内メモ抜き |
| S6: クレーム | 30秒UX | US-56 | SC-45 | AP-72 | q_quick_search_cache | - | 顧客名→Top3<3秒 |
| S6: クレーム | 曖昧時系列 | US-57 | SC-17 | AP-94 | - | - | 「○年○月頃」をdate range |
| S6: クレーム | 前後3分 | US-56 | SC-16 | - | - | - | preview window=t±180s |
| S6: クレーム | クリップ送信 | US-58 | SC-46 | AP-68 | - | recording_clips | 期限付き+透かし |
| S6: クレーム | 商談紐付け | US-59 | SC-54 | AP-73 | q_complaint_link | complaints,complaint_meeting_links | 関連商談履歴に表示 |
| S7: ロープレ | シナリオ多様化 | US-60 | SC-21(改修) | - | - | roleplay_scenario_variants | 乱択+履歴重複回避 |
| S7: ロープレ | 時間制限 | US-61 | SC-21 | - | - | roleplay_sessions(time_limit) | 残時間バー |
| S7: ロープレ | 降参モード | US-62 | SC-21 | - | - | - | Hint API |
| S7: ロープレ | リアル割り込み | US-63 | SC-47 | AP-75 | - | - | 本人合意要 |
| S7: ロープレ | 失敗パターン | US-64 | SC-48 | - | q_roleplay_failure_aggregate | roleplay_failure_patterns | 月次レポート |
| S7: ロープレ | 発話タイミング | US-65 | SC-22 | - | - | roleplay_voice_metrics | 間/被り計測 |
| S7: ロープレ | 録画→シナリオ | US-66 | SC-16,SC-21 | AP-74 | - | - | ペルソナ自動抽出 |
| S8: マネージャー | 受注率診断 | US-67 | SC-49 | AP-76 | - | - | 週次AI診断 |
| S8: マネージャー | トップ表現共有 | US-68 | SC-50 | - | - | top_performer_phrases | 本人合意済のみ |
| S8: マネージャー | 製品説明統一 | US-69 | SC-51 | - | - | product_positioning_phrases | 承認制 |
| S8: マネージャー | 個人スコア配慮 | US-70 | SC-25(改修) | - | - | - | 集計デフォルト |
| S8: マネージャー | 失注分析 | US-71 | SC-52 | AP-77 | - | loss_analyses | 業界×反論クロス |
| S9: 引き継ぎ | 認識ズレ | US-72 | SC-23(改修) | AP-78 | - | alignment_reports | CS→営業エスカレ |
| S9: 引き継ぎ | CS予習 | US-73 | SC-53 | AP-79 | - | - | ハイライトクリップ |
| S9: 引き継ぎ | 更新3M前 | US-74 | SC-73 | - | q_renewal_alerts | contract_renewals | 日次job |
| S9: 引き継ぎ | アップセル | US-75 | SC-73 | - | q_upsell_detect | upsell_signals | CS会話シグナル |
| S10: 失敗運用 | メールundo | US-76 | SC-13(改修) | AP-80,AP-81 | q_email_undo_finalize | email_undo_tokens | 30秒バッファ |
| S10: 失敗運用 | Soft delete | US-77 | SC-55 | AP-82 | q_soft_delete_purge | - | 30日内復旧 |
| S10: 失敗運用 | AIやり直し | US-78 | SC-16 | AP-70 | - | - | モデル選択 |
| S10: 失敗運用 | 同期失敗バッジ | US-79 | - | - | - | sync_failure_log | UI badge |
| S10: 失敗運用 | 権限申請動線 | US-80 | SC-70 | AP-84 | - | permission_requests | 403時に申請 |
| S10: 失敗運用 | モバイル断線 | US-81 | SC-71 | - | - | autosave_drafts | 5秒間隔 |
| S10: 失敗運用 | 事故削除 | US-82 | SC-56 | AP-83 | q_pitr_snapshot | backup_status | MFA+reason+PITR 7日 |
| S10: 失敗運用 | 2デバイス衝突 | US-83 | SC-74 | AP-85 | - | optimistic_lock_versions | mergeダイアログ |
| S11: コンプラ | 録画同意 | US-84 | SC-11 | AP-86 | q_consent_check,q_recording_consent_violation | meeting_consent_captures | 冒頭5分で確認 |
| S11: コンプラ | 削除依頼 | US-85 | SC-60 | AP-87 | q_deletion_request_review | data_deletion_requests | 30日SLA |
| S11: コンプラ | 退職者発言 | US-86 | SC-57 | AP-89 | q_anonymize_ex_employee | ex_employee_speech_policies | retain/anon/delete選択 |
| S11: コンプラ | 法的開示 | US-87 | SC-58 | AP-88 | q_legal_export | legal_disclosure_requests | チェーンオブカストディ |
| S11: コンプラ | 保管地域 | US-88 | - | - | - | data_residency_config | ap-northeast-1 |
| S12: オンボード | 初日 | US-89 | SC-61 | - | - | sample_data_seeds | guided tour 7ステップ |
| S12: オンボード | 名刺移行 | US-90 | SC-62 | AP-90 | q_legacy_import | legacy_import_jobs | CSV/Sansan/Eight |
| S12: オンボード | 録画移行 | US-91 | SC-63 | AP-91 | q_zoom_historical_import | zoom_historical_imports | 期間指定 |
| S12: オンボード | 新人推奨 | US-92 | SC-64 | AP-92 | - | onboarding_recommendations | ロール別 |
| S13: 検索品質 | 最近見たもの | US-93 | SC-73 | AP-93 | q_recent_view_log | recent_views | 直近50 |
| S13: 検索品質 | ハイブリッド順位 | US-94 | SC-17 | AP-94 | q_search_index_rebuild | search_ranking_logs | bm25*0.4+vec*0.4+rec*0.2 |
| S13: 検索品質 | 古い情報 | US-95 | SC-17 | - | - | knowledge_deprecations | badge+filter |
| S13: 検索品質 | ハルシネーション | US-96 | SC-18 | AP-95 | q_hallucination_audit | chat_citations | 出典必須 |
| S13: 検索品質 | 自分宛 | US-97 | SC-17 | AP-94(speaker_filter) | - | - | 話者切替 |
| S14: モバイル | オフライン議事録 | US-98 | - | - | - | service_worker_cache_manifest | 直近10件キャッシュ |
| S14: モバイル | 音声報告 | US-99 | SC-72 | AP-98 | q_voice_memo_transcribe | voice_memos | 60秒上限 |
| S14: モバイル | プッシュ通知 | US-100 | SC-66 | AP-102 | q_push_dispatch | push_subscriptions | 返信/15分前 |
| S14: モバイル | 片手UI | US-101 | - | - | - | - | bottom_action_bar標準 |
| X: 横断 | データエクスポート | US-102 | SC-67 | AP-96 | - | data_exports | 暗号化zip |
| X: 横断 | PITR | US-103 | SC-59 | AP-97 | q_pitr_snapshot | backup_status | 7日窓 |
| X: 横断 | 状態機械可視化 | US-104 | - | - | - | - | 14_state_machinesシート |
| X: 横断 | i18n | US-105 | - | AP-104 | - | i18n_messages | ja/en |
| X: 横断 | a11y | US-106 | - | - | - | accessibility_audits | WCAG AA |
| X: 横断 | ブラウザ通知 | US-107 | SC-66 | AP-102 | - | push_subscriptions | Service Worker |
| X: 横断 | リアルタイム | US-108 | - | AP-103 | q_realtime_state_broadcast | realtime_presence | Supabase Realtime |
| X: 横断 | ヘルプ・FAQ | US-109 | SC-65 | AP-99 | - | help_articles | intercom-like or 内製 |
| X: 横断 | FF | US-110 | SC-68 | AP-100 | q_ff_rollout_check | feature_flags | percentage rollout |
| X: 横断 | A/Bテスト | US-111 | SC-69 | AP-101 | q_ab_test_result | ab_test_* | SRM check |