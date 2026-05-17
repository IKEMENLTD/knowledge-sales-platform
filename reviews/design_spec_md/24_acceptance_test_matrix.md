# 24_acceptance_test_matrix

| 受け入れテストマトリクス |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| シーン×受け入れ条件×自動化レベル |  |  |  |  |  |
| シーンID | シナリオ | 受け入れ条件 | 自動化 | 対象US | Phase |
| AT-S1-1 | 暗所撮影 | OCR成功率>=90% or 確認UI到達 | Playwright(画像fixture) | US-21 | P1 |
| AT-S1-2 | 両面名刺 | 表裏が1コンタクトに紐付く | E2E | US-22 | P1 |
| AT-S1-3 | 非名刺混入 | パンフレットが non_card_attachments へ | unit+E2E | US-23 | P1 |
| AT-S1-4 | オフライン取り込み | SW+IndexedDB再現 | Playwright offline mode | US-25 | P1 |
| AT-S1-5 | 音声メモ | Whisper結果がmemoに保存 | E2E | US-26 | P1 |
| AT-S1-6 | イベントタグ | イベント選択時、全件付与 | E2E | US-27 | P2 |
| AT-S2-1 | 上司同席合意 | accept前にカレンダー登録されない | E2E | US-29 | P2 |
| AT-S2-2 | 業務時間外排除 | 23時の候補が出ない | unit | US-30 | P2 |
| AT-S2-3 | 顧客TZ | UTC顧客にUTC表記併記 | E2E | US-31 | P2 |
| AT-S2-4 | 会議室予約 | onsiteで会議室込み確定 | E2E | US-32 | P2 |
| AT-S2-5 | Calendly風UI | 顧客1クリック確定 | E2E(token) | US-34 | P2 |
| AT-S2-6 | 仮押さえ release | 48h無返信→release | scheduled job test | US-35 | P2 |
| AT-S2-7 | 重複アプローチ警告 | 他営業既存meetingで警告 | E2E | US-36 | P2 |
| AT-S3-1 | 全NG再ドラフト | auto draft生成 | integration | US-38 | P2 |
| AT-S3-2 | 意図分類 | 電話希望→電話フロー | integration | US-39 | P2 |
| AT-S3-3 | CC追加検出 | attendees追加+カレ再送 | E2E | US-40 | P2 |
| AT-S3-4 | 別スレッド吸収 | References正規化で同meeting | integration | US-42 | P2 |
| AT-S3-5 | リスケ | 既存meeting更新+candidate再送 | E2E | US-43 | P2 |
| AT-S4-1 | ブリーフィング | 5分前push到達 | scheduled job | US-44 | P2 |
| AT-S4-2 | Zoom auto-record | auto_record=cloud設定 | integration | US-46 | P1 |
| AT-S4-3 | 商談中検索 | p95<300ms | perf | US-49 | P2 |
| AT-S5-1 | stage1<=5分 | 録画完了→transcript<5min | SLA test | US-51 | P1 |
| AT-S5-2 | PIIマスキング | 住所/電話/金額がmask | unit | US-53 | P2 |
| AT-S5-3 | sensitive化 | 検索/共有から除外 | integration | US-54 | P2 |
| AT-S5-4 | 顧客向け要約 | 社内メモ抜きが保証 | integration | US-55 | P2 |
| AT-S6-1 | 30秒UX | 顧客名→Top3 <3秒 | perf | US-56 | P2 |
| AT-S6-2 | 曖昧時系列 | 「2024年4月頃」→ range | unit | US-57 | P2 |
| AT-S6-3 | クリップ送信 | 期限+部分のみ | E2E | US-58 | P2 |
| AT-S7-1 | シナリオvariants | 乱択+履歴重複回避 | unit | US-60 | P3 |
| AT-S7-2 | 時間制限 | 制限超で強制終了 | unit | US-61 | P3 |
| AT-S7-3 | 降参モード | Hint返却 | integration | US-62 | P3 |
| AT-S7-4 | 失敗パターン | 集計job | scheduled | US-64 | P3 |
| AT-S8-1 | 個人スコア配慮 | 集計のみdefault | RLS test | US-70 | P3 |
| AT-S8-2 | 失注分析 | matrix生成 | integration | US-71 | P3 |
| AT-S9-1 | 認識ズレ報告 | CS→営業通知 | E2E | US-72 | P2 |
| AT-S9-2 | 更新3M前 | cron検出+通知 | scheduled | US-74 | P2 |
| AT-S10-1 | メールundo | 30秒以内cancel | E2E | US-76 | P2 |
| AT-S10-2 | Soft delete | 30日内restore | E2E | US-77 | P2 |
| AT-S10-3 | autosave | 通信切→復元 | E2E offline | US-81 | P1 |
| AT-S10-4 | admin大量削除 | reason+MFA+PITR | E2E+RLS | US-82 | P2 |
| AT-S10-5 | 2デバイス衝突 | mergeダイアログ | E2E | US-83 | P2 |
| AT-S11-1 | 録画同意 | 不同意→停止 | integration | US-84 | P2 |
| AT-S11-2 | 削除依頼 | 30日SLA | scheduled | US-85 | P2 |
| AT-S11-3 | 退職者ポリシー | retain/anonymize/delete実行 | integration | US-86 | P3 |
| AT-S11-4 | データ保管地域 | ap-northeast-1検証 | infra test | US-88 | P1 |
| AT-S12-1 | オンボーディング | 7ステップ完走 | E2E | US-89 | P1 |
| AT-S12-2 | CSV移行 | 重複検知マージ | integration | US-90 | P2 |
| AT-S13-1 | 検索ハイブリッド | NDCG@10>=0.7 | golden set | US-94 | P1 |
| AT-S13-2 | ハルシネーション | 引用なし回答0% | golden set | US-96 | P3 |
| AT-S13-3 | 古い情報 | badge表示 | unit | US-95 | P2 |
| AT-S14-1 | オフライン議事録 | cache hitで表示 | E2E offline | US-98 | P2 |
| AT-S14-2 | 音声メモ | 60秒上限 | unit | US-99 | P2 |
| AT-S14-3 | Push通知 | 返信受信通知 | integration | US-100 | P2 |
| AT-X-1 | データエクスポート | 暗号化zip生成 | integration | US-102 | P3 |
| AT-X-2 | PITR | 7日前にrollback成功 | DR test | US-103/82 | P3 |
| AT-X-3 | i18n | share/[token] enで全表示 | E2E | US-105 | P3 |
| AT-X-4 | a11y | axe 0 critical | CI gate | US-106 | P3 |
| AT-X-5 | Realtime | 2デバイスで同期 | E2E | US-108 | P2 |
| AT-X-6 | FF rollout | percentage反映 | integration | US-110 | P2 |
| AT-X-7 | A/B SRM | 割当の偏り検出 | scheduled | US-111 | P3 |
| ■ Round1指摘反映追加(v2.1) |  |  |  |  |  |
| シーンID | シナリオ | 受け入れ条件 | 自動化 | 対象US | Phase |
| AT-RLS-1 | org_id分離 | 他org行が見えない | pgTAP | T-1 | P1 |
| AT-RLS-2 | sensitivity tier | sensitive=owner+admin+legalのみ | pgTAP | M-C3 | P1 |
| AT-RLS-3 | embeddings RPC | 他org/他sensitivity非表示 | pgTAP | T-2 | P1 |
| AT-DLQ-1 | DLQ復元 | 失敗→DLQ→手動resume成功 | integration | M-14 | P1 |
| AT-LLM-Schema-1 | JSON出力崩壊 | tool_use+zodで100%パス、失敗時1再生成 | unit | M-8 | P1 |
| AT-LLM-Schema-2 | cost cap | $0.10超で拒否 | unit | M-9 | P2 |
| AT-Idem-1 | 二重送信 | 同key同hash→再生、同key別hash→409 | integration | T-5 | P1 |
| AT-Idem-2 | Webhook二重 | 同zoom_event2回→1record/1job | integration | T-3 | P1 |
| AT-OCC-1 | 楽観ロック | 2デバイスUPDATEで2回目409 | E2E | T-7 | P2 |
| AT-Audit-1 | hash chain | 破断検出 | scheduled | C-5 | P2 |
| AT-Audit-2 | WORM export | R2 Object Lock | integration | C-5 | P2 |
| AT-Compl-1 | per-attendee consent | 途中参加未同意→該当発話redact | integration | C-1,G-2 | P2 |
| AT-Compl-2 | 削除依頼下流伝播 | R2/Anthropic/OpenAI/PITRに伝播 | integration | C-3 | P2 |
| AT-Compl-3 | 退職SOP | SOP M-Day〜M+60走破 | integration | C-6 | P2 |
| AT-Share-1 | internal除外 | 共有時internal/sensitive 0件 | integration | G-3 | P2 |
| AT-DR-1 | DR restore | ap-northeast-3から復旧 | DR test | M-C4 | P2 |
| AT-Cost-1 | LLM kill switch | 予算150%でAPI停止 | integration | M-C6 | P1 |
| AT-CTI-1 | CTI matched | caller_phone→customer auto-pick | integration | G-1 | P3 |
| AT-Voice-1 | 録音中断 | 電話着信→部分保存→再開 | E2E | G-4 | P2 |
| AT-Soft-1 | 期限通知 | 7日前/1日前push受信 | scheduled | G-6 | P2 |
| AT-SW-1 | SW更新整合 | skipWaiting時の旧キャッシュ整合 | E2E | L-5 | P2 |
| AT-Tour-1 | habit-loop | 初週KPI未達alert | scheduled | G-13 | P3 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |  |
| シーンID | シナリオ | 受け入れ条件 | 自動化 | 対象US | Phase |
| AT-S1-Shake | 揺れ撮影 | fallback_capture_mode 3秒→1秒静止緩和+volume button shutter動作 | E2E(モバイルエミュ) | F-S1-1 | P1 |
| AT-S1-Defer | 低信頼度名刺 | status='deferred_review'で次撮影に進める | integration | F-S1-2 | P1 |
| AT-S1-EventLate | 取込中イベント切替 | BulkActions+ヘッダーチップで一括付与可 | E2E | F-S1-3 | P1 |
| AT-S2-DynTimeout | 上司invite dynamic timeout | 出張中=24h, 通常=4h | integration | F-S2-1 | P2 |
| AT-S2-Hold | calendar_holds透過性 | 同席者Calendarでbusy非ブロック | integration(GoogleCal API) | F-S2-2 | P2 |
| AT-S2-WorkHours | work_hours未設定警告 | AvailabilityPreviewにwarnings[] | unit | F-S2-3 | P2 |
| AT-S2-Counter | 顧客起点リスケ | SC-39で日程変更ボタン→AP-64 counter_propose | E2E | F-S2-4 | P2 |
| AT-S3-Sort | inbox優先順序 | 信頼度高×古い順、新人ハイライト | unit | F-S3-1 | P2 |
| AT-S3-Phone | 電話希望intent | reply_with_phone_template提示 | integration | F-S3-2 | P2 |
| AT-S3-CCExternal | 未登録CC | external_emailで一時保存+商談確定時contact化 | integration | F-S3-3 | P2 |
| AT-S4-Window | live-search別window | Zoom画面共有とコンフリクトしない | E2E manual | F-S4-1 | P2 |
| AT-S4-Consent | captured_via 全分岐 | zoom_apps/email_otp/verbal_logged の各経路で同意ログ | integration | F-S4-2 | P2 |
| AT-S4-Blanket | 社内blanket consent | late_join_pendingが自動captured | integration | F-S4-3 | P2 |
| AT-S4-Brief | brief degraded→full | 15分前縮退+5分前完全, 失敗時縮退維持 | integration | F-S4-4 | P2 |
| AT-S4-Pause | 録画停止アラート | webhook→30秒以内Push+SMS | integration | F-S4-5 | P1 |
| AT-S5-Stale | derived staleness | インライン編集後summary/handoff/embeddings版数+UI banner | E2E | F-S5-1 | P2 |
| AT-S5-ETA | stage ETA表示 | p95から動的算出 | unit | F-S5-2 | P2 |
| AT-S5-Audience | audience selector | internal/customer/legal/external各テンプレ適用 | integration | F-S5-3 | P2 |
| AT-S5-Speaker | speaker_chip学習 | voice_embeddingで以後自動命名 | integration | F-S5-4 | P2 |
| AT-S6-Customer | 顧客スコープ即時検索 | CTI着信時autofocus+1タップ→Top3 | E2E | F-S6-1 | P2 |
| AT-S6-Former | 退職者発言バッジ | former_employee_utterance=true行に黄色バッジ | integration | F-S6-2 | P2 |
| AT-S6-Snippet | 三段スニペット | -30s/hit/+15s表示 | unit | F-S6-3 | P2 |
| AT-S7-ETA | ロープレ進捗UI | ETA+stage SSE push | E2E | F-S7-1 | P3 |
| AT-S7-Severity | feedback severity | top3初期表示 | unit | F-S7-3 | P3 |
| AT-S8-Top5 | 注目案件Top5 | 金額×確度×停滞の根拠付き | integration | F-S8-1 | P3 |
| AT-S8-Observe | 観戦同意 | 常時/事前通知/個別承認の3パスでaudit | integration | F-S8-2 | P3 |
| AT-S8-Anomaly | 行動異常 | 本人+上長同時通知 | integration | F-S8-4 | P3 |
| AT-S9-SLA | handoff 48/72h | escalate実行 | scheduled | F-S9-1 | P2 |
| AT-S9-Terms | contract_special_terms | enum+owner+due_date必須 | unit | F-S9-2 | P2 |
| AT-S10-Restore | PITRセルフサービス | admin+legal dual approval | E2E | F-S10-1 | P3 |
| AT-S10-Evidence | monthly evidence pack | PDF+SHA256+GPG生成 | scheduled | F-S10-2 | P2 |
| AT-S10-Cost | cost actuals | Top3 over capでSlack | scheduled | F-S10-4 | P2 |
| AT-S11-WORMConflict | WORM vs 削除SLA | worm_retention_required拒否+legal review | integration | F-S11-1 | P2 |
| AT-S11-AdminUI | 削除依頼レビューUI | SC-60a経由でidentity verify→approve | E2E | F-S11-2 | P2 |
| AT-S11-LegalDual | dual_approver legal必須 | 片方role=legalでvalidation | RLS | F-S11-3 | P2 |
| AT-S12-Order | O-11前倒し | M-Day 16:00 export → 16:30 revoke | integration | F-S12-1 | P2 |
| AT-S12-Resume | legacy_import再開 | staged_stateで継続 | E2E | F-S12-2 | P2 |
| AT-S13-Citation | chat citation deeplink | タップで/recordings/[id]?t=mm:ss | E2E | F-S13-1 | P3 |
| AT-S13-Deprecated | deprecated default除外 | exclude_deprecated=true初期 | integration | F-S13-2 | P2 |
| AT-S13-Granular | 日時パース粒度別 | 曜日明示=±0/月単位=±1M | unit | F-S13-3 | P2 |
| AT-S14-Wipe | is_active=falseでIndexedDB wipe | 次回SW boot時実行 | E2E | F-S14-1 | P1 |
| AT-S14-VoiceSeg | 録音中断連結 | segments[]→最終transcribe結合 | E2E | F-S14-2 | P2 |
| AT-S14-SyncSuccess | 同期成功badge | throttle 10s bundle | integration | F-S14-3 | P2 |
| AT-UX-i18nPDF | 英語PDF | viewer accept-language=enでen PDF | E2E | F-UX-1 | P3 |
| AT-UX-A11y | SC別ARIA | jest-axe+各SCにcompoenent test | unit+CI gate | F-UX-2 | P3 |
| AT-UX-Export | 個人エクスポート | 対象種別+パスフレーズSMS/別Email | E2E | F-UX-3 | P3 |
| AT-UX-NotifDedup | 通知重複抑制 | 同event_id 5分以内Push>Slack>Email | integration | F-UX-4 | P2 |
| AT-UX-Help20 | help 20記事seed | P1リリース時に最低20件 | release gate | F-UX-5 | P2 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |
| シーンID | シナリオ | 受け入れ条件 | 自動化 | 対象US | Phase |
| AT-S4-Verbal | verbal同意の循環解消 | 録画停止せずverbal_proof_locked=true→48h保持→audio_proof引用可 | integration | NF-S4-1 | P2 |
| AT-S7-Optin | ロープレ共有opt-in | 新人の初回起動でモーダル表示+opt-in必須 | E2E | F-S7-4再 | P3 |
| AT-S11-3Approval | 3者承認チェーン | 法務→情シス→代理人の順序enforce | RLS+E2E | F-S11-3再 | P2 |
| AT-S13-Pending | speaker pending citation | 破線枠+aria-label+confidence%表示, <0.4で降格 | E2E+axe | F-S13-4再 | P3 |
| AT-S14-DLQ | Zoom historical DLQ | 3失敗→DLQ→手動retry | integration | F-S14-4再 | P3 |
| AT-S2-AwayHeuristic | 出張heuristic | flight email+hold密度でaway推定→24h timeout | integration | NF-S2-1 | P2 |
| AT-S3-Followup | convert_to_visit時のcontact化prompt | 住所/電話未入力ではsuggested_action実行不可 | E2E | NF-S3-1 | P2 |
| AT-S5-Debounce | derived_artifacts debounce | 60秒静止で1回のみregen実行 | integration | NF-S5-1 | P2 |
| AT-UX-Translate | voice_memo on-the-fly translation | share閲覧時en翻訳+disclaimer表示 | E2E | NF-UX-1 | P3 |
| AT-S2-CalAPI | Google Cal API制約対応 | attendees_dimmedで同席者にinvite未送信 | integration | NF-S2-2 | P2 |
| AT-S4-PauseDispatch | 録画停止SMS分岐 | 本人=Pushのみ, admin=Push+SMS | integration | NF-S4-2 | P1 |
| AT-S5-Layer | former_employee+masked layer | 表示優先ルール準拠 | E2E | NF-S5-2 | P2 |
| AT-S8-CIThreshold | AI予測しきい値 | <0.6警告/<0.4非表示 | unit | NF-S8-1 | P3 |
| AT-S9-Taxonomy | taxonomy承認フロー | proposed→legal_review→admin_approve→active | integration | NF-S9-1 | P3 |
| AT-S10-RTO | PITR RTO/RPO表示 | SC-78にrto_min/rpo_min/queue_eta_min | E2E | NF-S10-1 | P3 |
| ■ v2.5 追加(R3 minor) |  |  |  |  |  |
| シーンID | シナリオ | 受け入れ条件 | 自動化 | 対象US | Phase |
| AT-S14-DLQUI | SC-126 DLQ画面 | DLQTable+RetryButton+CSVExport+aria-label | E2E+axe | NF3-S14-1 | P3 |
| AT-UX-HumanTranslate | 人手翻訳エスカレ | SC-31リンク→AP-149→q_voice_memo_translate_human→SLA 5営業日 | E2E | NF3-UX-2 | P3 |
| AT-A11Y-Confidence | speaker_confidence動的通知 | aria-live=politeで読み上げ | NVDA手動 | NF3-A11Y-1 | P3 |
| AT-S11-RepKYC | 代理人KYC | POA url+ID url必須でないと承認不可 | RLS+E2E | NF3-S11-1 | P2 |
| AT-S2-AwayMulti | 多言語出張検出 | en-US itinerary/zh-CN出差通知でtimeout=24h延長 | integration | NF3-S2-1 | P2 |
| AT-S5-RegenNow | 手動再生成上書き | debounce残30秒で『今すぐ』を押すとjob即実行 | E2E | NF3-S5-1 | P2 |
| AT-S4-VerbalExtend | verbal_proof再延長3回 | 4回目はauto_purged+admin通知 | integration | NF3-S4-1 | P2 |
| AT-S7-Downgrade | roleplay downgrade遡及 | full→team_blurredで未視聴のみ再ぼかし、既存視聴履歴保持 | integration | NF3-S7-1 | P3 |
| AT-S8-Backlog | review_backlogバッジ | 部下別×件数×最古日数表示 | E2E | NF3-S8-1 | P3 |
| AT-S9-Orphan | taxonomy archive後の参照 | 読取専用で保持+新規作成不可+migration可 | integration | NF3-S9-1 | P3 |