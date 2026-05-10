/* Knowledge Sales Platform — minimal Service Worker (P1 W1 scaffold)
 *
 * navigation 時にネットワーク優先 → 失敗で /offline をフォールバック表示。
 * 本格的な offline-first cache 戦略 (workbox / IndexedDB 暗号化) は Phase1 W3 (T-007) で。
 */
const CACHE = 'ksp-shell-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached ?? new Response('Offline', { status: 503 });
    }),
  );
});
