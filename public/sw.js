// Service Worker — Phase 5: shell cache-first + range network-first.

const CACHE_NAME = 'wasm-db-ranges-v1';
const SHELL_CACHE = 'wasm-db-shell-v1';
const KNOWN_CACHES = new Set([CACHE_NAME, SHELL_CACHE]);

/** Encode a URL + Range header as a stable Cache API lookup key. */
function rangeCacheKey(url, rangeHeader) {
  return (
    'https://cache.wasm-db.invalid/v1?u=' +
    encodeURIComponent(url) +
    '&r=' +
    encodeURIComponent(rangeHeader)
  );
}

/** True for paths that are part of the app shell. */
function isShellPath(pathname) {
  return (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname.startsWith('/assets/')
  );
}

// Pre-cache shell assets on install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/index.html']))
      .then(() => self.skipWaiting()),
  );
});

// Remove stale caches on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Serve shell assets cache-first; range requests network-first+cache; rest pass-through.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('Range');

  // App shell: cache-first from SHELL_CACHE.
  if (url.origin === self.location.origin && isShellPath(url.pathname)) {
    event.respondWith(serveShell(request));
    return;
  }

  // Any range request (Parquet data, any origin): network-first, cache fallback.
  if (rangeHeader) {
    event.respondWith(serveRange(request, rangeHeader));
    return;
  }

  // Everything else: pass through to network.
  event.respondWith(fetch(request));
});

async function serveShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Service Unavailable — reload when online', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function serveRange(request, rangeHeader) {
  const cacheKey = rangeCacheKey(request.url, rangeHeader);
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.status === 206 || response.status === 200) {
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    return new Response('Range unavailable — not in cache', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
