# 25_v2_review_resolutions

| Round1レビュー指摘の対応一覧 |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX/技術アーキ/コンプラ運用 3レビュアー指摘(Critical 20件・Moderate 38件・Minor 26件)の対応 |  |  |  |  |  |  |  |  |
| # | Reviewer | Severity | ID | 領域 | 指摘 | 対応(v2.1での修正) | 関連シート/テーブル/API | ステータス |
| 1 | UX | CRIT | G-1 | S6 CSクレーム | 顧客電話中に名前一覧から1タップは現実味なし(CTI連動なし) | AP-72に caller_phone を追加、SC-45にCTI widget(着信番号→customer auto-pick)、未一致時のみpadフォールバック | SC-45,AP-72,新テーブル cti_calls | 対応 |
| 2 | UX | CRIT | G-2 | S11 録画同意 | 途中入室者への同意取得フローが無い | meeting_consent_capturesをper-attendee化(attendee_id列+UNIQUE制約)、新規参加検知jobで個別同意プロンプト、未同意者の発話は自動redact | meeting_consent_captures(改),q_consent_check(改) | 対応 |
| 3 | UX | CRIT | G-3 | S4 商談中検索 | 共有時に内部メモ/sensitive除外フィルタが必須適用と書かれていない | SC-43にshare_safety_filter (default exclude_internal=true,exclude_sensitive=true) 必須適用、生成URLは外部用ペルソナ確定後に発行、プレビュー必須 | SC-43,AP-94(改) | 対応 |
| 4 | UX | CRIT | G-4 | S14 音声メモ | 録音中の電話着信/BG遷移の中断ハンドリング無し | voice_memos.interruption_log追加、MediaRecorder onInterrupt→IndexedDB部分保存→着信終了で再開prompt | voice_memos(改),17_offline_mobile(改) | 対応 |
| 5 | UX | CRIT | G-5 | S7 ロープレ | 観戦時の本人画面インジケータが無い(心理的安全性) | SC-21被観戦時に常時バッジ『○○マネージャーが観戦中』、AP-75 observer_joined/leftイベント明示 | SC-21(改),AP-75(改) | 対応 |
| 6 | UX | CRIT | G-6 | S10 Soft delete | 30日経過直前のリマインドが無い | 所有者本人に7日前/1日前push+メール、復元1クリックリンク。q_soft_delete_reminderジョブ追加 | q_soft_delete_reminder(新),23_observability_alerts(改) | 対応 |
| 7 | Tech | CRIT | T-1 | data_model | マルチテナント基盤欠落(中核テーブルにorg_idなし) | 全テーブルに org_id uuid NOT NULL を追加、RLS基本句を (org_id = current_setting('app.org_id')::uuid AND ...) に統一、pgvector HNSW を (org_id, embedding) で前提化 | 全テーブル+08_security_rls(改) | 対応 |
| 8 | Tech | CRIT | T-2 | RLS×ベクトル | embedding RLS が pgvector HNSW で機能せずsensitivity漏洩リスク | (a)visibility/sensitivity/org_idをembeddingsメタデータに非正規化、(b)検索RPCはSECURITY DEFINER+関数内でauth.uid権限判定、(c)recording_segmentsのsensitivity複製でprefilter必須 | knowledge_embeddings(改),search RPC,08_security_rls(改) | 対応 |
| 9 | Tech | CRIT | T-3 | ジョブ冪等性 | pgmq冪等性キーがジョブ別に未定義、Webhookリトライで二重投入 | payloadにidempotency_key必須、jobs_inflightテーブルでSELECT FOR UPDATE SKIP LOCKED、Webhook受信はON CONFLICT DO NOTHING RETURNINGで投入、recording_stages遷移はCAS | jobs_inflight(新),05_jobs_queues(改) | 対応 |
| 10 | Tech | CRIT | T-4 | 検索性能 | RLS+HNSW+ハイブリッド検索の性能設計が破綻リスク | (1)BM25はparadedb(pg_search)採用、(2)HNSW ef_search=64/ef_construction=128、(3)recording_segmentsのembedding metadataにorg_id+sensitivity+date複製してivfflat partition or partitioned table | 18_search_knowledge_quality(改),11_tech_stack_libs(改),03_data_model(改) | 対応 |
| 11 | Tech | CRIT | T-5 | API冪等性 | Idempotency-Keyの保管/TTL/再生仕様が空 | idempotency_keysテーブル(key,user_id,request_hash,response_jsonb,status,expires_at) + middleware で同key同hash→保存response再生・同key別hash→409、TTL=24h | idempotency_keys(新),04_api_endpoints(改) | 対応 |
| 12 | Tech | CRIT | T-6 | 観測性しきい値 | コスト/SLA/quotaの本物の境界に届いていない | Prometheus/Grafana追加、Anthropic tokens/sec rateアラート、pgmq visibility timeout重複実行カウンタ、Realtime/pgbouncer/HNSW memory、Zoom/Google quota使用率 | 23_observability_alerts(改) | 対応 |
| 13 | Tech | CRIT | T-7 | 楽観ロック | optimistic_lock_versions別表方式は原子性破綻 | 対象テーブル本体にversion int NOT NULL DEFAULT 1、UPDATE時にWHERE id=? AND version=? RETURNINGでCAS。optimistic_lock_versionsは競合履歴ログ専用へ役割変更 | meetings/recordings/handoffs等(改),AP-85(改) | 対応 |
| 14 | Tech | CRIT | T-8 | シークレット | 旧secret猶予期間/key rotation/service_role bundle漏洩リスク | _OLD/_NEW併存方式+SOP、service_role はworker専用、Next.jsはRoute Handler内で SUPABASE_PUBLIC_KEY+RLS 経由、gitleaks CI、Renovate | 10_env_vars(改),11_tech_stack_libs(改) | 対応 |
| 15 | Compl | CRIT | C-1 | 録画同意 | 事前提示・撤回・per-attendee・途中参加・pre-consent buffer purge未定義 | per-attendee consent化、Zoom join前同意dialog必須、途中参加検知→再アナウンスjob、撤回時の遡及削除SOP、pre_consent_buffer_purge_jobで同意前録音破棄 | meeting_consent_captures(改),q_consent_check(改),q_pre_consent_buffer_purge(新),16_compliance_legal(改) | 対応 |
| 16 | Compl | CRIT | C-2 | 保持期間 | O-04未決+5年と矛盾、最小化原則違反 | O-04確定: 録画は受注/失注確定後3年(法務確認後)、退職時60日以内に再評価、retention_policiesテーブルでsensitivity tier別TTL、DPAと自動同期 | retention_policies(新),16_compliance_legal(改),13_risks_decisions(改) | 対応 |
| 17 | Compl | CRIT | C-3 | 削除依頼 | 下流伝播/拒否事由/バックアップ消去/identity verification 未定義 | data_deletion_requestsに rejection_reason_code,downstream_propagation_status(per processor),backup_shred_status,identity_verification_method追加。30日SLA中の15日中間通知。OpenAI/Anthropicの再学習禁止DPA明記、R2バケット側削除job、PITR窓経過後の最終確認job | data_deletion_requests(改),q_deletion_propagate(新),16_compliance_legal(改) | 対応 |
| 18 | Compl | CRIT | C-4 | 法的開示 | チェーンオブカストディ要件不足 | legal_disclosure_requestsにwarrant_type,requesting_authority,legal_review_by,custody_chain_hashes(jsonb),dual_approver_ids,subject_notification_decision追加。export時 manifest.json + SHA-256 + GPG署名同梱、MFA+二人承認(admin+legal)必須 | legal_disclosure_requests(改),AP-88(改) | 対応 |
| 19 | Compl | CRIT | C-5 | 監査ログ | 非改ざん性なし、保持期間未明記 | audit_logs append-only(全role REVOKE UPDATE/DELETE、service_role INSERTのみ)、prev_hash sha256 hash chain、日次でR2 WORM(Object Lock compliance mode)へ。保持7年 | audit_logs(改),08_security_rls(改),16_compliance_legal(改) | 対応 |
| 20 | Compl | CRIT | C-6 | 退職処理SOP | 所有権移管/legal hold/可搬性 未統合 | 退職処理checklist(M-1〜M+30)定義: OAuth revoke→所有権 manager移管→legal hold判定→ex_employee_policy(retain/anon/delete)適用→退職者個人データexport提供→audit_logにarchive。q_anonymize_ex_employeeはlegal_hold行をskip+アラート | SOP(新シート),user_offboarding_sop(新テーブル),q_anonymize_ex_employee(改) | 対応 |
| 21 | UX | MOD | G-7 | S1 暗所撮影 | WB/反射/手ブレで撮影前ガイド無し | SC-33 CameraView に blur_score/exposure_score 即時算出、撮影前ガイド('暗すぎ'/'手ブレ') | SC-33(改) | 対応 |
| 22 | UX | MOD | G-8 | S1 バーストモード | 100枚連続のメモリ/レビュー動線が不在 | SC-08をbatch_review_mode化(横スワイプ連続レビュー、共通項目一括適用)、100件超はチャンク非同期OCR | SC-08(改) | 対応 |
| 23 | UX | MOD | G-9 | S14 騒音 | Whisperは騒音弱、SNR/ノイズ抑制なし | AP-98にRNNoise/WebAudio noise suppression、SNR<10dB時warning返却+再録ボタン | AP-98(改),17_offline_mobile(改) | 対応 |
| 24 | UX | MOD | G-10 | S6 曖昧クエリ | '前回'のような時間軸ゼロのリカバリ無し | AP-94にcontext_hint(active_customer_id,last_meeting_id)、UIで'絞り込む質問'対話的補完 | AP-94(改) | 対応 |
| 25 | UX | MOD | G-11 | S8 マネージャー | 数値中心でナラティブ無し | SC-25にメンバー別ナラティブカード(月次変化AI要約+talking points)、SC-26と連携 | SC-25(改),SC-26(改) | 対応 |
| 26 | UX | MOD | G-12 | S9 ハンドオフ | 未記入項目の強制リマインドが薄い | API submit前にrequired validation+AI完成度スコア、CS reworkコメントを構造化(missing_items[]) | SC-23(改),AP-79(改) | 対応 |
| 27 | UX | MOD | G-13 | S12 オンボーディング | 完了後30日内にデータ蓄積トリガなし | 19_onboarding_initialに'初週KPI(連絡先5件/録画1件/検索3回)'のhabit-loop通知、未達でCSM/上司にalert | 19_onboarding_initial(改) | 対応 |
| 28 | UX | MOD | G-14 | S14 オフライン | 明示ピン留め機能なし | SC-15/16にPin for offlineボタン、service_worker_cache_manifestにpinned_items優先度 | service_worker_cache_manifest(改),SC-15/16(改) | 対応 |
| 29 | UX | MOD | G-15 | S5 編集反映 | 編集後embedding再生成の遅延/状態が見えない | AP-22 responseにembedding_status(pending|fresh)、UIに'再インデックス中'バッジ+再検索ヒント | AP-22(改) | 対応 |
| 30 | UX | MOD | G-16 | S2 重複アプローチ | 異なる商品ライン並行アプローチが見えない | meeting_duplicatesにdeal_pipeline_id/product_line追加、警告でstage+productを明示 | meeting_duplicates(改) | 対応 |
| 31 | Tech | MOD | M-1 | data_model | user_oauth_tokens のscope増分でセッション分裂 | UNIQUE(user_id,provider,scope_set_hash)、scopesマージ管理仕様 | user_oauth_tokens(改) | 対応 |
| 32 | Tech | MOD | M-2 | FK整合 | circular参照とON DELETE未定義 | soft delete統一、FK ON DELETE NO ACTION+アプリ層カスケード制御を冒頭で宣言 | 03_data_model(改) | 対応 |
| 33 | Tech | MOD | M-3 | embeddings孤児 | 多態的参照で孤児・削除カスケード未定義 | source_typeごとのpartial FK or DBトリガで参照存在チェック、削除時は q_embedding_cleanup ジョブで cleanup | knowledge_embeddings(改),q_embedding_cleanup(新) | 対応 |
| 34 | Tech | MOD | M-4 | レート制限 | 一律rpm、Webhook粒度なし | endpoint groupごとに別バケット(webhook外形+secret検証のみ、search 30rpm、ocr 10/min)、Upstash or Postgresで保管 | 08_security_rls(改),04_api_endpoints(改) | 対応 |
| 35 | Tech | MOD | M-5 | Idempotency一覧 | 副作用APIにIdempotency必須/任意の列が無い | 04_api_endpointsに'Idempotency'列追加(全mutating)+ETag/If-Match | 04_api_endpoints(改) | 対応 |
| 36 | Tech | MOD | M-6 | 録画状態 | stage失敗時のretry経路+embedding巻き戻し未定義 | recording_stagesにstage毎status/started_at/finished_at/error、reprocess時embeddingsをsource_id+stageでDELETE→再投入 | recording_stages(改),14_state_machines(改) | 対応 |
| 37 | Tech | MOD | M-7 | scheduling状態 | 状態×イベントマトリクス未網羅 | 状態×イベント表で全マス埋める/不可能なら空欄+'不可'と明示 | 14_state_machines(改) | 対応 |
| 38 | Tech | MOD | M-8 | LLM contract | tool use/JSON mode/zod再検証が断片的 | 全LLM呼び出しでAnthropic tool use(or JSON mode)+zod再検証、失敗時1回再生成→needs_reviewを規約として07_llm_promptsに統一明記 | 07_llm_prompts(改) | 対応 |
| 39 | Tech | MOD | M-9 | RAG設計 | retrievedの上限tokens/圧縮戦略が未定義 | per-chunk cap(1k tokens × 上位8件)、systemプロンプトをAnthropic prompt cacheに乗せる、cost guard $0.10/conversation | 07_llm_prompts(改),12_cost_estimate(改) | 対応 |
| 40 | Tech | MOD | M-10 | フリガナ推定 | Claudeハルシネーション | kuromoji+辞書+Claudeアンサンブル、confidence<0.8で人手確認 | LP-10(改) | 対応 |
| 41 | Tech | MOD | M-11 | R2 署名URL | 録画ダウンロード TTL=300s短すぎ | 署名URL(録画)1時間、ffmpegは-i pipe:でストリーミング処理、ローカル保存512MB上限 | 05_jobs_queues(改),11_tech_stack_libs(改) | 対応 |
| 42 | Tech | MOD | M-12 | コスト試算 | 楽観的見積 | ジョブ単位tokens再見積、per-meeting cost cap、超過時Haikuフォールバック | 12_cost_estimate(改),usage_limits(改) | 対応 |
| 43 | Tech | MOD | M-13 | DB容量 | 録画/embeddingsで半年枯渇 | recordings.transcript_fullはR2のみ(DB preview)、audit_logs 90日でcold storage、embeddings分離余地 | 12_cost_estimate(改),13_risks_decisions(改) | 対応 |
| 44 | Tech | MOD | M-14 | テスト網羅 | RLS pgTAP/DLQ復元/LLM JSON Schemaテスト不足 | AT-RLS-*/AT-DLQ-*/AT-LLM-Schema-*セクション追加 | 24_acceptance_test_matrix(改) | 対応 |
| 45 | Tech | MOD | M-15 | ハルシネーションKPI | goldenセットの粒度未定義 | golden set>=200質問、四半期更新、95%CIで0-3%許容 | 18_search_knowledge_quality(改) | 対応 |
| 46 | Tech | MOD | M-16 | 共有リンクRPC | service_role経路の境界曖昧 | share-link-access専用Edge Function/RPC、token verify+rate limit+audit強制、Route Handlerからservice_role直接DB禁止ルール | 08_security_rls(改),AP-31(改) | 対応 |
| 47 | Tech | MOD | M-17 | audit改ざん検知 | hash chain無し | audit_logs append-only+prev_hash/sha256で日次ハッシュチェーン | audit_logs(改) | 対応(C-5重複) |
| 48 | Tech | MOD | M-18 | SW容量 | 100MB超過時の動作・暗号化未定義 | IndexedDB暗号化(libsodium、key=session-bound)、容量超過時LRU、未同期データは保持 | 17_offline_mobile(改) | 対応 |
| 49 | Tech | MOD | M-19 | API ID重複 | AP-95とAP-25が重複/SSEイベント未定義 | ID重複解消、SSEイベント仕様(event:token/source/done/error)記述 | 04_api_endpoints(改) | 対応 |
| 50 | Tech | MOD | M-20 | email_drafts欠落 | email_undo_tokensが参照するemail_drafts定義なし | email_draftsテーブル(id,thread_id,owner,subject,body,status,scheduled_send_at)追加 | email_drafts(新) | 対応 |
| 51 | Compl | MOD | M-C1 | secret rotation | 旧secret並行受け入れ窓無し | dual-secret window 7日+Slack通知+rotation_audit | secret_rotation_audit(新) | 対応 |
| 52 | Compl | MOD | M-C2 | 共有リンク悪用 | 透かし/DRM/bot対策なし | external_summaries/recording_clipsにdynamic watermark(viewer email)+bot_block(captcha)+pre-fetch UA/refererチェック | share_links(改),AP-68(改) | 対応 |
| 53 | Compl | MOD | M-C3 | 社内閲覧マスキング | sensitive=社内も段階閲覧不可 | recordings_select RLSをsensitivity tier段階適用、社内閲覧時もデフォルトmask、unmaskはreason+audit | 08_security_rls(改),recordings_segments_select | 対応 |
| 54 | Compl | MOD | M-C4 | DR | RPO/RTO/クロスリージョン未定義 | RPO=15min/RTO=4h明文化、DR用ap-northeast-3 (osaka) encrypted backup、DPAとdata_residency_configに反映 | 16_compliance_legal(改),data_residency_config(改) | 対応 |
| 55 | Compl | MOD | M-C5 | 利用規約再同意 | ポリシー改訂時の再同意/撤回/影響範囲未定義 | consent_logsにversion,revoked_at,revocation_scope追加、改訂時の強制再ログイン+再同意 | consent_logs(改) | 対応 |
| 56 | Compl | MOD | M-C6 | フォールバック可視 | 品質低下バナー/コストkill switchなし | feature_flagsにllm_primary/fallback、UIにdegraded_modeバナー、月予算150%でhard stop | feature_flags(改),23_observability_alerts(改) | 対応 |
| 57 | Compl | MOD | M-C7 | 代理権限退職 | 退職後のdelegate自動失効なし | delegate_grants.expires_at必須、退職処理jobで全関連delegate_grants revoke | delegate_grants(改),退職SOP | 対応 |
| 58 | Compl | MOD | M-C8 | admin監査 | レビューア独立性/サンプリング/エビデンス無し | audit_review_recordsテーブル、月次チェックリスト、四半期外部監査(SOC2 Type2準備) | audit_review_records(新),16_compliance_legal(改) | 対応 |
| 59 | UX | MIN | G-17 | 片手UI | 左利き/親指リーチ規約なし | 21_a11y_i18nに handedness_setting と reach_zone_guideline 追加 | 21_a11y_i18n(改) | 対応 |
| 60 | UX | MIN | G-18 | 別スレッド | References欠落時のフォールバック無し | AP-64 parseに subject_similarity+sender_match fuzzy mergeを追加、低信頼度はinbox保留 | AP-64(改) | 対応 |
| 61 | UX | MIN | G-19 | reprocess差分 | 旧/新のDiff Viewer無し | SC-16 ReprocessにDiff Viewer、並列比較+承認/破棄 | SC-16(改) | 対応 |
| 62 | UX | MIN | G-20 | 検索ゼロ件 | 代替提案動線未定義 | AP-94 0件時 did_you_mean+broaden_filter | AP-94(改) | 対応 |
| 63 | UX | MIN | G-21 | 商談連続 | emotional reset無し | SC-42に直前商談との切替アラート+1分リセットtip | SC-42(改) | 対応 |
| 64 | UX | MIN | G-22 | 退職者部分anon | scope無し | ex_employee_speech_policiesにscope(self_voice|all_segments|customer_facing_only) | ex_employee_speech_policies(改) | 対応 |
| 65 | UX | MIN | G-23 | 新人メンター | アサイン動線無し | onboarding_recommendationsにmentor_user_id+1on1schedule連携 | onboarding_recommendations(改) | 対応 |
| 66 | UX | MIN | G-24 | 失注分析 | 勝因分析の対比なし | win_analyses追加、勝/負対比ビュー | loss_analyses(改),win_analyses(新) | 対応 |
| 67 | UX | MIN | G-25 | iOS PWA | インストール促進動線弱 | SC-66にiOS用PWA install gate+通知許可前提UI | SC-66(改) | 対応 |
| 68 | UX | MIN | G-26 | 話者誤識別 | 遡及一括修正無し | speaker_assignmentsにpropagate_to_past=true+バックグラウンドjob | speaker_assignments(新),q_speaker_propagate(新) | 対応 |
| 69 | Tech | MIN | L-1 | role不足 | 'legal'role無し | usersのrole列に'legal'追加 or 別permission_grantsで管理 | users(改) | 対応 |
| 70 | Tech | MIN | L-2 | contact状態 | contact lifecycle無し | 14_state_machinesにcontact行追加 | 14_state_machines(改) | 対応 |
| 71 | Tech | MIN | L-3 | TZDATA | env脆弱 | Dockerfileで tzdata固定、envはラベルのみ | 11_tech_stack_libs(改) | 対応 |
| 72 | Tech | MIN | L-4 | Web Vitals | 送信先未指定 | Vercel Speed Insights or 自前API決定 | 11_tech_stack_libs(改) | 対応 |
| 73 | Tech | MIN | L-5 | SW回帰 | skipWaiting/clientsClaim回帰なし | ATにSWバージョンアップ時のキャッシュ整合追加 | 24_acceptance_test_matrix(改) | 対応 |
| 74 | Tech | MIN | L-6 | share_links | ハッシュ未指定 | argon2id強制、tokenはsha256でDB保存しurlのみ平文 | share_links(改) | 対応 |
| 75 | Tech | MIN | L-7 | ロープレ評価 | rubric_total整合なし | アプリ側で rubric_scores * weight = overall_score 再計算 | 07_llm_prompts(改) | 対応 |
| 76 | Tech | MIN | L-8 | embedding partial | field-level diff未定義 | commitments更新時はcommitment chunksのみ再生成 | AP-22(改) | 対応 |
| 77 | Tech | MIN | L-9 | overlap表現 | 重なり発話表現無し | recording_segmentsにspeakers text[] or overlap_with_segment_id自己参照 | recording_segments(改) | 対応 |
| 78 | Tech | MIN | L-10 | Worker分離 | 軽/重ワーカー分離なし | 軽量(API/DB)と重い(ffmpeg/whisper/pyannote)を分離 | 09_implementation_plan(改),12_cost_estimate(改) | 対応 |
| 79 | Compl | MIN | L-C1 | 署名URL長尺 | HLS rolling token無し | HLSセグメント単位で都度署名URL再発行、ハートビートで延長 | 16_compliance_legal(改) | 対応 |
| 80 | Compl | MIN | L-C2 | CSPレポート | report-uri/report-to未定義 | Sentry CSPレポート受信、しきい値超でSlack | 23_observability_alerts(改) | 対応 |
| 81 | Compl | MIN | L-C3 | 顧客TZ夜間 | 顧客側ローカル23-7時ブロック未明記 | customer_timezones参照で顧客ローカル夜間も送信ブロック | work_hours強制ロジック | 対応 |
| 82 | Compl | MIN | L-C4 | 委託先一覧 | DPA/サブプロセッサ通知運用未定義 | 16_compliance_legal『第三者提供』を『委託先(処理者)一覧』に分け、Anthropic/OpenAI/Cloudflare/Render/Supabaseを明記、追加時30日前事前通知 | 16_compliance_legal(改) | 対応 |
| 83 | Compl | MIN | L-C5 | admin相互監査 | admin同士の監査がない | root admin(2人)以上の相互レビュー、admin_actionは別テーブル | 16_compliance_legal(改) | 対応 |
| 84 | Compl | MIN | L-C6 | 初回pen test | P1リリース前pen testなし | P1終盤(リリース2週前)に初回pen test、年次サイクル開始 | 09_implementation_plan(改),16_compliance_legal(改) | 対応 |
| ■ Round2 minor 反映(v2.2) |  |  |  |  |  |  |  |  |
| # | Reviewer | Severity | ID | 領域 | 指摘 | 対応 | 関連 | ステータス |
| 85 | UX-R2 | MIN | NG-1 | 21_a11y_i18n | handedness_setting/reach_zone本体未明記 | 21_a11y_i18nに3行追加(handedness/reach_zone/one_handed_audit)+AP-121/122+SC-76 | 21/04/02 | 対応 |
| 86 | UX-R2 | MIN | NG-2 | SC-66 PWA | iOS PWA install gate独立画面なし | SC-75 /onboarding/install-pwa 新設+AP-123 | 02/04 | 対応 |
| 87 | UX-R2 | MIN | NG-3 | AP-22 | embedding_status response未明記 | AP-22改修(response: embedding_status, impacted_chunks, version) | 04 | 対応 |
| 88 | UX-R2 | MIN | NG-4 | 16_compliance | Round1反映1ページ表が無い | 16_compliance_legalに Round1反映一覧表(C-1〜C-6/M-C1〜M-C8/L-C1〜L-C6)を追加 | 16 | 対応 |
| 89 | Tech-R2 | MIN | N-1 | RAG cost cap | ¥/$算出根拠+為替変動SOPなし | 12_cost_estimateに『LLM cost cap算出基準』追記+為替変動>±10%でポリシー再評価 | 12 | 対応 |
| 90 | Tech-R2 | MIN | N-2 | HNSW | ef_search/ef_construction 実測ベンチなし | 18_search_knowledge_qualityに『HNSW ベンチ結果』列追加(P1ローンチ前必須) | 18 | 対応 |
| 91 | Compl-R2 | MIN | N-1 | audit chain SLA | 破断→通報までの数値SLAなし | 23_observability_alerts: chain破断検知から通報15分以内 を明記 | 23 | 対応 |
| 92 | Compl-R2 | MIN | N-2 | ex_employee anon二重承認 | matrixに記載なし | 25のC-6行に『q_anonymize_ex_employee は legal hold判定で admin+legal の二重承認必須』を補記 | 25/26 | 対応 |
| 93 | Compl-R2 | MIN | N-3 | late_join_pending timeout | 具体値未定義 | 14_state_machines: late_join_pending → refused タイムアウト=300秒(5分) を明記 | 14 | 対応 |
| ■ v2.3 実演シミュレーション 65件のポインタ |  |  |  |  |  |  |  |  |
| # | Reviewer | Severity | ID | 領域 | 指摘 | 対応 | 関連 | ステータス |
| 94 | Sim-S1-S5 | - | - | S1-S5 | 現場演者で発見した摩擦20件 | 27_simulation_resolutionsの#1-25を参照 | 27 | 対応 |
| 95 | Sim-S6-S10 | - | - | S6-S10 | 現場演者で発見した摩擦23件 | 27_simulation_resolutionsの#26-47を参照 | 27 | 対応 |
| 96 | Sim-S11-横断 | - | - | S11-X | 現場演者で発見した摩擦22件 | 27_simulation_resolutionsの#48-68を参照 | 27 | 対応 |
| ■ v2.4 ポインタ(再シミュ残課題) |  |  |  |  |  |  |  |  |
| # | Reviewer | Severity | ID | 領域 | 指摘 | 対応 | 関連 | ステータス |
| 97 | Sim2-S1-S5 | - | - | S1-S5 | crit 1+mod 3+min 3 (再演者ラウンド) | 28シートの#1-9参照 | 28 | 対応 |
| 98 | Sim2-S6-S10 | - | - | S6-S10 | mod 1+min 3 | 28シートの#10-15参照 | 28 | 対応 |
| 99 | Sim2-S11-X | - | - | S11-X | mod 1+min 3 | 28シートの#16-19参照 | 28 | 対応 |
| ■ v2.5 ポインタ(R3 minor) |  |  |  |  |  |  |  |  |
| # | Reviewer | Severity | ID | 領域 | 指摘 | 対応 | 関連 | ステータス |
| 100 | Sim3-S1-S5 | - | - | S1-S5 | R3 minor 3件 | 29シート#5,6,7参照 | 29 | 対応 |
| 101 | Sim3-S6-S10 | - | - | S6-S10 | R3 minor 3件 | 29シート#1?,8,9,10参照 | 29 | 対応 |
| 102 | Sim3-S11-X | - | - | S11-X | R3 minor 4件 | 29シート#1,2,3,4参照 | 29 | 対応 |