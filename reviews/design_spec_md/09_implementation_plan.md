# 09_implementation_plan

| Phase別実装計画 |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code への指示書として使用 |  |  |  |  |  |  |  |
| ■ Phase 1 (Week 1-4): データ基盤+録画アーカイブ |  |  |  |  |  |  |  |
| 週 | 日 | ID | タスク | 成果物 | 依存 | 時間 | Claude Codeへの指示 |
| W1 | D1 | T-001 | モノレポ初期化 | package.json, turbo.json, tsconfig共通 | - | 0.5d | pnpm + Turborepo で apps/web (Next.js15), apps/worker (Hono), packages/db (Drizzle), packages/shared を生成。tsconfig共通化。 |
| W1 | D1 | T-002 | Supabase プロジェクト作成 | project URL, keys | - | 0.5d | Supabase ダッシュボードで作成(手動)。Database拡張で pgvector, pgmq, pg_cron を有効化。 |
| W1 | D2 | T-003 | Drizzle スキーマ実装 | packages/db/schema.ts | T-001 | 1d | 03_data_model シートの全P1テーブルを Drizzle 定義。drizzle-kit generate でmigration生成、push実行。 |
| W1 | D3 | T-004 | RLS+RPC+トリガー | migrations/0002_rls.sql | T-003 | 1d | 08_security_rls シートの全P1ポリシーをmigrationに。set_updated_at triggerと match_knowledge RPCも含める。 |
| W1 | D4 | T-005 | 認証基盤 | supabase auth+middleware | T-002 | 1d | Supabase Auth Google Provider 設定。calendar/gmail スコープ追加。/login, /onboarding 画面実装、middlewareで未認証リダイレクト。 |
| W1 | D5 | T-006 | Render デプロイ | web service + worker service | - | 0.5d | render.yaml 作成。Web Service(Next.js) と Background Worker(Hono) を定義。環境変数設定。 |
| W2 | D1-2 | T-007 | 名刺アップロードUI(PC) | /contacts/import | T-005 | 2d | D&Dで複数画像アップロード。Supabase Storage business-cards バケットへ保存。pgmq:process_business_card 投入。進捗は Realtime subscription で表示。 |
| W2 | D3 | T-008 | モバイル名刺撮影 | /mobile/scan | T-007 | 1d | getUserMediaでカメラ起動。auto-crop は CSS clip-path + 4点検出は v1ではユーザー手動。連続撮影モード。 |
| W2 | D4 | T-009 | OCR Worker(business_card) | apps/worker/jobs/process_business_card.ts | T-006 | 1d | Vision API Document AI 呼び出し → PROMPT-02 でClaude整形 → 重複検知(domain+name) → contacts upsert。 |
| W2 | D5 | T-010 | 名刺レビュー画面 | /contacts/[id]/review | T-009 | 1d | 抽出フィールド編集フォーム。重複検出時はマージ/別人選択UIを表示。 |
| W3 | D1 | T-011 | Zoom Webhook受信 | /api/webhooks/zoom | T-006 | 1d | recording.completed 受信。x-zm-signature 検証。meetings/recordings upsert。pgmq:process_recording 投入。3秒以内200返却。 |
| W3 | D2-3 | T-012 | 録画処理Worker | apps/worker/jobs/process_recording.ts | T-011 | 2d | 06_external_integrations の Zoom 録画フロー17ステップを実装。エラー時はprocessing_status=failed+管理者Slack通知。冪等性のためzoom_recording_id でユニーク。 |
| W3 | D4 | T-013 | Embedding生成Worker | apps/worker/jobs/generate_embeddings.ts | T-012 | 1d | 800トークンチャンク+overlap100。OpenAI text-embedding-3-small バッチAPI。knowledge_embeddings upsert。 |
| W3 | D5 | T-014 | 商談一覧+詳細画面 | /meetings, /meetings/[id] | T-012 | 1d | Kanban(by stage) と Listを切替。詳細では文字起こしtimeline+ video player同期、抽出インサイト表示&編集可能。 |
| W4 | D1 | T-015 | ハイブリッド検索API | /api/search | T-013 | 1d | BM25(Postgres tsvector) + ベクトル類似度のRRF融合。リソース別グループ化。 |
| W4 | D2 | T-016 | 検索UI | /search | T-015 | 1d | クエリ入力、グループ別タブ、ハイライト、該当箇所ジャンプ。 |
| W4 | D3 | T-017 | ユーザー管理 | /admin/users | T-005 | 1d | 招待メール(Resend)、ロール変更、退職処理(is_active=false, OAuthトークン削除, contacts.owner一括移管)。 |
| W4 | D4 | T-018 | 通知システム | /api/notifications + UI | - | 1d | Realtime subscription でリアルタイム通知。録画処理完了/メール返信受信/引き継ぎ要請等。 |
| W4 | D5 | T-019 | Phase1 統合テスト+デプロイ | - | 全部 | 1d | E2Eシナリオ:名刺取り込み→商談作成→Zoom録画完了→処理完了→検索ヒット までを通す。 |
| ■ Phase 2 (Week 5-8): 日程調整自動化+ナレッジ+引き継ぎ |  |  |  |  |  |  |  |
| 週 | 日 | ID | タスク | 成果物 | 依存 | 時間 | Claude Codeへの指示 |
| W5 | D1-2 | T-020 | メールテンプレート管理 | /settings/templates | P1完 | 2d | CRUDと変数プレースホルダ機能。デフォルトで「初回打診/2回目/お礼」テンプレ用意。 |
| W5 | D3 | T-021 | 空き枠取得API | /api/availability | P1完 | 1d | Calendar freebusy.query 複数 calendarId AND。営業時間フィルタ・タイムゾーン考慮。 |
| W5 | D4-5 | T-022 | 日程調整起動UI | /meetings/new | T-021 | 2d | 同席者選択→空き枠プレビュー→候補選択→テンプレ選択→ドラフト編集→送信。 |
| W6 | D1 | T-023 | Gmail Pub/Sub設定 | GCP Pub/Sub topic | P1完 | 1d | topic作成、subscribers設定。各ユーザーOAuth後にusers.watch呼び出し。/api/webhooks/gmail でPush受信。 |
| W6 | D2-3 | T-024 | メール返信パースWorker | parse_email_reply | T-023 | 2d | history.list で新着取得→thread引き当て→PROMPT-03 で意図分類→低confidence は needs_review。 |
| W6 | D4 | T-025 | パース確認画面 | /scheduling/inbox | T-024 | 1d | needs_review 一覧、手動で正解選択。確定で /api/scheduling/[id]/confirm 呼び出し。 |
| W6 | D5 | T-026 | 日程確定処理 | /api/scheduling/[id]/confirm | T-024 | 1d | Calendar event作成(同席者招待)+Zoom Meeting作成+確認メール送信(テンプレ使用)。 |
| W7 | D1 | T-027 | リスケフロー | /meetings/[id]/reschedule | T-026 | 1d | Calendar/Zoom更新+再提案メール送信。 |
| W7 | D2-3 | T-028 | ナレッジアップロード | /knowledge | P1完 | 2d | PDF/PPTX/画像対応。pdf-parse, mammoth等で抽出。analyze_document Worker でPROMPT-04を実行。 |
| W7 | D4 | T-029 | ナレッジレビュー | /admin/knowledge | T-028 | 1d | AI生成description/tagsをマネージャーが承認。承認でvisibility=org。 |
| W7 | D5 | T-030 | 引き継ぎ書生成 | /handoffs/new | P1完 | 1d | contract_id指定→pgmq:generate_handoff_draft投入→PROMPT-09で構造化生成→編集可能フォーム。 |
| W8 | D1 | T-031 | 契約管理 | /contracts | - | 1d | CRUD+関連商談紐付け+commitments集約表示。 |
| W8 | D2 | T-032 | クリップ生成 | /api/clips | - | 1d | recording 詳細から start/end指定→generate_clip Workerでffmpeg切り出し→R2保存。 |
| W8 | D3 | T-033 | 共有リンク | /api/shares + /share/[token] | T-032 | 1d | 期限+パスワード保護。閲覧時 access_count+audit。/share画面はSSR、tokenベース認証。 |
| W8 | D4 | T-034 | 監査ログ画面 | /admin/audit | P1完 | 1d | 全アクションのlog実装が前提。フィルタ(user/action/date)+CSVエクスポート。 |
| W8 | D5 | T-035 | Phase2 統合テスト | - | 全部 | 1d | E2E:名刺取込→アポ自動化→返信パース→確定→Zoom→録画→引き継ぎ までの完全フロー。 |
| ■ Phase 3 (Week 9-12): ロープレ+ダッシュボード+音声 |  |  |  |  |  |  |  |
| 週 | 日 | ID | タスク | 成果物 | 依存 | 時間 | Claude Codeへの指示 |
| W9 | D1-2 | T-036 | シナリオCRUD | /roleplay (admin) | P2完 | 2d | 手動シナリオ作成UI。persona/rubric/opening_message編集。 |
| W9 | D3 | T-037 | シナリオ自動生成 | generate_roleplay_scenario | T-036 | 1d | 過去商談ID複数選択→PROMPT-07で生成→編集してから公開。 |
| W9 | D4-5 | T-038 | チャットロープレ | /roleplay/[id] | T-036 | 2d | streaming chat with PROMPT-05。conversationをjsonbに追記。終了でPROMPT-06実行。 |
| W10 | D1 | T-039 | コーチング画面 | /team/roleplay | T-038 | 1d | メンバーセッション一覧+コメント+優秀ロープレ社内共有。 |
| W10 | D2-3 | T-040 | ナレッジチャット | /knowledge (chat mode) | P2完 | 2d | /api/chat: ベクトル検索→PROMPT-08でstreaming RAG。出典クリックで該当録画ジャンプ。 |
| W10 | D4-5 | T-041 | マネージャーDB | /dashboard/manager | P2完 | 2d | パイプライン金額・ステージ別件数・各営業のロープレスコア推移・AI診断(週次バッチ)。 |
| W11 | D1-2 | T-042 | 音声ロープレ(STT) | /api/roleplay/voice/stt | T-038 | 2d | Web Speech API or Whisper。ブラウザ録音→送信→テキスト化→既存チャット投入。 |
| W11 | D3-4 | T-043 | 音声ロープレ(TTS) | /api/roleplay/voice/tts | T-042 | 2d | OpenAI TTS or ElevenLabs。AI応答をストリーミング再生。 |
| W11 | D5 | T-044 | 使用量管理 | /admin/usage | P2完 | 1d | llm_usage_logs集計UI+上限設定+超過アラート。 |
| W12 | D1-2 | T-045 | モバイル最適化 | 全画面 | - | 2d | PWA化・通知許可・タッチ最適化。 |
| W12 | D3-4 | T-046 | パフォーマンス最適化 | - | - | 2d | クエリ最適化・画像最適化・bundle分析。 |
| W12 | D5 | T-047 | GA(General Availability) | - | 全部 | 1d | 本番デプロイ・監視設定・ドキュメント整備。 |