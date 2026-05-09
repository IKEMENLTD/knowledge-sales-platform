# public/ - 静的アセット

## アイコン

- `icon-192.png` (192x192) - PWA / Android home screen
- `icon-512.png` (512x512) - PWA / splash
- `favicon.ico`

Phase1 W1 ではこれらは**プレースホルダー予定**。設計書ロゴ確定後に差し替え (T-002 デザインシステム連動)。

## sw.js

Service Worker placeholder。実装は Phase1 W3 の T-007 オフラインキューと連動して workbox ベースで生成。

## manifest.webmanifest

Next.js 15 の `app/manifest.ts` から自動生成されるため、このディレクトリに直接置く必要はない。
