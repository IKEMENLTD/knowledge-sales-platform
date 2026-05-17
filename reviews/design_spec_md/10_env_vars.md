# 10_env_vars

| 環境変数・シークレット一覧 |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| キー | 用途 | 配置先 | 例 | 必須 | Phase |
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL | web | https://xxx.supabase.co | 必須 | P1 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key | web | eyJ... | 必須 | P1 |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role(秘匿) | web/worker | eyJ... | 必須 | P1 |
| DATABASE_URL | Postgres接続(Drizzle migrate用) | CI/local | postgresql://... | 必須 | P1 |
| GOOGLE_OAUTH_CLIENT_ID | Google OAuth | web | ...apps.googleusercontent.com | 必須 | P1 |
| GOOGLE_OAUTH_CLIENT_SECRET | 同 | web | ... | 必須 | P1 |
| GOOGLE_SERVICE_ACCOUNT_JSON | Vision API + Pub/Sub | worker(secret file) | /etc/secrets/gcp-sa.json | 必須 | P1 |
| GOOGLE_PUBSUB_TOPIC | Gmail watch topic | web | projects/.../topics/gmail-events | 必須 | P2 |
| ZOOM_ACCOUNT_ID | Zoom S2S OAuth | worker | ... | 必須 | P1 |
| ZOOM_CLIENT_ID | 同 | worker | ... | 必須 | P1 |
| ZOOM_CLIENT_SECRET | 同 | worker | ... | 必須 | P1 |
| ZOOM_WEBHOOK_SECRET_TOKEN | Webhook署名検証 | web | ... | 必須 | P1 |
| ANTHROPIC_API_KEY | Claude | worker/web | sk-ant-... | 必須 | P1 |
| OPENAI_API_KEY | Embeddings + Whisper + TTS | worker | sk-... | 必須 | P1 |
| R2_ACCOUNT_ID | Cloudflare R2 | worker | ... | 必須 | P1 |
| R2_ACCESS_KEY_ID | 同 | worker | ... | 必須 | P1 |
| R2_SECRET_ACCESS_KEY | 同 | worker | ... | 必須 | P1 |
| R2_BUCKET_RECORDINGS | 同 | worker | private-recordings | 必須 | P1 |
| R2_PUBLIC_DOMAIN | 署名URL用ドメイン | worker | recordings.xxx.com | 任意 | P1 |
| RESEND_API_KEY | システム通知メール | web | re_... | 必須 | P1 |
| APP_URL | 自身のURL | web/worker | https://app.xxx.com | 必須 | P1 |
| NEXTAUTH_URL | auth用 | web | 同上 | 必須 | P1 |
| NEXTAUTH_SECRET | session暗号化 | web | random32bytes | 必須 | P1 |
| SENTRY_DSN | エラー監視 | web/worker | ... | 推奨 | P1 |
| SLACK_ALERT_WEBHOOK_URL | 管理者アラート | worker | ... | 推奨 | P1 |
| PGMQ_VISIBILITY_TIMEOUT_DEFAULT | デフォルトvt秒 | worker | 300 | 任意 | P1 |
| NODE_ENV |  | all | production | 必須 | P1 |
| ■ 追加環境変数(v2) |  |  |  |  |  |
| 変数名 | 用途 | 必須 | P | ローテ | 備考 |
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY | Web Push署名 | 必須 | P2 | 年次 | Service Worker |
| GOOGLE_RESOURCE_DOMAIN | 会議室Workspaceドメイン | 任意 | P2 | - | admin.directory.resource |
| PII_REDACTOR_MODEL | PII検出モデル名 | 必須 | P2 | - | claude-haiku |
| SUPABASE_REGION | データ保管地域 | 必須 | P1 | - | ap-northeast-1 |
| R2_BUCKET_REGION | R2リージョン | 必須 | P1 | - | tokyo |
| PITR_WINDOW_DAYS | PITR保持日数 | 必須 | P2 | - | 7 |
| SOFT_DELETE_GRACE_DAYS | Soft delete猶予 | 必須 | P2 | - | 30 |
| EMAIL_UNDO_WINDOW_SECONDS | メール送信undo秒 | 必須 | P2 | - | 30 |
| INTERNAL_INVITE_TIMEOUT_HOURS | 社内同席timeout | 必須 | P2 | - | 2 |
| CALENDAR_HOLD_TTL_HOURS | 仮押さえTTL | 必須 | P2 | - | 48 |
| CONSENT_CHECK_GRACE_MIN | 録画同意確認 | 必須 | P2 | - | 5 |
| DELETION_REQUEST_SLA_DAYS | 削除依頼対応 | 必須 | P2 | - | 30 |
| AB_HASH_SECRET | AB割当ハッシュ | 必須 | P3 | 年次 | stable assignment |
| FEATURE_FLAGS_DEFAULT_ENABLED | FF既定値 | 任意 | P2 | - | false |
| MAX_OFFLINE_QUEUE_ITEMS | オフライン上限 | 必須 | P1 | - | 100 |
| MAX_VOICE_MEMO_SECONDS | 音声メモ最大 | 必須 | P2 | - | 60 |
| RANKING_WEIGHTS | 検索ランキング重み | 必須 | P1 | - | 0.4/0.4/0.2 |
| I18N_DEFAULT_LOCALE | 既定ロケール | 必須 | P3 | - | ja |
| I18N_FALLBACK_LOCALE | フォールバック | 必須 | P3 | - | en |
| TZDATA_VERSION | IANA TZ DB | 必須 | P2 | - | tzdata 2026a+ |
| MFA_REQUIRED_FOR_ROLES | MFA必須ロール | 必須 | P2 | - | admin,manager |
| RATE_LIMIT_USER_RPM | ユーザレート | 必須 | P1 | - | 60 |
| RATE_LIMIT_ADMIN_RPM | admin系レート | 必須 | P1 | - | 10 |
| WEBHOOK_SECRET_ZOOM | Zoom署名検証 | 必須 | P1 | 90日 | - |
| WEBHOOK_SECRET_GMAIL | Gmail署名 | 必須 | P1 | 90日 | - |
| WEB_VITALS_ENDPOINT | Vitals送信先 | 任意 | P2 | - | - |
| SENTRY_DSN | Sentry | 必須 | P1 | - | - |
| SAMPLE_DATA_SEED | オンボーディングシード | 必須 | P1 | - | - |