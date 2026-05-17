# 27_simulation_resolutions

| 実演シミュレーション 65件の対応一覧(v2.3) |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ペルソナ実演で見つかった摩擦点(Crit 17/Mod 33/Min 15)の対応マトリクス |  |  |  |  |  |  |  |
| # | ID | Severity | Scene/Persona | 摩擦 | 対応(v2.3) | 関連シート/テーブル/API | ステータス |
| 1 | F-S1-1 | CRIT | S1 田中/満員電車 | 片手×揺れでAutoShutter不発、手動シャッターのリーチが片手で届かない | SC-33にfallback_capture_mode追加(volume_button_shutter/long_press_shutter/voice_command/3秒静止緩和)。SC-76 handedness設定をP1昇格。揺れ検知時はAutoShutter静止判定3秒→1秒に動的緩和 | SC-33,SC-76(P1昇格) | 対応 |
| 2 | F-S1-2 | MOD | S1 田中 | 低信頼度名刺の確認UIが必須化されモバイル中の流れが止まる | AP-50にstatus='deferred_review'追加、モバイル側は赤バッジだけで即次撮影、/contacts/import に未レビュー◯件バッジ+SC-08 batch_review_modeへdeeplink | AP-50,SC-06,SC-08 | 対応 |
| 3 | F-S1-3 | MOD | S1 田中 | 取込開始時にイベントタグ忘れ→後付け一括の動線無し | SC-04 BulkActionsに『選択中のコンタクトにイベントタグ付与』、SC-33ヘッダーチップで取り込み中もイベント切替可 | SC-04,SC-33 | 対応 |
| 4 | F-S1-4 | MIN | S1 田中 | 裏面ありますかのプロンプトが毎回出てだるい | AP-51でQR自動プリスキャン→QR検出時のみBackSideAddプロンプト。設定で『常に確認/QR検出時のみ/聞かない』を選択可 | SC-33,AP-51 | 対応 |
| 5 | F-S2-1 | CRIT | S2 佐々木 | 上司invite timeout=2h固定で出張中に詰む | timeoutをdynamic化(出張中=24h, 通常=4h, 緊急=2h)。declined後one-tapリインバイト。AP-57にdeadline_overrideを追加。INTERNAL_INVITE_TIMEOUT_HOURSをロール/状態別ポリシーに | AP-57,internal_attendee_invites,10_env_vars | 対応 |
| 6 | F-S2-2 | CRIT | S2 佐々木 | calendar_holdsが同席者カレンダーに5枠表示→上司激怒 | calendar_holdsはGoogle Calendar transparency='transparent'(busyブロックしない)で作成、タイトル='[仮]商談調整中'、本人と同席者で見え方を切替、calendar_holdsにhold_visibility列+hold_title列追加 | calendar_holds,AP-62 | 対応 |
| 7 | F-S2-3 | MOD | S2 佐々木 | work_hours未設定attendee混入時の挙動不明 | AP-60にfallback仕様明記、AvailabilityPreviewに警告チップ+デフォルト適用範囲明示。SC-38で初回時+移行時に強制設定prompt | AP-60,SC-38 | 対応 |
| 8 | F-S2-4 | MOD | S2 佐々木 | 顧客側からの確定後リスケ動線無し+DST警告無し | SC-39に確定後『日程変更を依頼』ボタン→AP-64のcounter_propose intent経由で営業に通知。DST遷移日のスロットには注意アイコン | SC-39,AP-64,LP-12 | 対応 |
| 9 | F-S2-5 | MIN | S2 佐々木 | AP-57の発火点不明で不安 | AP-57は『scheduling_proposal送信時のみ発火』を明記。AttendeesPickerにツールチップ『送信時に同席依頼が送られます』 | AP-57,SC-10 | 対応 |
| 10 | F-S3-1 | CRIT | S3 山田 | 9件inbox優先順序不明、新人が固まる | SC-14デフォルトソート『信頼度高×受信古い順』固定。新人(role=new or 入社<3M)はconfidence>=0.85件をハイライト+1タップ確定。残りはガイド付きwalkthrough | SC-14,users(new_user_until) | 対応 |
| 11 | F-S3-2 | CRIT | S3 山田 | phone/visit/unrelated意図検出後の業務フロー無し | AP-64レスポンスにsuggested_action列(reply_with_phone_template/convert_to_visit_meeting/mark_unrelated/escalate_to_manager)。SC-41にintent別アクションボタン+対応テンプレ | AP-64,SC-41,LP-12 | 対応 |
| 12 | F-S3-3 | MOD | S3 山田 | CC追加検出時、未登録メアドのcontact化判断不能 | 未登録CCはmeeting_attendeesにexternal_email='xxx'で一時保存(contact未作成)、商談確定時にcontact化prompt。RLSで『external_emailは商談オーナーのみ閲覧』 | meeting_attendees(改),08_security_rls | 対応 |
| 13 | F-S3-4 | MOD | S3 山田 | redraft完了とneeds_human時のManualResolveDialog曖昧 | ManualResolveDialogに手動intent選択+slot手動入力+メモを標準化。redraft完了時にinbox該当行を自動展開しプレビュー表示 | SC-14,SC-41,AP-65 | 対応 |
| 14 | F-S3-5 | MIN | S3 山田 | NDA/RFP分類後の人間ワークフロー無し | feature flagでSlack通知ルート(NDA→#legal、RFP→#deals-large)。SC-44にescalation設定UI | SC-44,feature_flags | 対応 |
| 15 | F-S4-1 | CRIT | S4 佐々木 | live-search別タブとZoom画面共有のコンフリクト | SC-43を別ウィンドウ(window.open popup)で開き、共有URLは検索結果からドラッグ&ドロップでZoomチャットへ。iPad/別端末向けcompanion mode検討。Zoom Apps SDK統合をP3に追加 | SC-43,11_tech_stack_libs | 対応 |
| 16 | F-S4-2 | CRIT | S4 佐々木 | per-attendee consent dialogの配信手段未定義 | Zoom Apps SDKでin-Zoom dialogを第一選択、未対応はメール+ワンタイムリンク、緊急時は口頭同意+営業押下(captured_via='verbal_logged_by_owner')。各captured_viaの法的有効性を16_compliance_legalで明記 | AP-86,AP-106,16_compliance_legal | 対応 |
| 17 | F-S4-3 | MOD | S4 佐々木 | 社内ユーザーにもper-attendee consent dialogが毎回出るのは過剰 | users.consent_blanket_for_internal_meetings=true をonboarding step6に追加。社内ユーザーはlate_join_pending→capturedをblanket consentで自動migrate | users(改),SC-66 | 対応 |
| 18 | F-S4-4 | MOD | S4 佐々木 | q_meeting_briefが5分前トリガで失敗すると間に合わない | q_meeting_briefを15分前トリガに前倒し+縮退版brief(過去要約のみ、AI抽出なし)を即時生成しキャッシュ。5分前で完全版差し替え。失敗時は縮退版表示+エラーログ | q_meeting_brief,meeting_briefs(degraded_version) | 対応 |
| 19 | F-S4-5 | MOD | S4 佐々木 | 録画停止のライブ即時警告無し | Zoom Webhook recording.pausedで30秒以内Push+SMS。BriefCard右上に録画状態ライブインジケータ | q_meeting_recording_force,SC-42 | 対応 |
| 20 | F-S5-1 | CRIT | S5 田中 | インライン編集後の派生成果物のstaleness表示無し | meetings.derived_artifacts_status (summary_v, handoff_v, embeddings_v, last_edit_at) をテーブル化。SC-11上部に『AI修正後の再生成ステータスバナー』。external-summary/handoff発行ボタンはpending時にdisable+理由表示 | meetings(改),SC-11 | 対応 |
| 21 | F-S5-2 | CRIT | S5 田中 | stage1/2/3ETA表示無し | recording_stagesにestimated_completion_at列追加(p95から動的算出)。SC-11にprogress bar+ETA。stage3未完了でも external-summary/handoff が部分生成できるflag追加 | recording_stages,SC-11 | 対応 |
| 22 | F-S5-3 | MOD | S5 田中 | 社内/社外のマスキング切替UIが分散 | share dialogにaudience selector(internal/customer/legal/external_partner)を統一配置。audience別pre-set(redact/exclude_internal/exclude_sensitive/pii_visible)テンプレをadminで管理 | share_audience_presets(新),SC-44,SC-46 | 対応 |
| 23 | F-S5-4 | MOD | S5 田中 | speaker未命名のUI曖昧 | SC-11 TranscriptTimelineにspeaker_chip(クリック→meeting_attendees候補ドロップダウン+『他の人』フリーテキスト)。同一voice_embeddingに以後自動命名 | SC-11,speaker_assignments(改) | 対応 |
| 24 | F-S5-5 | MIN | S5 田中 | 商談後タスクのTodoList自動連携無し | meetings.post_meeting_checklistを自動生成(clip_create/external_summary_send/handoff_submit)、SC-03 TodoListに連携。離席15分でPush『未完了商談タスク◯件』 | meetings(改),SC-03 | 対応 |
| 25 | F-S5-6 | MIN | S5 田中 | share_token expires_in defaultが見えない | 組織設定にdefault_share_expires_in(初期7d, 上限30d)。audience別推奨値(internal=30d, customer=7d, partner=24h) | share_links(改),16_compliance_legal | 対応 |
| 26 | F-S6-1 | CRIT | S6 高橋/電話中 | 顧客スコープ固定の発言検索ペイン無し→グローバル検索からフィルタ再構築で30秒UX破綻 | SC-01 顧客カードに『顧客スコープ固定の発言検索ドロワ』追加。CTI着信時にautofocus。AP-72にcustomer_id必須の高速パス | SC-01,SC-45,AP-72 | 対応 |
| 27 | F-S6-2 | CRIT | S6 高橋 | 退職者発言バッジ無し→現役発言と同等扱いで誤回答リスク | contact lifecycle state machineにformer_employee_utteranceフラグ伝搬。SC-43ヒット表示で退職者発言は黄色警告+承継状態(承継済/未承継)+後任リンクを必須表示 | 14_state_machines,SC-43,recording_segments(改) | 対応 |
| 28 | F-S6-3 | MOD | S6 高橋 | ヒットスニペットの前後文脈量と再生開始位置が未仕様 | 検索結果カードに前30秒/ヒット/後15秒の三段スニペット必須化。ワンクリック『前文脈再生』ボタン | SC-43,18_search_knowledge_quality | 対応 |
| 29 | F-S6-4 | MOD | S6 高橋 | share_safety_filter拒否理由非表示でCSが手詰まり | 拒否時に分類ラベル(sensitive: 価格交渉/個人情報など)+approval_request導線。AP-107にdeny_reason付きレスポンス | AP-107,SC-43 | 対応 |
| 30 | F-S7-1 | CRIT | S7 渡辺/新人 | AI生成中の進捗・コストキャップ到達時の挙動が不透明、固まったように見える | LLMジョブにETA(秒)+stage(transcribe/score/feedback)をUIへpush。$0.10cap到達時は『簡易版に切替』を明示。SSEイベントprogress追加 | 23_observability_alerts,AP-95(SSE),roleplay_sessions(改) | 対応 |
| 31 | F-S7-2 | MOD | S7 渡辺 | 録音中断/再開がロープレ評価上1セッションか別か不明 | ロープレsession_idを録音stateに紐付け、最大15分/中断1回まで同一セッション、それ以上は再受験フラグ | roleplay_sessions(改),14_state_machines | 対応 |
| 32 | F-S7-3 | MOD | S7 渡辺 | フィードバック12項目で新人が圧倒される | feedback itemにseverity(High/Med/Low)とsuggested_next_actionを必須出力。トップ3だけ初期表示、残りはfold | LP-05/06 zod schema改修 | 対応 |
| 33 | F-S7-4 | MIN | S7 渡辺 | 本人による自分の評価データ共有がshare_safety_filterで止まる | owner_self_share=true の場合 sensitive判定でも warning+continue を許可。audit_logに記録 | 08_security_rls,share_safety_filters(改) | 対応 |
| 34 | F-S8-1 | CRIT | S8 鈴木/15分 | 8名×案件を15分で見るのは物理無理、優先度提示無し | ダッシュボード冒頭に『今週の注目案件Top5/部下Top3』をLLM+ルールで生成。根拠(金額×確度変化×停滞日数)を必ず併記 | SC-25,LP-32(改),AP-76 | 対応 |
| 35 | F-S8-2 | CRIT | S8 鈴木 | 観戦の事前合意UI欠落、本人バッジだけだと心理的安全性崩壊 | 入社時/月次更新で『マネージャー観戦同意レベル(常時/事前通知/個別承認)』を本人選択。観戦開始は本人選好に従い、すべてaudit_logsに記録 | users.observation_consent_level(新),SC-21,SC-66 | 対応 |
| 36 | F-S8-3 | MOD | S8 鈴木 | AI予測値の信頼区間/根拠表示無し | 予測APの zod 出力にprob_low/prob_high/top_factors[]を必須化、UI上で常時表示 | LP-32(改),SC-25 | 対応 |
| 37 | F-S8-4 | MOD | S8 鈴木 | 部下の活動量急変などhuman anomaly検知無し | behavioral anomaly job(週次)を05_jobs_queuesに追加。暗黙的指標でなく本人にも可視化(透明性原則)。本人/上長の二者通知 | q_behavioral_anomaly(新),behavioral_anomalies(新),23_observability_alerts | 対応 |
| 38 | F-S9-1 | CRIT | S9 中村 | handoff受領SLA/未受領エスカレが状態機械に無く宙に浮く | handoffに『48h未acceptで上長cc/72hでマネージャー強制割当』のSLA追加。q_handoff_sla_check job | 14_state_machines,handoffs(改),q_handoff_sla_check(新) | 対応 |
| 39 | F-S9-2 | CRIT | S9 中村 | 特殊条件taxonomy未整備で自由記述に流れCSが見落とし | contract_special_terms enum(billing_cycle/delivery/contact_freq/sla/legal_clause/other)+each に required_action_owner と due_date 必須化 | contract_special_terms(新),03_data_model | 対応 |
| 40 | F-S9-3 | MOD | S9 中村 | handoff自動収集の選別ロジック不透明、欠落理由非表示 | handoff_bundleにexcluded_items[]とreason(low_confidence/sensitive/expired)を必須出力。UIで開閉表示 | handoffs(改),AP-79 | 対応 |
| 41 | F-S9-4 | MOD | S9 中村 | 録画タイムスタンプ⇔資料の双方向リンク弱い | transcript_anchorにrelated_artifact_ids[]のリレーション。AP系でtranscript_anchor.attach(artifact_id)を提供 | transcript_anchors(新),AP系 | 対応 |
| 42 | F-S9-5 | MIN | S9 中村 | 引き継ぎ品質と6ヶ月後継続率の相関無く改善ループ無し | handoff_quality_score(自動)×churn_at_6mを四半期ダッシュ。本人にもフィードバック | handoff_quality_metrics(新),24_acceptance_test_matrix | 対応 |
| 43 | F-S10-1 | CRIT | S10 小林 | soft delete超過後のPITR管理者UIブラックボックス | 管理コンソールにrestore_request画面新設、dual approval workflow(admin+legal)+ETA表示。結果はaudit_logs+メール通知 | SC-78(/admin/dr 改修),AP-83(改) | 対応 |
| 44 | F-S10-2 | CRIT | S10 小林 | 監査エビデンス手作業で5時間+ | audit_evidence_pack(月次自動): hash chain整合性/退職者last access/external送信summary/cost top10/incidentsを1PDF+SHA256+GPG署名で出力 | q_audit_evidence_pack(新),AP-125(新) | 対応 |
| 45 | F-S10-3 | MOD | S10 小林 | audit_logs hash chain破断のincident closeフロー未定義 | audit_chain_incidentsテーブル+ステータス(detected→investigating→closed)、closeにdual approval必須、紐付RCAリンク | audit_chain_incidents(新) | 対応 |
| 46 | F-S10-4 | MOD | S10 小林 | per-user/per-teamコスト実績ダッシュ未整備 | 管理ダッシュにcost_actuals(by user/team/feature)+前月比/cap到達率を表示。Top3 over capで自動Slack | cost_actuals(新),SC-29(改修) | 対応 |
| 47 | F-S10-5 | MIN | S10 小林 | DSAR/外部委託送信ログのテナント単位抽出AP無し | admin_export_external_usage(org_id, period, vendor)を追加。権限admin+legal dual | AP-126(新) | 対応 |
| 48 | F-S11-1 | CRIT | S11 横田 | WORM 7年保持 vs 削除SLA 30日 衝突解消ルール無し | audit_logsはPIIマスキング前提でWORM保管(unmaskは別チャネル)を明文化。data_deletion_requests.rejection_reason_codeにworm_retention_required/legal_hold/identity_verification_failed enum追加 | 16_compliance_legal,data_deletion_requests(改) | 対応 |
| 49 | F-S11-2 | MOD | S11 横田 | admin側削除依頼レビュー画面が02_screens未定義 | SC-60a /admin/deletion-requests 新設。ticket一覧/30日SLAカウントダウン/identity verification UI/rejection enum/downstream_propagation_status可視化 | SC-60a(新) | 対応 |
| 50 | F-S11-3 | MOD | S11 横田 | dual_approver_idsに役割制約無し | legal_disclosure_requests.dual_approver_ids の片方は role='legal' 必須。RLS+UIバリデーションで強制 | legal_disclosure_requests(改),08_security_rls | 対応 |
| 51 | F-S11-4 | MIN | S11 横田 | identity_verification_method の値未定義 | enum: email_loopback / signed_pdf / id_document / share_token_originator | data_deletion_requests(改) | 対応 |
| 52 | F-S12-1 | CRIT | S12 島田/退職 | O-05 OAuth revoke と O-11 export の順序矛盾(revoke前にexport要) | O-11をM-Day 16:00(revoke前)に前倒し。Zoom録画など外部API依存データはここで完全DLしてからO-05実行を順序保証として明記 | 26_user_offboarding_sop(改) | 対応 |
| 53 | F-S12-2 | MOD | S12 池田 | 名寄せロジックとresume挙動が未定義 | legacy_import_jobsにstaged_state(field_mapping_json/dedupe_keys/cursor)。matching key priority(email>phone>company+name)を明示。merge_undo_window=72hを規定 | legacy_import_jobs(改) | 対応 |
| 54 | F-S12-3 | MOD | S12 佐藤 | オンボ初日にロープレStep5が辛い | sample_data_seedsにroleplay_audio=合成音声/dummy_company付与を明記。新人パスでStep5は『見るだけ』モードをデフォルトに | sample_data_seeds(改),SC-61 | 対応 |
| 55 | F-S12-4 | MIN | S12 佐藤 | 通知設定にロール別プリセット無し | role_default_notification_presets テーブル。初日サインアップ時にroleでlookupして適用 | role_default_notification_presets(新),SC-66 | 対応 |
| 56 | F-S13-1 | MOD | S13 西村 | chat citation→該当録画timestampへのdeep link仕様欠落 | chat_citationsに{meeting_id, segment_id, t_start_ms, t_end_ms}必須化。UIで出典タップ→/recordings/[id]?t=mm:ssに遷移 | chat_citations(改),AP-95 | 対応 |
| 57 | F-S13-2 | MOD | S13 西村 | deprecatedナレッジのデフォルト除外ポリシー未明記 | 検索初期値exclude_deprecated=true、上部にtoggle+件数バッジ。検索クエリにdeprecatedが明示的に含まれる場合のみfalseに自動切替 | SC-17,AP-94 | 対応 |
| 58 | F-S13-3 | MOD | S13 西村 | 日時パース±2週が現場感覚に合わない | 曜日明示(『先週月曜』)はピンポイント±0、月単位(『先月』)±1ヶ月、相対(『最近』)±2週、と粒度別に許容幅を定義 | LP-22(改) | 対応 |
| 59 | F-S13-4 | MIN | S13 西村 | speaker未ラベリング録画のspeaker_filter挙動未定義 | speaker_status='pending'は結果に含めるが結果UIにバッジ表示+ヒント『この録音は話者識別中です』 | AP-94,SC-17 | 対応 |
| 60 | F-S14-1 | CRIT | S14 島田 | is_active=false時のIndexedDB暗号化データwipe条件不明 | M-18 wipeトリガに(a)logout (b)is_active=false検知時の次回SW boot (c)session-bound key TTL切れ を明記。O-06に『退職者デバイスの強制リモートwipe確認』を追加 | 17_offline_mobile,26_user_offboarding_sop | 対応 |
| 61 | F-S14-2 | MOD | S14 島田 | 録音割込み再開フローで音声連結方式未定義 | voice_memos.segments[]として分割保存、再開後segmentを追加。最終transcribeで連結して1本のtranscriptに。UIで『中断点』を波形に表示 | voice_memos(改),17_offline_mobile | 対応 |
| 62 | F-S14-3 | MOD | S14 島田 | オフラインキュー成功時のフィードバック非対称 | sync_success_badge(toast: 同期完了 N件)を追加。過剰通知抑制でthrottle 10秒/件単位bundle | 17_offline_mobile,sync_success_log(新) | 対応 |
| 63 | F-S14-4 | MIN | S14 池田 | SC-63 Zoom historicalのrate limit fallback未定義 | q_zoom_historical_importにexponential backoff+残り本数表示+失敗本数のretry queue UI(SC-63)を仕様化 | q_zoom_historical_import(改),SC-63 | 対応 |
| 64 | F-UX-1 | CRIT | 横断 Mr. Chen | i18nがUI文言中心、PDF/watermark/メールテンプレ未対応 | export_templates(locale, kind='pdf|email|watermark', body)テーブル定義。share/[token]のロケール解決ルール(token原作成者locale or recipient Accept-Language)を明記 | export_templates(新),21_a11y_i18n | 対応 |
| 65 | F-UX-2 | CRIT | 横断 川島 | a11y要件がコンポーネント単位で未具体化 | 02_screensに各SCの『a11y要件』列追加し、role/aria-label/aria-live/focus trap対象を明記。dashboardロード時はoff→操作後polite、3件以上はサマリ→詳細onデマンド | 02_screens(改),21_a11y_i18n | 対応 |
| 66 | F-UX-3 | MOD | 横断 島田 | 個人エクスポートの対象範囲・パスフレーズ受取手段未定義 | export_request_formに対象種別チェックボックス(contacts/meetings/recordings_audio/recordings_video/notes/voice_memos)、パスフレーズはSMS or 別メールアドレスへ送付の二経路、export_url有効期限7d | SC-67(改),AP-96(改),data_exports(改) | 対応 |
| 67 | F-UX-4 | MOD | 横断 全員 | クロスチャネル通知の重複抑制ルール無し | notification_dispatch_log(event_id, channel, dispatched_at)。同event_idは優先channel(Push>Slack>Email)で5分以内の重複抑制。ユーザ設定にchannel優先順位ピッカー追加 | notification_dispatch_log(新),SC-66 | 対応 |
| 68 | F-UX-5 | MIN | 横断 西村 | help_articlesの初期コンテンツseed規定なし | help_articles_seed.md作成、最低20記事(オンボ/検索/通知/録音同意/退職/feature flag/i18n/エクスポート等)をP1リリース時に投入する受入条件を24に追加 | help_articles(改),24_acceptance_test_matrix | 対応 |
| ■ v2.4 partial 解消マーク |  |  |  |  |  |  |  |
| F-S7-4: opt-in必須化(28シート#2)で完全解消 |  |  |  |  |  |  |  |
| F-S11-3: 3者承認(28シート#3)で完全解消 |  |  |  |  |  |  |  |
| F-S13-4: speaker_confidence表示(28シート#4)で完全解消 |  |  |  |  |  |  |  |
| F-S14-4: DLQ routing+SC-86(28シート#5)で完全解消 |  |  |  |  |  |  |  |