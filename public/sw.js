// Service Worker — Phase 2: intercepts range requests from DuckDB httpfs and
// app transport, caches responses in SW Cache API.

const CACHE_NAME = 'wasm-db-ranges-v1';
const ORIGIN = self.location.origin;

/** Encode a URL + Range header as a stable Cache API lookup key. */
function rangeCacheKey(url, rangeHeader) {
  return (
    'https://cache.wasm-db.invalid/v1?u=' +
    encodeURIComponent(url) +
    '&r=' +
    encodeURIComponent(rangeHeader)
  );
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const rangeHeader = request.headers.get('Range');

  // Only cache external range requests — never intercept local app assets.
  if (!rangeHeader || request.url.startsWith(ORIGIN)) {
    event.respondWith(fetch(request));
    return;
  }

  const cacheKey = rangeCacheKey(request.url, rangeHeader);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const response = await fetch(request);
      // Cache successful partial-content and full-content responses.
      if (response.status === 206 || response.status === 200) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    }),
  );
});
