# 12_cost_estimate

| 月次コスト試算 |  |  |  |  |
| --- | --- | --- | --- | --- |
| 前提: 10名 / 商談200件/月 / 録画100本/月 / 名刺150枚/月 |  |  |  |  |
| ■ 前提と単価(C列・D列に入力すると総額が再計算) |  |  |  |  |
| 項目 | 前提 | 単価 | 数量 | 月額(USD) |
| Render Web Service | Standard | 25 | 1 |  |
| Render Background Worker | Standard | 25 | 1 |  |
| Supabase Pro | 8GB DB + 100GB帯域 | 25 | 1 |  |
| Cloudflare R2 Storage | 500GB保存 | 0.015 | 500 |  |
| Cloudflare R2 Class A ops | 書き込み | 4.5e-06 | 10000 |  |
| Anthropic Claude(録画解析) | $15/Mtokens入力 ×100本×30k tokens | 0.00045 | 100 |  |
| Anthropic Claude(その他) | チャット/ロープレ等 | 30 | 1 |  |
| OpenAI Embeddings | $0.02/Mtokens × 5M tokens | 2e-08 | 5000000 |  |
| OpenAI Whisper(補完のみ) | $0.006/分 × 1000分 | 0.006 | 1000 |  |
| OpenAI TTS(P3以降) | $15/M文字 × 200k文字 | 1.5e-05 | 200000 |  |
| Google Vision Document AI | 無料枠1000件超過分(150件→無料内) | 0 | 0 |  |
| Google Cloud Pub/Sub | topic+subscriber | 1 | 1 |  |
| Resend | 3000通/月 まで無料 | 0 | 1 |  |
| Sentry Developer | 個人プラン | 0 | 1 |  |
| ドメイン+SSL | Cloudflare | 1 | 1 |  |
| 合計(USD/月) |  |  |  |  |
| 合計(JPY/月 @150) |  |  |  |  |
| ■ コストが跳ねる主な要因 |  |  |  |  |
| 要因 | 影響 |  |  |  |
| 録画本数増 | Claude入力tokensが線形増。300本なら$135相当(録画解析だけで) |  |  |  |
| 録画長時間化 | 60分→90分で約1.5倍 |  |  |  |
| 動画保存量 | R2は$0.015/GB/月。1年で1TBに達することがある |  |  |  |
| ロープレ多用 | Claude+TTSで1セッション$0.10〜0.30 |  |  |  |
| Whisper多用 | Zoom文字起こしで足りる場合は使わない判断重要 |  |  |  |
| ■ 追加コスト試算(v2) |  |  |  |  |
| 項目 | 数量 | 単価 | 月額 | 備考 |
| Pyannote Workerホスティング(GPU不要) | 1台 | $0/月 | 内包 | Render Standard内 |
| Web Push | - | - | $0 | VAPID自前 |
| Cloudflare R2(東京) | 100GB | $0.015/GB | $1.5 | - |
| Supabase PITR(Pro) | - | $10/組織 | $10 | Backup含む |
| Supabase Realtime | - | - | $0 | Pro内 |
| Maps Places | 6000QPM超過分 | - | $0-30 | ライト想定 |
| i18n翻訳ベンダー(任意) | - | - | $50 | 初期翻訳のみ |
| Sentry | - | Team | $26 | monthly |
| 合計増分 |  |  | ≒$100 | - |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |
| 項目 | 数量 | 単価 | 月額 | 備考 |
| LLM cost cap算出基準(N-1) | - | - | - | ¥150/$1基準、為替±10%以上変動でポリシー再評価。月予算150%でhard stop |
| per-conversation cap | - | - | $0.10 | retrieval+生成合計、超過時はreject |
| per-meeting cap | - | - | $0.50 | stage1+2+3+reprocess含む、超過時Haiku強制 |