# 14_state_machines

| 状態機械の可視化 |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| 商談・調整・録画・ロープレ・引き継ぎ・録画同意の状態遷移を明文化(実装と乖離検知の基準) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| scheduling_proposal | initial | proposed | 営業がドラフト送信 | Gmail送信+calendar_holds作成 | P2 |
| scheduling_proposal | proposed | awaiting_reply | 送信完了 | 返信パースwatch | P2 |
| scheduling_proposal | awaiting_reply | confirmed | accept意図検出+1候補で確定 | Calendar+Zoom作成,他holds解放 | P2 |
| scheduling_proposal | awaiting_reply | needs_human | 低信頼度/曖昧 | SC-14 inboxに表示 | P2 |
| scheduling_proposal | awaiting_reply | redraft | all_no_propose検出 | LP-14で再ドラフト | P2 |
| scheduling_proposal | awaiting_reply | reschedule | reschedule検出(既存予定あり) | 既存meeting更新 | P2 |
| scheduling_proposal | confirmed | rescheduled | リスケ要望 | 新候補メール送信 | P2 |
| scheduling_proposal | any | cancelled | 営業キャンセル/顧客辞退 | calendar/zoom削除+holds解放 | P2 |
| scheduling_proposal | awaiting_reply | timed_out | 48h無返信 | リマインド送信→holds解放 | P2 |
| meeting | scheduled | in_progress | Zoom開始 | 録画自動開始要求 | P1 |
| meeting | in_progress | ended | Zoom終了 | stage1キュー | P1 |
| meeting | scheduled | cancelled | キャンセル | calendar/zoom削除 | P1 |
| meeting | ended | summarized | stage3完了 | 引き継ぎ可能化 | P1 |
| recording | queued | stage1_transcript | stage1完了 | 通知+検索可 | P1 |
| recording | stage1_transcript | stage2_preview | stage2完了 | 通知 | P1 |
| recording | stage2_preview | stage3_full | stage3完了 | 通知+ナレッジ化 | P1 |
| recording | any | failed | エラー | DLQ+admin通知 | P1 |
| recording | stage3_full | reprocessing | reprocess要求 | stage1からやり直し | P2 |
| internal_invite | invited | accepted | invitee承諾 | carcalendar登録 | P2 |
| internal_invite | invited | declined | invitee辞退 | 候補から除外 | P2 |
| internal_invite | invited | timed_out | 2h無回答 | declinedとして扱う | P2 |
| calendar_hold | held | confirmed | scheduling confirm | 本予定化 | P2 |
| calendar_hold | held | released | 他候補確定/timeout | 予定削除 | P2 |
| email_undo | pending | sent | 30秒経過 | Gmail send | P2 |
| email_undo | pending | cancelled | ユーザundo | 下書き戻す | P2 |
| roleplay_session | running | completed | 通常終了 | 評価生成 | P3 |
| roleplay_session | running | gave_up | 降参モード | コーチコメント | P3 |
| roleplay_session | running | timed_out | 制限超過 | 強制終了+部分評価 | P3 |
| handoff | draft | review | 営業送信 | CS通知 | P2 |
| handoff | review | approved | CS承認 | 契約紐付け | P2 |
| handoff | review | rework | CS差戻し | 営業に通知 | P2 |
| consent_capture | not_captured | captured | 同意取得 | 録画継続 | P2 |
| consent_capture | not_captured | refused | 不同意 | 録画停止+通知 | P2 |
| consent_capture | not_captured | auto_terminated | 5分以内に同意なし | 録画停止+admin通知 | P2 |
| complaint | open | investigating | CS担当アサイン | 関連商談リンク | P3 |
| complaint | investigating | resolved | 対応完了 | lessons_learned | P3 |
| data_deletion_request | received | under_review | admin assign | SLA timer | P2 |
| data_deletion_request | under_review | approved/denied | admin判断 | 通知 | P2 |
| data_deletion_request | approved | completed | 削除実行 | 顧客通知+audit | P2 |
| upsell_signal | new | contacted | 営業着手 | CRM更新 | P3 |
| upsell_signal | contacted | won/lost | 結果 | fed back | P3 |
| offline_queue_item | queued | syncing | online復帰 | API投入 | P1 |
| offline_queue_item | syncing | done | 成功 | ローカル削除 | P1 |
| offline_queue_item | syncing | failed | 失敗 | retry exp | P1 |
| ■ Round1指摘反映追加(v2.1) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| recording_stage失敗(M-6) | stage2_failed | stage1_rerun | reprocess要求 | embeddings WHERE source_id+stage DELETE→再投入 | P1 |
| scheduling rescheduled→confirmed(M-7) | rescheduled | confirmed | 新日程確定 | Calendar/Zoom更新+holds解放 | P2 |
| scheduling cancelled→initial(M-7) | cancelled | initial | 再開要求 | 新proposalとして開始 | P2 |
| scheduling 過去時刻判定(M-7) | awaiting_reply | auto_expired | slot_start<now-grace | timed_outへ | P2 |
| contact lifecycle(L-2) | lead | qualified | 初回商談確定 | - | P1 |
| contact lifecycle(L-2) | qualified | customer | 契約締結 | - | P1 |
| contact lifecycle(L-2) | customer | churned | 解約 | - | P2 |
| contact lifecycle(L-2) | customer | at_risk | クレーム多発 | - | P3 |
| consent_capture per-attendee(C-1,G-2) | not_captured | captured | attendee join時dialog | 録画継続 | P2 |
| consent_capture per-attendee(C-1,G-2) | not_captured | refused | 拒否 | 当該話者発話redact | P2 |
| consent_capture per-attendee(C-1,G-2) | not_captured | late_join_pending | 途中参加 | 再アナウンスjob | P2 |
| audit_log chain(C-5) | valid | broken | hash不一致 | Slack/PD+調査 | P2 |
| jobs_inflight(T-3) | acquired | released | 完了 or expires_at超 | 次worker処理可 | P1 |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| consent_capture per-attendee(N-3) | late_join_pending | refused | 300秒(5分)以内に同意取得なし | 当該話者発話自動redact+管理者通知 | P2 |
| consent_capture per-attendee(N-3) | late_join_pending | captured | attendee dialogで同意 | 録画継続 | P2 |
| ■ v2.3 追加遷移(実演シミュ反映) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| internal_invite(F-S2-1) | invited | extended | 役職=part_of(out_of_office) or 緊急度=normal | timeout=24h or 4hに延長 | P2 |
| internal_invite(F-S2-1) | timed_out | reinvited | one-tapリインバイト | 新deadline+通知 | P2 |
| calendar_hold(F-S2-2) | held | attendees_dimmed_held | attendees_visible=true で同席者カレンダーに半透明表示 | - | P2 |
| scheduling_proposal(F-S2-4) | confirmed | customer_counter_propose | 顧客がSC-39で日程変更依頼 | 営業に通知+新ドラフト起動 | P2 |
| meeting(F-S4-5) | in_progress | recording_paused | Zoom webhook recording.paused | 30秒以内Push+SMS+UIライブインジケータ | P1 |
| meeting_brief(F-S4-4) | none | degraded | 15分前トリガ | 縮退版生成 | P2 |
| meeting_brief(F-S4-4) | degraded | full | 5分前完全版生成成功 | 完全版差し替え | P2 |
| meeting_brief(F-S4-4) | degraded | full_failed | 完全版生成失敗 | 縮退版維持+エラーログ | P2 |
| recording(F-S5-2) | stage2_preview | stage3_partial_artifact | partial_artifacts_allowed=true | summary/handoff部分生成可 | P2 |
| voice_memo(F-S14-2) | recording | interrupted | 電話/BG/BT切替 | 部分IndexedDB保存+再開prompt | P2 |
| voice_memo(F-S14-2) | interrupted | resumed | ユーザ再開 | 新segment追加(連結) | P2 |
| voice_memo(F-S14-2) | interrupted | abandoned | 30分以上放置 | 部分のみ保存+通知 | P2 |
| handoff(F-S9-1) | review | sla_breach_cc_supervisor | 48h無accept | 上長cc | P2 |
| handoff(F-S9-1) | sla_breach_cc_supervisor | force_assigned | 72h無accept | マネージャー強制割当 | P2 |
| audit_chain_incident(F-S10-3) | detected | investigating | 担当者assign | - | P2 |
| audit_chain_incident(F-S10-3) | investigating | closed | RCA+dual approval | admin監査ログ | P2 |
| dr_restore_request(F-S10-1) | requested | approved | admin+legal dual | queue投入 | P3 |
| dr_restore_request(F-S10-1) | approved | completed | 復元完了 | 通知+audit | P3 |
| dr_restore_request(F-S10-1) | requested | denied | 承認NG | reason付き通知 | P3 |
| consent_capture per-attendee(F-S4-3) | internal_user_join | auto_captured | users.consent_blanket_for_internal_meetings=true | 録画継続(dialog省略) | P2 |
| ■ v2.4 追加状態(再シミュ残課題) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| pre_consent_buffer(NF-S4-1) | unlocked | verbal_locked | verbal同意取得+segment紐付け | purge保留+retention連動 | P2 |
| pre_consent_buffer(NF-S4-1) | unlocked | purged | 録画開始+5分経過 | 物理削除 | P2 |
| pre_consent_buffer(NF-S4-1) | verbal_locked | retention_aged | 保持期間終了 | retention policyに従い削除 | P2 |
| taxonomy_change(NF-S9-1) | proposed | legal_review | 申請完了 | - | P3 |
| taxonomy_change(NF-S9-1) | legal_review | admin_approve | 法務承認 | - | P3 |
| taxonomy_change(NF-S9-1) | admin_approve | active | 情シス承認 | 版up+enum反映 | P3 |
| taxonomy_change(NF-S9-1) | active | archived | 代替版でreplace | 検索除外 | P3 |
| legal_hold_override(F-S11-3再) | received | legal_approved | 法務承認 | - | P2 |
| legal_hold_override(F-S11-3再) | legal_approved | it_approved | 情シス承認 | - | P2 |
| legal_hold_override(F-S11-3再) | it_approved | representative_approved | 代理人承認 | 削除実行可 | P2 |
| roleplay_consent(F-S7-4再) | none | review_only | 初回起動時opt-in | コーチ閲覧のみ | P3 |
| roleplay_consent(F-S7-4再) | review_only | team_blurred | ユーザがアップグレード | 氏名blur共有 | P3 |
| roleplay_consent(F-S7-4再) | review_only | full_share | ユーザがアップグレード | 完全共有 | P3 |
| ■ v2.5 追加(R3 minor) |  |  |  |  |  |
| 対象 | 状態 | 遷移先 | 条件/イベント | 副作用 | Phase |
| pre_consent_buffer(NF3-S4-1) | verbal_locked | verbal_locked(extended) | ユーザ申請+承認 | extension_count++ (最大3)+log | P2 |
| pre_consent_buffer(NF3-S4-1) | verbal_locked | auto_purged | extension_count>3 or 期限超 | 物理削除+admin通知 | P2 |
| roleplay_consent(NF3-S7-1) | full_share | team_blurred(downgrade) | ユーザがdowngrade | 既存視聴履歴保持+未視聴クリップのみ再ぼかし(q_roleplay_clip_reencode) | P3 |
| roleplay_consent(NF3-S7-1) | team_blurred | review_only(downgrade) | ユーザがdowngrade | 視聴権限縮小+audit | P3 |
| taxonomy_change(NF3-S9-1) | archived | migrated | 代替版へmigration | 紐付契約のtaxonomy_id更新 | P3 |
| taxonomy_change(NF3-S9-1) | archived | read_only_retained | migration不要 | 新規作成のみ不可・参照は維持 | P3 |