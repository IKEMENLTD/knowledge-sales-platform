# 11_tech_stack_libs

| 技術スタック・ライブラリ確定版 |  |  |  |
| --- | --- | --- | --- |
| カテゴリ | パッケージ | バージョン | 用途 |
| Frontend | next | 15.x (App Router) |  |
| Frontend | react | 19.x |  |
| Frontend | typescript | 5.x |  |
| Frontend | tailwindcss | 3.x |  |
| Frontend | shadcn/ui | latest | コンポーネント |
| Frontend | lucide-react | latest | アイコン |
| Frontend | react-hook-form + zod | latest | フォーム |
| Frontend | @tanstack/react-query | 5.x | サーバーステート |
| Frontend | zustand | 4.x | クライアントステート |
| Frontend | date-fns + date-fns-tz | latest | 日付処理 |
| Frontend | recharts | 2.x | チャート |
| Frontend | react-dropzone | 14.x | ファイルアップロード |
| Frontend | sonner | latest | トースト |
| Frontend | cmdk | latest | コマンドパレット |
| Backend | hono | 4.x | Worker HTTP |
| Backend | drizzle-orm + drizzle-kit | latest | ORM/migration |
| Backend | @supabase/supabase-js | 2.x | Supabase SDK |
| Backend | @supabase/ssr | 0.5.x | Next.js SSR連携 |
| Backend | googleapis | 140.x | Google API SDK |
| Backend | @aws-sdk/client-s3 | 3.x | R2(S3互換) |
| Backend | @anthropic-ai/sdk | latest | Claude |
| Backend | openai | 4.x | Embeddings/Whisper/TTS |
| Backend | pdf-parse | 1.x | PDF抽出 |
| Backend | mammoth | 1.x | docx抽出 |
| Backend | node-pptx-parser | - | pptx抽出 |
| Backend | fluent-ffmpeg | latest | クリップ生成 |
| Backend | webvtt-parser | - | VTT解析 |
| Backend | resend | 3.x | 通知メール |
| Backend | @sentry/nextjs + @sentry/node | latest | エラー監視 |
| Auth | jose | latest | JWT検証(Pub/Sub) |
| Validation | zod | 3.x | スキーマ検証 |
| Test | vitest + @testing-library/react | latest | unit/component |
| Test | playwright | latest | E2E |
| Build | turborepo + pnpm | latest | モノレポ |
| Lint | biome or eslint+prettier | latest | 統一はbiome推奨 |
| ■ 追加採用ライブラリ(v2) |  |  |  |
| カテゴリ | ライブラリ | 用途 | Phase |
| Mobile Camera | react-camera-pro / native MediaDevices | 片手撮影 | P1 |
| Image processing | opencv-wasm | 明度/反射/歪み補正 | P1 |
| QR | jsqr | 裏面QR | P1 |
| Service Worker | workbox | オフライン/Push | P1 |
| IndexedDB | idb | オフラインキュー | P1 |
| Diarization | pyannote-audio (Render Worker) | 話者識別 | P1 |
| Whisper | faster-whisper / openai whisper | 音声認識 | P1 |
| Push | web-push (Node) | VAPID送信 | P2 |
| Maps | @googlemaps/places-autocomplete | 対面住所 | P2 |
| i18n | next-i18next | ja/en | P3 |
| A11y | @axe-core/react | a11y自動チェック | P3 |
| State | Zustand or Jotai | クライアント | P1 |
| Forms | react-hook-form + zod | autosaveと相性 | P1 |
| Realtime | @supabase/supabase-js Realtime | 複数デバイス同期 | P2 |
| Charts | recharts | ダッシュボード | P3 |
| Date/Time | date-fns-tz / luxon | TZ対応 | P2 |
| Validation | zod | API/Form | P1 |
| RTL | testing-library + Playwright | E2E | P1 |
| Hallucination guard | Custom RAG router | 出典必須 | P3 |
| Feature flags | 内製 + GrowthBook任意 | ロールアウト | P2 |
| A/B Test | 内製cohort | メールテンプレ | P3 |
| Calendly UI | 内製(週カレンダー) | 顧客向け | P2 |
| Streaming | Vercel AI SDK / Server-sent | ナレッジチャット | P3 |
| Crypto | libsodium / Supabase Vault | 暗号化 | P1 |