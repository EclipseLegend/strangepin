/* StrangePin service worker: minimal and conservative.
 *
 * - Precaches the app shell (same-origin files listed below).
 * - Navigations: network-first, then cached shell, then /offline.html.
 * - Other same-origin requests (e.g. manifest): network-first, cache fallback.
 * (Pin data is inline in index.html; locations.js is not loaded by the app.)
 * - Same-origin static images and self-hosted fonts: cache-first.
 * - Cross-origin: ONLY exact, version-pinned library URLs (Leaflet, MapLibre) are
 *   cached. Everything else, including Firebase Auth/Firestore, Google APIs,
 *   EmailJS, Cloudinary, map tiles, fonts and translate, is never intercepted, so it
 *   is never cached.
 * Bump SP_SW_VERSION on every release that changes precached files.
 */
const SP_SW_VERSION = 'v2';
const SHELL_CACHE = `sp-shell-${SP_SW_VERSION}`;
const RUNTIME_CACHE = `sp-runtime-${SP_SW_VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// Version-pinned third-party libraries that are safe to cache (immutable URLs).
const PINNED_LIBS = new Set([
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js',
]);

// Same-origin paths that must never be served from cache.
const NEVER_CACHE_PATH = /^\/(__\/auth|__\/firebase|\.netlify|api)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('sp-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackUrls) {
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    for (const u of fallbackUrls || []) {
      const fb = await caches.match(u);
      if (fb) return fb;
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (PINNED_LIBS.has(url.origin + url.pathname) && !url.search) {
      event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    }
    return; // everything else cross-origin: browser default, never cached
  }

  if (NEVER_CACHE_PATH.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    // Root navigations fall back to the cached SPA shell; other paths (e.g. future
    // static /pins/<slug>/ pages that were not visited) fall back to offline.html.
    const isRoot = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(networkFirst(req, isRoot ? ['/', '/index.html', '/offline.html'] : ['/offline.html']));
    return;
  }

  if (/\.(png|jpe?g|webp|svg|ico|woff2)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  event.respondWith(networkFirst(req));
});
