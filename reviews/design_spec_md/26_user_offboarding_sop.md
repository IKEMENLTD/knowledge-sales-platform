# 26_user_offboarding_sop

| 退職処理SOP |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| 人員退職時のチェックリスト(M-1〜M+30)、所有権移管、legal hold、可搬性 |  |  |  |  |  |  |
| タイミング | ID | アクション | 対象システム/テーブル | 責任者 | エビデンス | Phase |
| M-1(退職1ヶ月前) | O-01 | 人事から退職通知受領+offboarding ticket起票 | HR, /admin/offboarding | HR+IT | ticket_id | P2 |
| M-1 | O-02 | 引き継ぎ計画作成(担当顧客リスト+優先度) | contacts/meetings/contracts | 退職者+manager | plan.md | P2 |
| M-7 | O-03 | 所有権移管プレビュー(担当顧客→新担当) | contacts.owner, meetings.owner | manager | preview UI | P2 |
| M-1〜M-Day | O-04 | ロープレ知見・top phrases の本人合意確認(継続公開可否) | top_performer_phrases | 退職者+manager | consent_log | P3 |
| M-Day(退職当日) | O-05 | Google/Zoom OAuth revoke(即時) | user_oauth_tokens | IT | audit_logs | P1 |
| M-Day | O-06 | ログイン無効化(is_active=false)+セッション全終了 | users | IT | audit_logs | P1 |
| M-Day | O-07 | 所有権移管実行(contacts/meetings/handoffs/contractsのowner更新) | 主要テーブル | IT(script) | audit_logs | P2 |
| M-Day | O-08 | 代理権限(delegate_grants)失効 | delegate_grants | IT(script) | audit_logs | P2 |
| M-Day | O-09 | feature flagsとAB割当の引き継ぎ確認 | feature_flags,ab_test_assignments | IT | - | P2 |
| M-Day | O-10 | 退職者発言ポリシー判定(legal hold有無→retain/anonymize/delete) | ex_employee_speech_policies,recording_segments | admin+legal | decision_log | P3 |
| M-Day+1 | O-11 | 本人へのデータ可搬性提供(個人発言のexport) | data_exports | IT | export_url+本人受領 | P3 |
| M-Day+1 | O-12 | q_anonymize_ex_employee 起動(legal hold行はskip+アラート) | recording_segments,roleplay_sessions | worker | job_log+audit | P3 |
| M+7 | O-13 | 残作業の引き継ぎ完了確認(handoff差し戻しなし) | handoffs | manager | status=approved | P2 |
| M+30 | O-14 | 退職処理完了レビュー(audit_logsで全アクション確認) | audit_logs,dangerous_action_audits | admin | monthly review record | P2 |
| M+60 | O-15 | 退職者個人データの最終削除/再評価 | users(soft delete→purge),recordings(retention再評価) | admin | purge audit | P2 |
| 継続 | O-16 | legal hold対象は法務終了まで保持(退職者アクセスは無) | ex_employee_speech_policies | legal | hold_log | P3 |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |  |  |
| タイミング | ID | アクション | 対象システム/テーブル | 責任者 | エビデンス | Phase |
| M-Day(改) | O-10b | 退職者発言ポリシーの legal hold 判定は admin+legal の二重承認(N-2) | ex_employee_speech_policies+legal_disclosure_requests | admin+legal | dual_approval_log | P3 |
| M-Day(改) | O-12b | q_anonymize_ex_employee は legal_hold=true 行を skip+アラート(承認後のみ実行) | recording_segments+roleplay_sessions | worker | job_log+audit | P3 |
| ■ v2.3 修正(F-S12-1: O-11前倒し) |  |  |  |  |  |  |
| タイミング | ID | アクション | 対象システム/テーブル | 責任者 | エビデンス | Phase |
| M-Day 16:00(改) | O-11(改) | 本人へのデータ可搬性提供を **OAuth revoke前** に完了。Zoom録画/Gmail/Calendar 等外部API依存データはここで完全DL | data_exports + Zoom downloader + Gmail export | IT(script) | export_url+本人受領+完了ログ | P2 |
| M-Day 16:30 | O-05(改) | O-11完了確認後にGoogle/Zoom OAuth revoke | user_oauth_tokens | IT | audit_logs | P1 |
| M-Day | O-17 | 退職者デバイスのリモートwipe確認(IndexedDB+SW cache) | client_devices(新)+push | IT | wipe_audit | P1 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |  |
| タイミング | ID | アクション | 対象システム/テーブル | 責任者 | エビデンス | Phase |
| M-Day(改) | O-05c | verbal同意でロックされた pre_consent_audio_buffers.verbal_proof_locked=true 行はretention policyに基づき個別保持(O-05のwipeでも対象外) | pre_consent_audio_buffers | IT+legal | retention_log | P2 |