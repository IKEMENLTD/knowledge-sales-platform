# 01_user_stories

| ユーザーストーリー |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| ロール × シーン別の Acceptance Criteria を含む |  |  |  |  |  |  |
| ID | ロール | シーン | ユーザーストーリー | 受け入れ基準 | 関連画面 | 優先度 |
| US-01 | 営業 | 名刺取り込み(モバイル) | 交流会で受け取った名刺を、その場でスマホで撮影し、自動でコンタクト情報として保存したい | ・モバイルブラウザで連続撮影が可能
・1枚の写真に複数名刺がある場合、自動分割
・OCR結果を編集して保存できる
・既存コンタクトとの重複検知(会社名+人名+メールで突合)
・保存後、商談化アクションへ1タップで遷移 | /mobile/scan, /contacts/[id]/review | 高 |
| US-02 | 営業 | 名刺取り込み(PC一括) | まとめてスキャンした名刺画像10枚をPCで一括アップロードしたい | ・複数ファイルD&D対応
・進捗表示
・OCR完了後に一覧で確認・一括編集 | /contacts/import | 中 |
| US-03 | 営業 | アポ取り自動化 | コンタクトを選んで「アポ取って」と指示すると、自社カレンダーから空き枠を抽出してメールが自動送信される | ・送信前にメールドラフト確認画面を必ず挟む
・社内同席者を複数指定するとAND空き枠で抽出
・テンプレート選択可
・候補日時は3〜5枠を提示
・自分のGmailアカウントから送信される | /meetings/new, /email-drafts/[id] | 高 |
| US-04 | 営業 | 返信自動パース | 顧客の返信メールから希望日時を自動で読み取り、カレンダーとZoomを自動作成したい | ・「24日14時」「来週火曜の午後」などの曖昧表現に対応
・パース不確実時は「確認待ち」キューに入れて通知
・確定したらGoogle Calendar/Zoom Meeting を自動作成
・候補外の日時を返答された場合も検出 | /scheduling/inbox | 高 |
| US-05 | 営業 | リスケ対応 | 一度確定した日程を顧客都合で変更したい | ・既存予定からリスケアクション
・新しい候補を再提示メール送信
・カレンダー・Zoomも更新 | /meetings/[id] | 中 |
| US-06 | 営業 | 商談中のリアルタイムメモ | Zoom商談中に手元でメモを取り、後で文字起こしと突き合わせたい | ・タイムスタンプ付きメモ
・録画処理後、メモと文字起こしのタイミング同期表示 | /meetings/[id]/live-notes | 中 |
| US-07 | 営業 | 商談振り返り | 商談後に文字起こし・要約・ニーズ抽出・反論抽出を確認し、次アクションを決めたい | ・録画処理完了通知
・話者別タイムライン
・AIが抽出した「ニーズ/反論/約束事/次アクション」を表示
・編集可能(AI誤抽出修正) | /meetings/[id] | 高 |
| US-08 | 営業 | CSへの引き継ぎ | 受注後、CS担当に契約内容・約束事・キーパーソンを引き渡したい | ・引き継ぎテンプレートに必要項目が自動充填
・CS側でレビュー&承認
・引き継ぎ会議のセットも自動 | /handoffs/new | 高 |
| US-09 | CS | クレーム時の発言検索 | 顧客から「以前こう言われた」とクレームが来た時、該当発言を即座に検索したい | ・顧客名+キーワードで横断検索
・該当する文字起こし箇所にジャンプ
・前後30秒の動画再生
・該当部分を顧客に共有(期限付きリンク) | /search, /recordings/[id]?t=120 | 高 |
| US-10 | CS | キックオフ時の認識合わせ | キックオフで「契約時にどう言ったか」を確認したい | ・契約紐付けで関連商談を一覧
・commitments(約束事)タブで一覧表示 | /contracts/[id] | 高 |
| US-11 | 新人営業 | ナレッジ参照 | 「製造業の値引き反論ってどう返してる?」とチャットで聞きたい | ・自然言語クエリ
・該当する過去商談シーン+資料を提示
・出典付き回答
・フィードバックボタン(役立った/立たなかった) | /knowledge | 高 |
| US-12 | 新人営業 | ロープレ(チャット) | 顧客役AIと商談シミュレーションをしてフィードバックをもらいたい | ・シナリオ選択
・チャットで対話
・終了後、評価項目別スコア+改善コメント
・他の人のロープレ結果も参考に見られる(任意公開) | /roleplay, /roleplay/[id] | 高 |
| US-13 | 新人営業 | ロープレ(音声・将来) | 音声でロープレしたい | ・Web Speech API でブラウザ音声入力
・TTSで顧客役の音声出力
・話速・間の評価 | /roleplay/[id]?mode=voice | 低 |
| US-14 | マネージャー | ダッシュボード | チームの商談状況・受注率・各営業の傾向を俯瞰したい | ・パイプライン金額
・ステージ別件数
・各営業のロープレスコア推移
・「反論対応が弱い」等のAI診断 | /dashboard | 高 |
| US-15 | マネージャー | ロープレ・コーチング | メンバーのロープレ結果を見てフィードバックしたい | ・チームメンバーのセッション一覧
・コメント機能
・優秀ロープレの社内共有 | /team/roleplay | 中 |
| US-16 | マネージャー | ナレッジ整備 | AI生成のサマリ・抽出結果を承認/修正してナレッジとして公開したい | ・レビューキュー
・公開/限定公開/非公開の切替 | /admin/knowledge | 中 |
| US-17 | 管理者 | ユーザー管理 | メンバー追加・退職処理を管理したい | ・招待メール
・退職時:OAuthトークン削除、データの担当者変更、アカウント無効化 | /admin/users | 高 |
| US-18 | 管理者 | 監査ログ | 誰がいつ何にアクセスしたか確認したい | ・全操作ログ(閲覧/編集/削除/共有)
・絞り込み・エクスポート | /admin/audit | 中 |
| US-19 | 管理者 | コスト管理 | LLM API使用量を監視・上限設定したい | ・ユーザー別/月別使用量
・ソフト/ハード上限
・上限到達時の通知 | /admin/usage | 中 |
| US-20 | 顧客 | 議事録共有を受ける | 商談の議事録URLを受け取り、認証なしで閲覧したい(期限付き) | ・期限付き共有リンク
・閲覧ログ記録
・パスワード保護オプション | /share/[token] | 中 |
| ■ 追加ユーザーストーリー(現場UX補完 v2) |  |  |  |  |  |  |
| ID | ロール | シーン | ユーザーストーリー | 受け入れ基準 | 関連画面 | 優先度 |
| US-21 | 営業 | 名刺撮影(暗所/片手) | 暗い・斜め・反射の交流会で片手で撮影しても失敗しない | ・自動補正(明度/反射/歪み)はクライアント側WASMで前処理
・静止検出オートシャッター(2秒静止で自動撮影)
・フラッシュ強制ON選択
・ハプティクス(成功で軽い振動)
・ガイド枠オーバーレイ
・連写(連続撮影)モード | /mobile/scan | 高 |
| US-22 | 営業 | 両面名刺取り込み | 裏面に英語/QRがある名刺を1コンタクトに紐付け | ・「裏面追加」ボタン
・両面OCR結果のフィールドマージ提案
・QRコード(vCard)読み取り→自動充填
・英語フィールドはalt_name/alt_companyに格納 | /mobile/scan, /contacts/[id]/review | 高 |
| US-23 | 営業 | 非名刺の混入対策 | パンフレットやメモが混ざっても破綻しない | ・ML分類(business_card/pamphlet/memo/qr_only/other)
・非名刺は notes_attachments として保存(コンタクト化しない)
・ユーザーに分類結果を提示しチェンジ可能 | /mobile/scan | 中 |
| US-24 | 営業 | 交流会中の即時検索 | 「あの人どこの会社」をその場で検索 | ・/mobile/quick-lookup ボタン(ホーム下部)
・直近インポート優先表示
・名前/会社名の部分一致(オフラインキャッシュ対応) | /mobile/quick-lookup | 高 |
| US-25 | 営業 | オフライン名刺取り込み | 電波弱い会場で取り込みが消えない | ・IndexedDBに画像と入力をキュー
・Service Workerでオンライン復帰時に自動同期
・キュー件数バッジ表示
・最大100件保持 | /mobile/scan, /mobile/queue | 高 |
| US-26 | 営業 | 名刺へのメモ添付 | 紹介者・興味分野などを撮影時に音声/手入力で残す | ・撮影直後に「メモ追加」ステップ
・音声録音(最大60秒)→Whisper文字起こし
・テキスト入力
・後でコンタクト詳細から編集可能 | /mobile/scan, /contacts/[id] | 高 |
| US-27 | 営業 | イベントタグ一括付与 | 「2026/4 Tech交流会」で一括グルーピング | ・取り込み開始前にイベント名を選択/新規作成
・該当セッションで取り込んだ全名刺に自動付与
・イベントタグでフィルタ・横断検索 | /mobile/scan, /events | 中 |
| US-28 | 営業 | OCR誤認識の自動補正 | 漢字社名・小文字役職・@前ドットの誤認識を減らす | ・OCR後にClaude Haikuで後処理(コンテキスト推論)
・低信頼度フィールドはハイライト+確認UI
・確定済みは学習(社名辞書) | /contacts/[id]/review | 高 |
| US-29 | 営業 | 上司同席の合意フロー | 勝手に上司の予定を入れない | ・社内同席者を指定すると本人にinvite通知(Slack/Push/メール)
・本人がaccept→カレンダー登録/decline→候補から除外
・締切付き(2時間でtimeout→却下扱い) | /meetings/new, /inbox/internal-invites | 高 |
| US-30 | 営業 | 業務時間枠の制御 | 業務時間外の枠を提案しない | ・user_availability_settings(work_hours/lunch_hours/days_off)
・候補抽出時に必ず適用
・例外で時間外を含めるトグル | /settings/availability | 高 |
| US-31 | 営業 | 顧客タイムゾーン対応 | 海外顧客に正しい時刻表記 | ・contacts.timezone(自動推定: 国/メール末尾)
・候補メールに両TZ併記
・カレンダー作成時はGuestのTZでICS | /contacts/[id], /email-drafts/[id] | 中 |
| US-32 | 営業 | 会議室予約連動 | 対面商談で会議室も同時予約 | ・Google Workspace resourceで会議室を取得
・候補に「会議室付き」フィルタ
・確定時に会議室もbook | /meetings/new | 中 |
| US-33 | 営業 | オンライン/対面分岐 | 商談タイプで動線を分ける | ・meetings.location_type(online/onsite)
・onsite→住所入力(Google Maps autocomplete)
・online→Zoom自動発行(or Meet選択) | /meetings/new | 高 |
| US-34 | 顧客 | Calendly風UIで日程選択 | 候補日時を見やすく選びたい | ・/share/[token]/scheduling 専用UI
・週カレンダーで空きスロット表示
・1クリックで仮確定→本人確認メール | /share/[token]/scheduling | 高 |
| US-35 | 営業 | 仮押さえ(ホールド) | 顧客返信前に自カレンダーを仮押さえ | ・候補送信時に全候補をhold(private event)
・確定時に他候補をrelease
・返信なし48時間でauto-release | /meetings/[id] | 中 |
| US-36 | 営業 | 重複アプローチ警告 | 同じ顧客に他営業が既にアプローチ中なら警告 | ・コンタクト紐付け時に既存meeting/dealをチェック
・警告ダイアログ(「○○が3日前に接触」)
・続行/取消選択 | /meetings/new, /contacts/[id] | 高 |
| US-37 | 営業 | 代理メール送信 | 休暇中の同僚の代わりに送信 | ・out_of_office_delegates設定
・delegate権限の対象者だけ代理可能
・送信元はoriginal\@だがX-Sender-Onbehalff-Of付与
・全件audit | /admin/delegates | 低 |
| US-38 | 営業 | 全NG時の再提案ドラフト | 顧客が「全部NG」と返信→新候補を自動生成 | ・パーサが「全NG」を検出
・auto_redraft jobで新候補3-5枠生成
・ドラフト確認画面に遷移 | /scheduling/inbox | 高 |
| US-39 | 営業 | 返信意図の分類 | 電話希望/訪問希望/承諾/辞退/再提案を自動判定 | ・email_intent_classifier(Claude)
・分類結果でアクション分岐
・低信頼度はpending parse | /scheduling/inbox | 中 |
| US-40 | 営業 | CC追加の検出 | 顧客が「CC追加」と書いてきたら参加者に追加 | ・パースでCC指示を抽出
・確認ダイアログ→meeting_attendeesに追加
・カレンダー再送 | /scheduling/inbox | 中 |
| US-41 | 営業 | 返信添付の自動振り分け | NDA/要件書/RFPを商談ドキュメントに自動振り分け | ・添付分類器(filename/Content-Type/内容)
・meeting_documentsに紐付け
・要約自動生成 | /meetings/[id]/documents | 中 |
| US-42 | 営業 | 別スレッドで返ってきた | Subject変更/別スレッドで返信されても同じ商談に紐付け | ・References/In-Reply-To/Subject正規化で吸収
・低信頼度は手動マージUI | /scheduling/inbox | 中 |
| US-43 | 営業 | 確定後のリスケ | 確定済みにリスケ要望が来たら専用フロー | ・「リスケ」検出→既存meetingをreschedule状態へ
・候補再提示メール起動
・カレンダー更新 | /meetings/[id] | 高 |
| US-44 | 営業 | 商談前ブリーフィング | 5分前に過去要約・ニーズ・資料を自動表示 | ・push通知(15分前/5分前)
・ブリーフィングカード(前回要約・課題・約束事・推奨資料) | /meetings/[id]/brief | 高 |
| US-45 | 営業 | Zoom 1クリック起動 | ブリーフィング画面からZoom join | ・Join button(deep link zoommtg://)
・SMS/Push連動 | /meetings/[id]/brief | 高 |
| US-46 | 営業 | 録画自動開始 | Zoom Meeting作成時にauto-record強制 | ・Zoom API auto_recording=cloud
・失敗時はリトライ+管理者通知
・冒頭5分以内に録画OFF検知→警告 | (バックエンド) | 高 |
| US-47 | 営業 | 当日の同席者変更 | 直前の追加/キャンセルに対応 | ・/meetings/[id]/attendeesから即座に追加削除
・カレンダー/Zoom再送
・同意フローも再起動 | /meetings/[id] | 中 |
| US-48 | 営業 | 事前未登録話者の識別 | 顧客側に新メンバーがいた時の話者判定 | ・Pyannote diarizationで未知話者検出
・後で「この話者は誰?」UIで命名
・以降同じ声指紋は自動命名 | /meetings/[id] | 中 |
| US-49 | 営業 | 商談中の資料即時検索 | 「あの資料見せたい」をその場で | ・in-meeting search panel(/meetings/[id]/live-search)
・1クリックで画面共有用URL生成(期限付き)
・閲覧ログ取得 | /meetings/[id]/live-search | 中 |
| US-50 | 営業 | 録画長乖離の処理 | 予定より長引いた/短く終わった時 | ・recording_duration vs scheduled_durationを記録
・延長分も自動取り込み
・短縮時は早期完了で要約即生成 | (バックエンド) | 低 |
| US-51 | 営業 | 段階的要約 | 録画解析を段階的に提示(待たせない) | ・stage1: transcript-only(数分)
・stage2: preview-summary(10分)
・stage3: full-extraction(20分)
・各段階で通知 | /meetings/[id] | 高 |
| US-52 | 営業 | 検索結果からのインライン編集 | AI抽出ミスをその場で修正 | ・検索結果カードに編集ボタン
・/recordings/[id]?segment=...にdeep link
・編集はaudit log残す | /search | 中 |
| US-53 | CS | 個人情報マスキング | 共有時に住所/電話/金額を自動マスク | ・PII detector(住所/電話/金額/メール)
・共有リンク表示時に自動redact(原本は保持)
・解除権限は管理者のみ | /share/[token] | 高 |
| US-54 | 営業 | NG発言のsensitive化 | 削除はせずに非公開化 | ・recording_segments.sensitivity=sensitive
・共有/横断検索から除外
・本人と管理者のみ閲覧可
・解除はrequest+承認 | /recordings/[id] | 中 |
| US-55 | 営業 | 顧客向け要約 | 議事録を顧客に送る用(社内メモ抜き) | ・generate_external_summary プロンプト
・社内メモ/sensitive segmentを除外
・PDFエクスポート/共有リンク | /meetings/[id]/external-summary | 高 |
| US-56 | CS | クレーム対応の30秒UX | 急いでいる時に最短到達 | ・ホームに「クレーム検索」プリセット
・顧客名1タップ→該当発言Top3
・前後3分プレビュー即再生 | /support/quick-search | 高 |
| US-57 | CS | 曖昧時系列検索 | 「2024年4月頃」のような検索 | ・temporal parser(○年○月頃→date range)
・スライダーで期間調整
・検索結果に発話日付明記 | /search | 中 |
| US-58 | CS | クリップ送信 | 動画全体を見られたくないので該当部分のみ | ・recording_clipsで切り出し
・期限付き共有リンク(view_window=clip)
・透かし表示 | /recordings/[id]/clip | 高 |
| US-59 | CS | クレームを商談に紐付け | 教訓として商談履歴に蓄積 | ・complaint_to_meeting_links
・lessons_learnedテーブル
・関連商談履歴に「過去クレーム」タブ | /contracts/[id], /complaints | 中 |
| US-60 | 新人 | ロープレ シナリオ多様化 | 同じシナリオでも顧客の機嫌や同席者でバリエーション | ・roleplay_scenario_variants(機嫌/同席者/予算規模/業界)
・乱択可能
・履歴で重複回避 | /roleplay/[id] | 中 |
| US-61 | 新人 | ロープレ時間制限 | 20分以内に締めるなど実戦感 | ・time_limit_seconds設定
・残時間バー
・終了時自動評価 | /roleplay/[id] | 低 |
| US-62 | 新人 | ロープレ降参モード | 詰まった時にコーチが指南 | ・「Give up & Hint」ボタン
・コーチAIが状況分析+次の一手提案
・スコアにペナルティ(透明) | /roleplay/[id] | 中 |
| US-63 | マネージャー | リアルタイム割り込み | メンバーのロープレに割り込み指導 | ・観戦モード(WebRTC observe)
・コメント挿入
・一時停止指示
・本人合意要(設定で許可) | /team/roleplay/live | 低 |
| US-64 | 管理者 | 失敗パターン集計 | 全社で「よくやる失敗トップ10」を可視化 | ・roleplay_failure_patternsで集計
・月次レポート
・教育コンテンツ自動作成 | /admin/insights | 中 |
| US-65 | 新人 | ロープレ発話タイミング | 間が悪い・被りを評価 | ・voice_metrics(間合い/被り/ターン取り)
・自然対話スコア | /roleplay/[id]?mode=voice | 低 |
| US-66 | 新人 | 録画→シナリオ生成 | この録画と同じシチュでロープレ | ・/recordings/[id]→「この商談でロープレ」ボタン
・ペルソナ/状況/反論を自動抽出 | /recordings/[id], /roleplay | 中 |
| US-67 | マネージャー | 受注率原因のAI診断 | 最近の受注率低下の原因をAIが診断 | ・diagnostics job(週次)
・要因候補(価格/反論/他社競合/担当別)
・自然言語サマリ | /dashboard/manager | 中 |
| US-68 | マネージャー | トップパフォーマー比較 | 優秀者の話し方を共有 | ・top_performer_phrases抽出
・本人合意済みのみ公開
・テンプレ化 | /team/top-phrases | 中 |
| US-69 | マネージャー | 製品説明テンプレ統一 | うちのプロダクトの説明を統一 | ・product_positioning_phrases(承認制)
・商談中にサジェスト | /admin/positioning | 低 |
| US-70 | マネージャー | 個人スコア配慮 | 低スコアを晒さない設計 | ・チーム集計のみデフォルト
・個人スコアはマネージャー本人と上長のみ
・本人ダッシュボードで自分のスコアは可視 | /dashboard/manager | 高 |
| US-71 | マネージャー | 失注分析 | 同じ業界・反論で繰り返し負けてないか | ・loss_analysis(業界×反論×担当)
・パターン抽出
・対策ナレッジ提案 | /dashboard/manager/losses | 中 |
| US-72 | CS | 認識ズレ報告 | 営業時の話と違う点を報告 | ・alignment_reports(CS→営業)
・該当録画引用
・対応ステータス | /handoffs/[id] | 中 |
| US-73 | CS | 引き継ぎ予習 | キックオフ前にCSが予習 | ・/handoffs/[id]/preview
・主要録画ハイライトクリップ
・要点まとめ
・チェックリスト | /handoffs/[id]/preview | 中 |
| US-74 | CS | 契約更新3ヶ月前アラート | 更新タイミングを見逃さない | ・cron job(日次)で3ヶ月前を抽出
・push通知 + ダッシュボード強調表示 | /dashboard | 高 |
| US-75 | CS | アップセル機会の検出 | CS会話から営業へエスカレーション | ・upsell_signal_detector(発話分析)
・営業に通知+CRMにメモ | /dashboard | 中 |
| US-76 | 営業 | メール30秒undo | 送信ボタン押下後30秒は取り消し可能 | ・email_send_with_undo(30秒バッファ)
・後出しの訂正メール送信支援テンプレ | /email-drafts/[id] | 高 |
| US-77 | 全員 | 削除コンタクト復旧 | 誤削除を復旧 | ・全主要テーブル soft delete(deleted_at)
・30日以内に復旧UI
・/admin/trash | /admin/trash | 高 |
| US-78 | 営業 | AI抽出やり直し | 抽出が完全に間違ってる時の全体やり直し | ・/recordings/[id]/reprocessボタン
・モデル選択(Sonnet/Opus)
・差分表示 | /recordings/[id] | 中 |
| US-79 | 全員 | 同期失敗バッジ | Calendarに同期できていないことに気付ける | ・sync_failure_indicator(画面右上)
・詳細とリトライ
・閾値超で管理者通知 | (全画面) | 高 |
| US-80 | 全員 | 権限不足の申請動線 | エラーページではなく申請ボタン | ・permission_request UI
・上長/管理者承認フロー | (403時) | 中 |
| US-81 | 全員 | モバイル通信切れの自動保存 | 入力中データを失わない | ・autosave(IndexedDB, 5秒間隔)
・復帰時にbanner通知
・破棄/復元選択 | (モバイル全画面) | 高 |
| US-82 | 管理者 | 事故削除のロールバック | 管理者が事故で全削除しても復旧 | ・破壊的操作はreason必須+確認ダイアログ
・PITR(Point-in-time-recovery)7日
・/admin/audit/rollback | /admin/audit | 高 |
| US-83 | 全員 | 2デバイス同時編集 | 衝突を検知して表示 | ・楽観ロック(version列)
・衝突時はマージダイアログ
・realtime通知 | (編集系全画面) | 中 |
| US-84 | 営業 | 録画同意の運用 | 商談冒頭の同意取得 | ・冒頭で同意アナウンス自動再生(任意)
・同意ログ(meeting_consent_captures)
・不同意なら録画停止 | /meetings/[id] | 高 |
| US-85 | 顧客 | 発言削除依頼 | GDPR/個人情報保護法に基づく削除依頼 | ・/share/[token]に削除依頼ボタン
・data_deletion_requests
・30日以内に対応
・対応ログ | /share/[token]/request | 高 |
| US-86 | 管理者 | 退職者発言の方針設定 | 営業退職後の録画扱い | ・ex_employee_speech_policy(retain/anonymize/delete)
・組織設定で選択 | /admin/policy | 中 |
| US-87 | 管理者 | 法的開示請求対応 | 監査ログ・データエクスポート | ・legal_disclosures(チェーンオブカストディ)
・期間/対象指定エクスポート | /admin/legal | 低 |
| US-88 | 管理者 | データ保管地域 | 東京リージョン固定 | ・supabase_region=ap-northeast-1
・R2 region同様
・契約書明記 | (インフラ) | 高 |
| US-89 | 新人 | 初日の体験 | 空状態でも価値を体感 | ・サンプルデータ自動投入
・guided tour(7ステップ)
・スキップ可能 | /onboarding | 中 |
| US-90 | 営業 | 既存名刺一括インポート | Sansan/Eight/CSVから移行 | ・/contacts/import/legacy
・CSV/vCard/Sansan API
・重複検知マージ | /contacts/import/legacy | 中 |
| US-91 | 営業 | 過去Zoom録画取り込み | これまでの録画も取り込みたい | ・/recordings/import/zoom-historical
・期間指定で一括取り込み
・処理進捗表示 | /recordings/import | 低 |
| US-92 | 新人 | 推奨ナレッジリスト | 新メンバー向け学習リスト | ・ロール別onboarding_recommendations
・進捗トラッキング
・修了バッジ | /onboarding/learn | 低 |
| US-93 | 全員 | 最近見たもの | 「この前見たあれ」 | ・recent_views(直近50件)
・ホームにカード表示 | /dashboard | 中 |
| US-94 | 全員 | ハイブリッド検索ランキング | 直近+関連度の混合 | ・bm25*0.4 + vector*0.4 + recency*0.2
・ランキング理由の可視化(なぜ上位) | /search | 高 |
| US-95 | 全員 | 古い情報の扱い | 撤回・古い情報を除外 | ・knowledge_items.deprecated_at
・検索結果に「古い情報」バッジ
・除外フィルタ | /search, /knowledge | 中 |
| US-96 | 全員 | ハルシネーション抑止 | 出典なしには答えない | ・no_source_no_answerポリシー
・引用必須プロンプト
・出典が空ならフォールバック「該当なし」 | /knowledge | 高 |
| US-97 | 全員 | 自分宛発言の絞り込み | 自分が話した部分だけ抽出 | ・speaker_filter=self
・話者切替 | /recordings/[id], /search | 中 |
| US-98 | 全員 | オフライン議事録閲覧 | 電車内で議事録を読める | ・Service Workerでcache(直近10件)
・オフライン表示UI | (全モバイル) | 中 |
| US-99 | 全員 | 音声メモで報告 | 音声→文字→商談メモ | ・/mobile/voice-memo→Whisper→meeting_notes
・60秒上限 | /mobile/voice-memo | 中 |
| US-100 | 全員 | プッシュ通知 | 返信受信・商談15分前リマインド | ・Web Push (VAPID)
・通知設定で粒度調整
・iOS Safari 16.4+対応 | /settings/notifications | 高 |
| US-101 | 全員 | 片手UI | 主要アクションは画面下部 | ・モバイルbottom_action_bar
・主要画面で適用 | (全モバイル) | 中 |
| US-102 | 全員 | 個人データエクスポート | CSV/JSON出力 | ・/api/exports/personal
・GDPR-style data export
・暗号化zip | /settings/export | 中 |
| US-103 | 管理者 | バックアップ可視化 | PITR状態を確認 | ・backup_status_dashboard
・最終成功時刻+復旧可能範囲 | /admin/backup | 中 |
| US-104 | 設計者 | 状態機械の可視化 | 商談・調整の状態遷移を一覧 | ・14_state_machinesシート
・mermaid図
・実装と乖離検知 | (設計書) | 低 |
| US-105 | 顧客 | 英語UI | 海外顧客に英語表示 | ・next-i18next(ja/en)
・/share/[token]はAccept-Languageで自動切替 | /share/[token] | 低 |
| US-106 | 全員 | アクセシビリティ | WCAG AA準拠 | ・キーボードナビ完全対応
・コントラスト比4.5:1+
・ARIA属性
・スクリーンリーダーテスト | (全画面) | 中 |
| US-107 | 全員 | ブラウザ通知 | Service Workerでpush | ・VAPID鍵
・サブスク管理画面
・通知許可フロー | /settings/notifications | 中 |
| US-108 | 全員 | リアルタイム状態同期 | 複数デバイスの状態同期 | ・Supabase Realtime
・meetings/drafts/notesで同期
・接続状態インジケータ | (編集系全画面) | 中 |
| US-109 | 全員 | ヘルプセンター | FAQ・問い合わせ動線 | ・/help (FAQ)
・エラー時に問い合わせボタン
・スクリーンショット添付 | /help | 中 |
| US-110 | 管理者 | feature flags | β機能の段階公開 | ・feature_flags(percentage rollout)
・user_id hashで安定割り当て
・管理画面 | /admin/features | 中 |
| US-111 | 管理者 | A/Bテスト | メールテンプレ効果測定 | ・ab_test_assignments
・cohort split
・コンバージョン記録
・有意差判定 | /admin/experiments | 低 |