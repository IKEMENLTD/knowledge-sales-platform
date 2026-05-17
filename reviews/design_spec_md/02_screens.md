# 02_screens

| 画面一覧 |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ルーティング・主要コンポーネント・状態管理 |  |  |  |  |  |  |  |  |
| 画面ID | ルート | 種別 | 概要 | 主要コンポーネント | 主要API | 認証 | モバイル | Phase |
| SC-01 | /login | 認証 | ログイン画面(Google OAuth) | GoogleSignInButton | Supabase Auth | 不要 | 対応 | P1 |
| SC-02 | /onboarding | 初回設定 | OAuthスコープ取得・Zoom連携・タイムゾーン設定 | OAuthScopeStep, ZoomConnectStep, ProfileStep | /api/oauth/scopes, /api/zoom/connect | 必要 | 対応 | P1 |
| SC-03 | /dashboard | ダッシュボード | 個人TODO・最近の商談・通知 | TodoList, RecentMeetings, NotificationFeed | /api/dashboard | 必要 | 対応 | P1 |
| SC-04 | /contacts | 一覧 | コンタクト一覧(検索/フィルタ) | ContactsTable, FilterBar, BulkActions | /api/contacts | 必要 | 対応 | P1 |
| SC-05 | /contacts/[id] | 詳細 | コンタクト詳細・商談履歴・メール履歴 | ContactProfile, MeetingsTab, EmailsTab, NotesTab | /api/contacts/[id] | 必要 | 対応 | P1 |
| SC-06 | /contacts/import | 取り込み | PC用一括名刺アップロード | MultiFileDropzone, OCRProgressList, ReviewQueue | /api/ocr/business-card (POST) | 必要 | 一部 | P1 |
| SC-07 | /mobile/scan | モバイル取り込み | スマホでの連続名刺撮影 | CameraView, AutoCropPreview, QuickReview | /api/ocr/business-card | 必要 | 専用 | P1 |
| SC-08 | /contacts/[id]/review | 取り込みレビュー | OCR結果のフィールド編集と重複マージ | EditableFieldList, DuplicateMergeBanner, RawOCRViewer | /api/contacts/[id], /api/contacts/duplicates | 必要 | 対応 | P1 |
| SC-09 | /meetings | 一覧 | 商談一覧(Kanban/List切替) | MeetingsKanban, MeetingsTable, StageFilter | /api/meetings | 必要 | 対応 | P1 |
| SC-10 | /meetings/new | 新規作成 | 商談作成・日程調整起動 | ContactPicker, AttendeesPicker, EmailTemplatePicker, AvailabilityPreview | /api/availability, /api/scheduling/start | 必要 | 対応 | P2 |
| SC-11 | /meetings/[id] | 詳細 | 商談詳細(録画/文字起こし/抽出/メモ) | MeetingHeader, RecordingPlayer, TranscriptTimeline, ExtractedInsights, ManualNotes, CommitmentsList | /api/meetings/[id], /api/recordings/[id] | 必要 | 対応 | P1 |
| SC-12 | /meetings/[id]/live-notes | ライブメモ | 商談中のタイムスタンプ付きメモ | TimestampedNotePad, AutoSaveIndicator | /api/meetings/[id]/notes | 必要 | 対応 | P2 |
| SC-13 | /email-drafts/[id] | メールドラフト確認 | 送信前ドラフト編集 | DraftEditor, RecipientList, ScheduleSlotsPreview, SendButton | /api/email-drafts/[id], /api/email-drafts/[id]/send | 必要 | 対応 | P2 |
| SC-14 | /scheduling/inbox | 日程調整インボックス | パース確認待ち一覧 | PendingParseList, ProposedSlotsViewer, ManualResolveDialog | /api/scheduling/pending | 必要 | 対応 | P2 |
| SC-15 | /recordings | 録画一覧 | 全社録画ライブラリ | RecordingsGrid, SearchBar, FilterChips | /api/recordings | 必要 | 対応 | P1 |
| SC-16 | /recordings/[id] | 録画詳細 | 動画+文字起こし+クリップ生成 | VideoPlayer, SyncedTranscript, ClipCreator, ShareDialog | /api/recordings/[id], /api/clips | 必要 | 対応 | P1 |
| SC-17 | /search | 横断検索 | ナレッジ・録画・コンタクト統合検索 | SearchBar, FacetFilter, ResultGroupList(録画/資料/メモ) | /api/search (hybrid: BM25+vector) | 必要 | 対応 | P1 |
| SC-18 | /knowledge | ナレッジチャット | AIアシスタントへの質問 | ChatInterface, SourcesPanel, FeedbackButtons | /api/chat (streaming) | 必要 | 対応 | P3 |
| SC-19 | /knowledge/library | ナレッジライブラリ | 資料・FAQ一覧と管理 | KnowledgeGrid, UploadButton, TagFilter, AIDescriptionEditor | /api/knowledge | 必要 | 対応 | P2 |
| SC-20 | /roleplay | ロープレ一覧 | シナリオ選択画面 | ScenarioGrid, DifficultyFilter, MyHistory | /api/roleplay/scenarios | 必要 | 対応 | P3 |
| SC-21 | /roleplay/[id] | ロープレ実施 | 顧客役AIとの対話 | ChatInterface, PersonaCard, EndSessionButton, FeedbackPanel | /api/roleplay/sessions, /api/roleplay/sessions/[id]/turns | 必要 | 対応 | P3 |
| SC-22 | /roleplay/[id]?mode=voice | ロープレ音声 | 音声でのロープレ | VoiceInput(WebSpeech), VoiceOutput(TTS), Transcript | /api/roleplay/voice | 必要 | 対応 | P3 |
| SC-23 | /handoffs/new | 引き継ぎ作成 | 営業→CS引き継ぎ書作成 | HandoffForm(自動充填), ApprovalFlow | /api/handoffs | 必要 | 対応 | P2 |
| SC-24 | /contracts/[id] | 契約詳細 | 契約情報と関連商談・約束事 | ContractInfo, RelatedMeetings, CommitmentsList | /api/contracts/[id] | 必要 | 対応 | P2 |
| SC-25 | /dashboard/manager | マネージャーDB | パイプライン/AI診断 | PipelineFunnel, TeamScoreboard, AIInsights | /api/dashboard/manager | 必要(role=manager) | 対応 | P3 |
| SC-26 | /team/roleplay | チームロープレ | メンバーのセッション閲覧&コーチング | MemberSessionList, CoachingCommentBox | /api/team/roleplay | 必要(role=manager) | 対応 | P3 |
| SC-27 | /admin/users | ユーザー管理 | メンバー招待・無効化 | UserTable, InviteDialog, OffboardingDialog | /api/admin/users | 必要(role=admin) | 対応 | P1 |
| SC-28 | /admin/audit | 監査ログ | 操作ログ閲覧 | AuditLogTable, FilterBar, ExportButton | /api/admin/audit | 必要(role=admin) | 対応 | P2 |
| SC-29 | /admin/usage | コスト管理 | API使用量と上限 | UsageChart, LimitConfig, AlertHistory | /api/admin/usage | 必要(role=admin) | 対応 | P3 |
| SC-30 | /admin/knowledge | ナレッジレビュー | AI抽出結果の承認 | ReviewQueue, BulkApprove | /api/admin/knowledge/queue | 必要(role=manager) | 対応 | P2 |
| SC-31 | /share/[token] | 共有閲覧 | 期限付き共有リンク表示 | SharedContentViewer, AccessLogger | /api/share/[token] | 不要(token認証) | 対応 | P2 |
| SC-32 | /settings | 個人設定 | プロフィール・通知・連携 | ProfileSection, NotificationPrefs, IntegrationsList | /api/settings | 必要 | 対応 | P1 |
| ■ 追加画面(現場UX補完 v2) |  |  |  |  |  |  |  |  |
| 画面ID | ルート | 種別 | 概要 | 主要コンポーネント | 主要API | 認証 | モバイル | Phase |
| SC-33 | /mobile/scan | モバイル取り込み(改修) | 暗所/片手撮影最適化版 | CameraView+AutoCorrect, GuideOverlay, BurstMode, FlashToggle, ShakeDetector, HapticFeedback, BackSideAdd, EventTagPicker, VoiceMemoStep | /api/ocr/business-card, /api/ocr/qr, /api/contact-memos | 必要 | 専用 | P1 |
| SC-34 | /mobile/queue | オフラインキュー | 通信断時の取り込み待ち一覧 | QueueList, RetryButton, ConflictResolver | /api/offline-queue | 必要 | 専用 | P1 |
| SC-35 | /mobile/quick-lookup | 会場用即時検索 | 「あの人どこの会社」検索 | SearchBar(voice対応), RecentImports, OfflineCache | /api/contacts/quick-search | 必要 | 専用 | P1 |
| SC-36 | /events | イベント一覧 | 名刺取得イベント管理 | EventList, NewEventDialog | /api/events | 必要 | 対応 | P2 |
| SC-37 | /inbox/internal-invites | 社内同席inbox | 上司/同僚の同席依頼受信箱 | InviteList, AcceptDeclineButtons | /api/internal-invites | 必要 | 対応 | P2 |
| SC-38 | /settings/availability | 業務時間設定 | work_hours/lunch/days_off設定 | WeeklyHoursEditor, HolidayCalendar | /api/availability-settings | 必要 | 対応 | P2 |
| SC-39 | /share/[token]/scheduling | 顧客向け日程選択 | Calendly風UI | WeekCalendar, SlotPicker, ConfirmDialog | /api/share/[token]/slots | 不要(token) | 対応 | P2 |
| SC-40 | /admin/delegates | 代理権限管理 | 休暇中の代理メール送信 | DelegatesList, GrantDialog | /api/admin/delegates | 必要(admin) | 対応 | P3 |
| SC-41 | /scheduling/inbox(改修) | 返信パース改修 | 意図分類・全NG・別スレッド吸収 | IntentTagFilter, RedraftButton, ThreadMergeBanner | /api/scheduling/parse, /api/scheduling/redraft | 必要 | 対応 | P2 |
| SC-42 | /meetings/[id]/brief | 商談前ブリーフィング | 5分前自動表示 | BriefCard(過去要約/ニーズ/資料/同席者), JoinZoomButton | /api/meetings/[id]/brief | 必要 | 対応 | P2 |
| SC-43 | /meetings/[id]/live-search | 商談中即時検索 | 資料/過去発言を商談中に検索 | SearchPanel, ScreenShareLinkGenerator | /api/search?context=live | 必要 | 対応 | P2 |
| SC-44 | /meetings/[id]/external-summary | 顧客向け要約 | 社内メモ抜き要約PDF | ExternalSummaryEditor, PDFExport, ShareLink | /api/meetings/[id]/external-summary | 必要 | 対応 | P2 |
| SC-45 | /support/quick-search | CSクレーム30秒UX | 顧客名1タップ→該当発言 | CustomerPickPad, TopUtterancesList, ContextPreview | /api/support/quick-search | 必要 | 対応 | P2 |
| SC-46 | /recordings/[id]/clip | クリップ作成共有 | 部分切り出し+期限付きリンク | ClipRangePicker, ShareLinkDialog | /api/recordings/[id]/clip | 必要 | 対応 | P2 |
| SC-47 | /team/roleplay/live | ロープレ観戦/介入 | マネージャー向け | ObservePane, InterventionDock | /api/roleplay/observe | 必要(manager) | 対応 | P3 |
| SC-48 | /admin/insights | 失敗パターン分析 | 全社傾向 | FailurePatternsChart, MonthlyReport | /api/admin/insights | 必要(admin) | 対応 | P3 |
| SC-49 | /dashboard/manager/diagnostics | 受注率診断 | AI診断レポート | DiagnosisCard, FactorsBreakdown | /api/dashboard/diagnostics | 必要(manager) | 対応 | P3 |
| SC-50 | /team/top-phrases | トップ営業表現集 | 優秀者の話し方 | PhraseLibrary, ConsentBadge | /api/team/top-phrases | 必要(manager) | 対応 | P3 |
| SC-51 | /admin/positioning | 製品説明テンプレ | 承認制テンプレ | TemplateEditor, ApprovalFlow | /api/admin/positioning | 必要(admin) | 対応 | P3 |
| SC-52 | /dashboard/manager/losses | 失注分析 | 業界×反論クロス | LossMatrix, NarrativeSummary | /api/dashboard/losses | 必要(manager) | 対応 | P3 |
| SC-53 | /handoffs/[id]/preview | 引き継ぎ予習 | CSがキックオフ前に確認 | HandoffViewer, HighlightClips, Checklist | /api/handoffs/[id]/preview | 必要 | 対応 | P2 |
| SC-54 | /complaints | クレーム履歴 | 商談紐付け一覧 | ComplaintsTable, LessonsLearned | /api/complaints | 必要 | 対応 | P3 |
| SC-55 | /admin/trash | ゴミ箱 | Soft delete復旧 | TrashTable, RestoreButton, PurgeButton | /api/admin/trash | 必要(admin) | 対応 | P2 |
| SC-56 | /admin/audit/rollback | ロールバック | PITR操作 | TimeRangePicker, AffectedTablesPreview, ConfirmDialog | /api/admin/rollback | 必要(admin) | 対応 | P3 |
| SC-57 | /admin/policy | 退職者発言ポリシー | retain/anonymize/delete | PolicySelector, ApplyToHistorical | /api/admin/policy | 必要(admin) | 対応 | P3 |
| SC-58 | /admin/legal | 法的開示窓口 | チェーンオブカストディ | DisclosureRequestForm, ExportLog | /api/admin/legal | 必要(admin) | 対応 | P3 |
| SC-59 | /admin/backup | バックアップ可視化 | PITR状態 | BackupStatusCard, RestorePoints | /api/admin/backup | 必要(admin) | 対応 | P2 |
| SC-60 | /share/[token]/request | 削除依頼窓口 | 顧客の発言削除依頼 | DeletionRequestForm, RequestStatus | /api/share/[token]/deletion-request | 不要(token) | 対応 | P2 |
| SC-61 | /onboarding(改修) | ガイド付きツアー | サンプルデータ+7ステップ | SampleDataLoader, TourSteps, SkipButton | /api/onboarding | 必要 | 対応 | P1 |
| SC-62 | /contacts/import/legacy | 既存名刺移行 | CSV/Sansan/Eight | FileDropzone, FieldMapper, DupeMergeUI | /api/contacts/import/legacy | 必要 | 一部 | P2 |
| SC-63 | /recordings/import | 録画移行 | Zoom historical一括 | ZoomDateRangePicker, ProgressList | /api/recordings/import | 必要 | 対応 | P3 |
| SC-64 | /onboarding/learn | 学習リスト | 新人推奨閲覧 | RecommendedItemsList, ProgressBar | /api/onboarding/recommendations | 必要 | 対応 | P3 |
| SC-65 | /help | ヘルプセンター | FAQ・問い合わせ | FAQList, SearchBar, ContactForm | /api/help | 必要 | 対応 | P2 |
| SC-66 | /settings/notifications | 通知設定 | Push/Email/Slack | ChannelToggles, FrequencyPicker, QuietHours | /api/settings/notifications | 必要 | 対応 | P1 |
| SC-67 | /settings/export | 個人データエクスポート | CSV/JSON | ExportRequestForm, History | /api/exports/personal | 必要 | 対応 | P3 |
| SC-68 | /admin/features | feature flags管理 | β機能ロールアウト | FlagsTable, RolloutPercentage | /api/admin/feature-flags | 必要(admin) | 対応 | P2 |
| SC-69 | /admin/experiments | A/Bテスト | コホート/有意差 | ExperimentList, MetricsChart | /api/admin/experiments | 必要(admin) | 対応 | P3 |
| SC-70 | /403 | 権限不足 | エラーではなく申請動線 | PermissionRequestButton, SupervisorPicker | /api/permission-requests | 必要 | 対応 | P1 |
| SC-71 | /offline | オフライン待ち受け | 通信断時UI | CachedListPreview, RetryNetwork | (SW) | 必要 | 対応 | P1 |
| SC-72 | /mobile/voice-memo | 音声メモ | 録音→文字→商談紐付け | Recorder, TranscriptPreview, MeetingPicker | /api/voice-memos | 必要 | 専用 | P2 |
| SC-73 | /dashboard(改修) | ホーム改修 | RecentViews/RenewalAlert/UpsellSignals追加 | RecentViewsCarousel, RenewalAlerts, UpsellQueue | /api/dashboard | 必要 | 対応 | P1 |
| SC-74 | /inbox/conflicts | 編集競合解決 | 2デバイス衝突 | ConflictDiffViewer, MergeButtons | /api/conflicts | 必要 | 対応 | P2 |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |  |  |  |  |
| 画面ID | ルート | 種別 | 概要 | 主要コンポーネント | 主要API | 認証 | モバイル | Phase |
| SC-75 | /onboarding/install-pwa | モバイル初回設定 | iOS Safari向けPWAインストール促進画面 | InstallPWAGuide(iOSSteps), AddToHomeScreenHint, NotificationPermissionPrompt | - | 必要 | 専用 | P2 |
| SC-76 | /settings/handedness | 個人設定 | 左右利き/UI ミラーリング設定 | HandednessPicker, ReachZonePreview | /api/settings/handedness | 必要 | 対応 | P3 |
| SC-77 | /admin/audit-chain | 監査ハッシュチェーン | 破断検出と検証 | ChainStatusCard, BrokenRangePicker, VerifyButton | /api/admin/audit/verify-chain | 必要(admin) | 対応 | P2 |
| SC-78 | /admin/dr | DR コントロール | DR バックアップ状態とリストア | BackupStatusList, RestorePointsTable, FailoverDialog | /api/admin/dr/restore-points | 必要(admin)+MFA | 対応 | P2 |
| SC-79 | /admin/users/offboarding/[id] | 退職処理進捗 | O-01〜O-16 チェックリスト | OffboardingChecklist, OwnerTransferDialog, LegalHoldFlag | /api/admin/users/offboarding/[id] | 必要(admin) | 対応 | P2 |
| ■ v2.3 追加画面(実演シミュ反映) |  |  |  |  |  |  |  |  |
| 画面ID | ルート | 種別 | 概要 | 主要コンポーネント | 主要API | 認証 | モバイル | Phase |
| SC-60a | /admin/deletion-requests | 管理画面 | 削除依頼レビュー(F-S11-2) | TicketTable, SLACountdown, IdentityVerifyPanel, RejectionReasonEnum, DownstreamPropagationStatus | /api/admin/deletion-requests | 必要(admin/legal) | 対応 | P2 |
| SC-80 | /admin/audit-evidence | 管理画面 | 監査エビデンスパック(F-S10-2) | MonthlyPackList, GenerateButton, GPGSignatureViewer | /api/admin/audit-evidence | 必要(admin)+MFA | 対応 | P2 |
| SC-81 | /admin/cost-actuals | 管理画面 | コスト実績ダッシュ(F-S10-4) | ScopeFilter(user|team|feature), CapReachedHeatmap, MoMComparison | /api/admin/cost-actuals | 必要(admin) | 対応 | P2 |
| SC-82 | /contacts/import (改修) | 取込 | 未レビュー◯件バッジ+batch_review_modeへdeeplink(F-S1-2) | UnreviewedBadge, BatchReviewLink | /api/contacts/unreviewed-count | 必要 | 一部 | P1 |
| SC-83 | /share-audience-presets | 管理画面 | 共有テンプレ(F-S5-3) | AudienceTable(internal/customer/legal/external_partner), MaskingPolicyEditor | /api/admin/share-audience-presets | 必要(admin) | 対応 | P2 |
| SC-84 | /admin/anomalies | 管理画面 | 行動異常レビュー(F-S8-4) | AnomalyList, AcknowledgeByUserBadge, EscalationButton | /api/admin/anomalies | 必要(manager) | 対応 | P3 |
| SC-85 | /help/articles (改修) | ヘルプ | P1リリース時20記事seed(F-UX-5) | ArticleSeedListMarker, FAQSearch | /api/help/articles | 必要 | 対応 | P2 |
| SC-86 | /settings/export(改修) | 個人設定 | 対象種別チェックボックス+パスフレーズ二経路(F-UX-3) | ScopeCheckboxes, PassphraseChannelPicker(SMS/別Email), Expiry7d | /api/exports/personal | 必要 | 対応 | P3 |
| ■ v2.3 既存SCのa11y要件追加列(F-UX-2) |  |  |  |  |  |  |  |  |
| 画面ID | a11y要件 | focus_order | aria_live優先度 | focus_trap対象 | ロード時抑制 | - | - | - |
| SC-03 dashboard | RecentViewsCarousel role=region/aria-roledescription=carousel | Skip→TodoList→Recent→Renewal→Upsell | alerts=off→操作後polite, 3件以上=サマリ | ModalDrawer | ロード時live=offで一括読み上げ防止 | - | - | P3 |
| SC-11 meeting | TranscriptTimeline aria-label='文字起こしタイムライン'+segment role=button | Header→Player→Transcript→Insights | stage完了通知=polite | ShareDialog | - | - | - | P3 |
| SC-17 search | SearchBar aria-label/results role=listbox | Bar→Filters→Results | 結果0件=polite,新着=off | - | - | - | - | P3 |
| SC-43 live-search | 別windowはfocus inheritance確保 | SearchBar→Results→Share | - | ScreenSharePersonaDialog | - | - | - | P3 |
| SC-72 voice-memo | Recorder aria-pressed状態通知 | Picker→Recorder→Submit | 録音中=assertive(中断検知時) | - | - | - | - | P3 |
| SC-25 manager | Top5/Top3 注目案件リスト role=list | Top5→部下別→明細 | KPI急変=polite | - | ロード時はlive=off | - | - | P3 |
| ■ v2.5 追加・整理(R3 minor) |  |  |  |  |  |  |  |  |
| 画面ID | ルート | 種別 | 概要 | 主要コンポーネント | 主要API | 認証 | モバイル | Phase |
| SC-126 | /admin/import-dlq | 管理 | DLQ可視化+手動再実行(NF3-S14-1) | DLQTable, RetryButton, CSVExportButton, aria-label='インポート失敗キュー一覧' | /api/admin/import-dlq, AP-142 | 必要(admin) | 対応 | P3 |
| SC-86(整理) | /settings/export | 個人設定 | 個人エクスポート専用に戻す(NF3-S14-1) | ExportRequestForm, History | /api/exports/personal | 必要 | 対応 | P3 |
| SC-31(改) | /share/[token] | 共有 | 人手翻訳リンク追加(NF3-UX-2) | SharedContentViewer, MachineTranslatedBadge, RequestHumanTranslationLink | /api/share/[token], AP-139 | 不要(token) | 対応 | P2 |
| SC-25(改v2.5) | /dashboard/manager | マネージャーDB | 信頼区間<0.4 退避タブ+バックログバッジ(NF3-S8-1) | PipelineFunnel, ReviewBacklogBadge, RequiresReviewTab | /api/dashboard/manager | 必要(manager) | 対応 | P3 |
| SC-60a(改v2.5) | /admin/deletion-requests | 管理 | 代理人KYCタブ追加(NF3-S11-1) | TicketTable, IdentityVerifyPanel(本人/代理人タブ), POAUploader, ApprovalChainViewer | /api/admin/deletion-requests, AP-141 | 必要(admin/legal) | 対応 | P2 |
| SC-11(改v2.5) | /meetings/[id] | 商談詳細 | 『今すぐ再生成』ボタン+残秒数(NF3-S5-1) | RegenNowButton, DebounceCountdown | /api/recordings/[id]/regen-now (AP-148) | 必要 | 対応 | P2 |