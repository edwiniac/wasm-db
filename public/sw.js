// Pass-through Service Worker — Phase 1.
// Phase 2 adds cache interception for DuckDB's httpfs range requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
