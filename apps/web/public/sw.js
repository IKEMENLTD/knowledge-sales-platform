// Service Worker placeholder - Phase1 W3 で workbox ベース実装予定 (T-007 連動)
// 17_offline_mobile / 20_failure_recovery のオフラインキューと連動。
//
// 現状は no-op で SW 登録自体を成功させ、PWA インストール要件を満たすのみ。
// 実装時に precache / runtime-cache (network-first for API, stale-while-revalidate for assets) を追加。

self.addEventListener('install', (event) => {
  // 即時 activate (古い SW を引き継がない)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Phase1 W3 で実装: ネットワーク失敗時 /offline にフォールバック
});
