# 06_external_integrations

| 外部API統合仕様 |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| サービス | 用途 | 認証方式 | 必要スコープ | 主要エンドポイント | 注意点 | Phase |
| Google Vision API | 名刺OCR | サービスアカウントJSON | cloud-platform | documents:annotate (DOCUMENT_TEXT_DETECTION) | 日本語高精度。月1000件まで無料。1名刺画像で1リクエスト想定 | P1 |
| Google Calendar API | 空き枠取得・予定作成 | OAuth2(各ユーザー) | https://www.googleapis.com/auth/calendar | freebusy.query, events.insert, events.update, events.delete | 同席者の空き枠AND取得は freebusy.query に複数 calendarId | P2 |
| Gmail API | メール送受信 | OAuth2(各ユーザー) | gmail.send, gmail.readonly, gmail.modify | users.messages.send, users.history.list, users.messages.get, users.watch | 送信は認証ユーザーのアドレスから。受信は users.watch + Pub/Sub topic で履歴監視 | P2 |
| Google Cloud Pub/Sub | Gmail 受信通知 | サービスアカウント | pubsub.subscriber | topic作成、users.watch から呼ばせる | PushサブスクリプションでNext.jsの/api/webhooks/gmailへ。JWT検証必須 | P2 |
| Zoom API | 録画取得・ミーティング作成 | Server-to-Server OAuth | recording:read:admin, meeting:write:admin, user:read:admin | meetings (POST), recordings (GET), webhooks | recording.completed イベントで自動取り込み。Webhook署名検証必須 | P1 |
| Anthropic Claude API | 要約・抽出・ロープレ・OCR後処理 | API Key | - | messages (claude-sonnet-4-5) | 日本語商談要約・構造化抽出が強い。プロンプトキャッシング推奨 | P1 |
| OpenAI Embeddings | ベクトル生成 | API Key | - | embeddings (text-embedding-3-small) | 1536次元、$0.02/1M tokens で安価 | P1 |
| OpenAI Whisper | 文字起こし補完 | API Key | - | audio.transcriptions | Zoomの文字起こしが不十分な時のみ。$0.006/分 | P1 |
| Cloudflare R2 | 動画ストレージ | S3互換APIキー | - | s3:PutObject, s3:GetObject, s3:DeleteObject | エグレス無料が決定的。バケット名はprivate-recordings | P1 |
| Supabase Storage | 画像・資料 | service_role / RLS | - | バケット: business-cards(private), documents(private) | RLS をバケットレベルで有効化 | P1 |
| Resend (推奨) or SendGrid | システム通知メール | API Key | - | メール送信 | 招待・上限通知などシステム発信用。営業の対顧客メールには使わない | P1 |
| ■ Zoom録画取り込みフロー(P1の最重要パス) |  |  |  |  |  |  |
| # | ステップ | 詳細 |  |  |  |  |
| 1 | Zoom側で会議終了→クラウド録画完了 | recording.completed Webhook が発火 |  |  |  |  |
| 2 | /api/webhooks/zoom が受信 | 署名(x-zm-signature)検証、payloadから zoom_meeting_id, recording_id, download_url, download_token 抽出 |  |  |  |  |
| 3 | meetings レコード引き当て | zoom_meeting_id でlookup。なければ owner 不明で「未紐付け」状態で作成し管理者通知 |  |  |  |  |
| 4 | recordings レコード作成 | processing_status=pending、zoom_recording_id でユニーク制約(冪等性) |  |  |  |  |
| 5 | pgmq:process_recording へジョブ投入 | 即座に200を返却(Zoomは3秒以内のレスポンス必要) |  |  |  |  |
| 6 | Worker が pickup | processing_status=downloading に更新 |  |  |  |  |
| 7 | 動画+VTT ダウンロード | download_url + ?access_token=download_token でストリーミング取得 |  |  |  |  |
| 8 | R2 アップロード | マルチパートアップロード(>100MB対応) |  |  |  |  |
| 9 | VTT パース | speaker, start, end, text の配列にパース |  |  |  |  |
| 10 | 同席者ラベル付け | meeting_attendees から speaker_label を当てる(初回はAIで推定→ユーザーが確定) |  |  |  |  |
| 11 | Whisper 補完(任意) | VTTのconfidence低い区間のみ再文字起こし |  |  |  |  |
| 12 | processing_status=analyzing | Claude に投入開始 |  |  |  |  |
| 13 | Claude で抽出 | summary, key_points, customer_needs, objections, commitments, next_actions を JSON Schema 強制で抽出 |  |  |  |  |
| 14 | processing_status=embedding | チャンク分割(800トークン) |  |  |  |  |
| 15 | OpenAI Embeddings 一括生成 | バッチ最大2048チャンク |  |  |  |  |
| 16 | knowledge_embeddings 保存 | source_type=recording_segment, metadata={meeting_stage, industry, speaker} |  |  |  |  |
| 17 | processing_status=completed | 通知作成、所有者にWebhook+メール通知 |  |  |  |  |
| 18 | 失敗時 | processing_status=failed, processing_error にスタックトレース、Slack通知(管理者)、ジョブはアーカイブへ |  |  |  |  |
| ■ 追加外部統合(v2) |  |  |  |  |  |  |
| サービス | 用途 | 認証 | エンドポイント/SDK | レート制限 | 失敗時挙動 | Phase |
| Google Calendar resource | 会議室予約 | OAuth(scope: calendar) | admin.directory.resource.calendar | 100/100s | sync_failure_log+UI badge | P2 |
| Pyannote(セルフホスト) | 話者ダイアリゼーション | - | Render Worker(GPU不要) | 内部 | CPU fallback | P1 |
| OpenCV.js / WASM | 名刺自動補正 | - | クライアント | - | 手動補正へfallback | P1 |
| Whisper(セルフホスト or OpenAI) | 音声→文字 | - | Render Worker | 内部 or 50RPM | retry 2 | P1 |
| Web Push (VAPID) | ブラウザ通知 | VAPID | Service Worker | - | Slack fallback | P2 |
| Sansan API(任意) | 名刺移行 | API Key | https://api.sansan.com/v3 | - | CSV手動fallback | P2 |
| Zoom Webhook (recording.completed/started/ended) | 録画/録画同意 | Webhook secret | - | - | retry+DLQ | P1 |
| Slack | 内部通知/承諾フロー | Bot Token | - | 1MPS | Email fallback | P2 |
| Maps Places | 対面商談住所autocomplete | API Key | Places API | 6000QPM | 入力のみのfallback | P2 |
| Cloudflare R2(東京リージョン) | データ保管 | S3-compat | wnam-region指定 | - | - | P1 |
| Supabase Vault | OAuthトークン暗号化 | - | - | - | - | P1 |
| Supabase Realtime | 複数デバイス同期 | JWT | Channels | 100conn | reconnect | P2 |
| Supabase PITR | Point-in-time-recovery | - | Pro plan | - | - | P2 |
| Helpscout/Intercom(任意) | ヘルプセンター埋込 | - | Widget | - | 内製/help fallback | P2 |
| Sentry | エラートラッキング | DSN | SDK | - | - | P1 |
| GrowthBook(任意) | feature flags/AB | - | SDK | - | DB直管理 | P2 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |  |
| サービス | 用途 | 認証 | エンドポイント/SDK | レート制限 | 失敗時挙動 | Phase |
| Google Calendar API 制約(NF-S2-2) | 個別attendee transparency切替不可 | - | - | - | attendees_dimmed時はownerのみtransparent予定+確定時invite発行 | P2 |
| DeepL API(任意 NF-UX-1) | voice memo翻訳 | API Key | api.deepl.com | tier依存 | Anthropic Claude fallback | P3 |
| ■ v2.5 追加(R3 minor) |  |  |  |  |  |  |
| サービス | 用途 | 認証 | エンドポイント/SDK | レート制限 | 失敗時挙動 | Phase |
| 人手翻訳ベンダー(任意 NF3-UX-2) | voice_memo人手翻訳 | API Key or 社内SOP | - | - | SLA超過でadmin通知 | P3 |