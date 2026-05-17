# 16_compliance_legal

| コンプライアンス・法務 |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| 録画同意・削除依頼・退職者発言・法的開示・データ保管地域 |  |  |  |  |  |
| 項目 | 要件 | 実装 | 運用 | 監査 | Phase |
| 録画同意 | 商談冒頭で同意取得 | auto announcement+不同意なら録画停止+ログ | SOP: 商談3分以内に同意確認 | meeting_consent_captures+audit_logs | P2 |
| 削除依頼 | 個人情報保護法/GDPR応諾 | /share/[token]/request+30日SLA+専用窓口 | admin queue, ticket管理 | data_deletion_requests | P2 |
| 退職者発言 | retain/anonymize/deleteを組織選択 | ex_employee_speech_policies+jobで一括処理 | 退職処理SOPに組込 | audit_logs | P3 |
| 法的開示 | チェーンオブカストディ | legal_disclosure_requests+期間/対象指定export+暗号化zip | admin/legal連携、MFA必須 | audit_logs(actor/scope/time) | P3 |
| 保管地域 | 東京リージョン固定 | Supabase ap-northeast-1+R2 tokyo | 契約書明記+SOC2範囲 | data_residency_config | P1 |
| 保持期間 | 録画/メール 5年 | retention policy job+soft delete | 退職者ポリシーと連動 | - | P2 |
| 共有リンク | 期限+IP制限+クリップ単位 | share_links(expires_at)+IP allowlist | クリップ推奨運用 | share_links閲覧ログ | P2 |
| PIIマスキング | 顧客住所/電話/金額 | pii_detector+共有時自動redact | 解除はadmin only | pii_redactions | P2 |
| MFA | 破壊的アクション | admin/manager必須 | 設定SOP | dangerous_action_audits | P2 |
| 監査ログ | 全sensitive操作 | triggers→audit_logs | admin閲覧+月次レビュー | audit_logs | P2 |
| 利用規約/プライバシー | 商談録画/AI処理の同意 | オンボーディング時に同意+ログ | 退会時データ削除 | consent_logs | P1 |
| データ可搬性 | CSV/JSONエクスポート | data_exports+暗号化zip | 顧客請求対応 | data_exports | P3 |
| 第三者提供 | 利用しない方針/明示 | DPA/SLA | 契約レビュー | - | P1 |
| 脆弱性管理 | 依存関係 | npm audit/Renovate | 週次 | - | P1 |
| Pen test | 年次 | 外部監査 | 年次SOC2 | - | P3 |
| ■ Round1指摘反映 一覧(コンプラ視点・1ページ参照用) |  |  |  |  |  |
| ID | 領域 | 原指摘 | 対応(v2.1) | 関連シート | ステータス |
| C-1 | 録画同意 | 事前提示・撤回・per-attendee・途中参加・pre-consent buffer purge未定義 | per_attendee_consent table+AP-106+q_pre_consent_buffer_purge+q_consent_check_per_attendee+14_state_machines late_join_pending | 03/04/05/14 | 対応 |
| C-2 | 保持期間 | O-04未決+5年と矛盾、最小化原則違反 | retention_policies table(sensitivity tier別TTL)+O-04確定(受注/失注3年/退職60日内再評価)+DPA同期 | 03/13/16 | 対応 |
| C-3 | 削除依頼 | 下流伝播・拒否事由・バックアップ消去・identity verification 未定義 | data_deletion_requests改修(rejection_reason_code/downstream_propagation_status/backup_shred_status/identity_verification_method)+q_deletion_propagate+15日中間通知 | 03/05/16 | 対応 |
| C-4 | 法的開示 | チェーンオブカストディ要件不足 | legal_disclosure_requests改修(warrant_type/requesting_authority/legal_review_by/custody_chain_hashes/dual_approver_ids/subject_notification_decision)+AP-111(GPG+二人承認+manifest+SHA-256)+MFA | 03/04/16 | 対応 |
| C-5 | 監査ログ | 非改ざん性なし、保持期間未明記 | audit_logs append-only(REVOKE UPDATE/DELETE)+prev_hash chain+R2 WORM(Object Lock compliance)+AP-113/124+q_audit_chain_verify+q_audit_worm_export+保持7年 | 03/04/05/08 | 対応 |
| C-6 | 退職処理SOP | 所有権移管/legal hold/可搬性 未統合 | 26_user_offboarding_sop(O-01〜O-16) M-Day〜M+60チェックリスト+q_offboarding_orchestrate+q_offboarding_owner_transfer+AP-119/120+AP-112(可搬性) | 04/05/26 | 対応 |
| M-C1 | secret rotation | 旧/新並行受け入れ窓無し | secret_rotation_audit table+_OLD/_NEW dual-secret window 7日+Slack通知 | 03/10 | 対応 |
| M-C2 | 共有リンク悪用 | 透かし/DRM/bot対策なし | share_links改修(dynamic watermark+bot_block captcha+UA/refererチェック)+q_share_link_watermark+meeting_share_watermarks | 03/05 | 対応 |
| M-C3 | 社内閲覧マスキング | sensitive=社内も段階閲覧不可 | recordings_select RLSをsensitivity tier段階適用、社内閲覧時もデフォルトmask、unmaskはreason+audit | 08 | 対応 |
| M-C4 | DR | RPO/RTO/クロスリージョン未定義 | RPO=15min/RTO=4h明文化、ap-northeast-3 osaka encrypted backup、dr_backup_regions+q_dr_backup_replicate+SC-78 | 03/05/02 | 対応 |
| M-C5 | 利用規約再同意 | ポリシー改訂時の再同意・撤回・影響範囲未定義 | consent_logs改修(version/revoked_at/revocation_scope)+AP-115/116+q_consent_revoke_apply+LP-35 | 03/04/05/07 | 対応 |
| M-C6 | フォールバック可視 | 品質低下バナー/コストkill switchなし | feature_flags(llm_primary/fallback)+UI degraded_mode+月予算150% hard stop+AP-117 LLM killswitch+q_llm_cost_guard | 03/04/05/23 | 対応 |
| M-C7 | 代理権限退職 | 退職後のdelegate自動失効なし | delegate_grants.expires_at必須+退職処理jobで全失効+AP-112可搬性 | 03/26 | 対応 |
| M-C8 | admin監査 | レビューア独立性/サンプリング/エビデンス無し | audit_review_records table+月次チェックリスト+四半期外部監査(SOC2 Type2準備) | 03/16 | 対応 |
| L-C1 | 署名URL長尺 | HLS rolling token無し | HLSセグメント単位で都度署名URL再発行+ハートビートで延長 | 16 | 対応 |
| L-C2 | CSPレポート | report-uri/report-to未定義 | Sentry CSPレポート受信+しきい値超でSlack | 23 | 対応 |
| L-C3 | 顧客TZ夜間 | 顧客側ローカル23-7時ブロック未明記 | customer_timezones参照で顧客ローカル夜間も送信ブロック+work_hours強制ロジック | 08 | 対応 |
| L-C4 | 委託先一覧 | DPA/サブプロセッサ通知運用未定義 | 委託先(処理者)一覧明記(Anthropic/OpenAI/Cloudflare/Render/Supabase)+追加時30日前事前通知 | 16 | 対応 |
| L-C5 | admin相互監査 | admin同士の監査がない | root admin(2人)以上の相互レビュー、admin_actionは別テーブル | 08/16 | 対応 |
| L-C6 | 初回pen test | P1リリース前pen testなし | P1終盤(リリース2週前)に初回pen test+年次サイクル開始 | 09/16 | 対応 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |  |
| 項目 | 要件 | 実装 | 運用 | 監査 | Phase |
| WORM vs 削除SLA衝突解消(F-S11-1) | audit_logsのPIIマスキング前提化 | WORM保管対象はredacted text、unmask要求は別チャネル+legal review | 審査24h SLA | unmask audit_logs | P2 |
| captured_via 法的有効性(F-S4-2) | 各captured_viaの根拠 | zoom_apps_dialog: opt-in+ログ。email_otp_link: 確認可能だが時差。verbal_logged_by_owner: 緊急時のみ+音声記録併記。auto_capture: 包括同意のみ | SOPで優先順位明記 | consent log | P2 |
| captured_via 緊急時verbal(F-S4-2) | 営業押下による口頭同意ログ | audio_proof_segment_idを必須参照 | 事後本人確認7日以内 | ex post review | P2 |
| consent_blanket(F-S4-3) | 社内会議の包括同意 | onboarding step6で明示・撤回可能 | 半年に1度再確認 | consent_logs | P2 |
| delegate_grants退職時(M-C7再強化) | 退職時即失効+本人通知 | q_offboarding_orchestrate内 | O-08で実行 | audit | P3 |
| i18n DPA(F-UX-1) | 海外顧客向け文面の法的妥当性 | export_templates(en)を法務レビュー後デプロイ | リリース前必須 | template_audit | P3 |
| personal export(F-UX-3) | 対象種別+パスフレーズ二経路 | SMS/別Emailの選択+暗号化zip(AES-256)+expires=7d | SOP | data_exports | P3 |
| audit chain破断(F-S10-3) | incident open→investigation→close | dual approval+RCAリンク必須 | 検知15分以内通報、24h以内open状態維持 | audit_chain_incidents | P2 |
| DR restore(F-S10-1) | admin+legal dual approval+MFA | SC-78改修+AP-129/130 | SOP明記 | dangerous_action_audits | P3 |
| former_employee発言表示(F-S6-2) | UI上で警告バッジ+承継状態必須 | SC-43/SC-45/SC-01 | 顧客対応SOPに反映 | - | P2 |
| 顧客向けPDF i18n(F-UX-1) | PDFテンプレもlocale切替 | export_templates(kind=pdf) | share/[token]ロケール解決ルール | - | P3 |
| watermark i18n(F-UX-1) | viewer_email埋込+多言語 | export_templates(kind=watermark) | - | - | P3 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |
| 項目 | 要件 | 実装 | 運用 | 監査 | Phase |
| verbal proof のbuffer循環解消(NF-S4-1) | 録画前バッファのpurgeとverbal同意の証跡参照を整合 | pre_consent_audio_buffers.verbal_proof_locked=true→48hロック→retention_policiesに連動 | SOPに『verbal時はbuffer固定→purge保留』を明記 | audit_logs+chain | P2 |
| 3者承認 legal_hold(F-S11-3再) | 訴訟係属時の代理人承認 | data_deletion_requests.legal_hold_override_approver_id+SC-60a 3-step approval | SOPに承認順序(法務→情シス→代理人)を記載 | approval_chain JSONB | P2 |
| コスト超過時のadmin通知(NF-S5-1) | per-meeting cap到達でadmin通知 | q_derived_artifacts_regen+q_llm_cost_guard | admin Slack | cost_actuals | P2 |
| 翻訳開示(NF-UX-1) | 機械翻訳である旨の開示 | share/[token]に machine_translated_en + quality_disclaimer 必須 | DPA記載 | - | P3 |
| ■ v2.5 追加(R3 minor) |  |  |  |  |  |
| 項目 | 要件 | 実装 | 運用 | 監査 | Phase |
| 代理人KYC(NF3-S11-1) | POA原本写し+本人免許写し必須 | data_deletion_requests に representative_identity_verification_method+POA url+ID url 追加。SC-60a 代理人タブ | SOPに『代理人弁護士の場合は委任状原本(POA)+本人運転免許の写しを必須』明記 | approval_chain JSONB | P2 |
| 翻訳開示(改v2.5) | 人手翻訳エスカレ手順 | SC-31の『人手翻訳を依頼』+ SLA 5営業日+ machine_translated_en バッジ継続 | DPA: 人手翻訳の委託先(社内/外部)を明記 | translation_status | P3 |
| verbal_proof再延長(NF3-S4-1) | extension_count最大3回 | pre_consent_audio_buffers.extension_count + extension_log | SOPに『再延長承認は admin+legal 二者必須』 | extension_log JSONB | P2 |