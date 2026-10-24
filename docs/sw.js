// Service worker: makes Hannah's Game installable and playable offline.
//  - game code (html/js/json): network first, falls back to the cached copy, so updates ship right away
//  - models, textures, audio, icons: cache first (they are big and rarely change)
//  - three.js / rapier from the CDN and Google Fonts: cache first
// Everything is cached as it is first loaded, so after one full load of the cove the game works with no signal.
// Bump VERSION to throw away every cached copy.
const VERSION = 'v1';
const CODE = `hg-code-${VERSION}`;
const STATIC = `hg-static-${VERSION}`;

const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

const CDN_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CODE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('hg-') && key !== CODE && key !== STATIC) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CODE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // opaque (no-cors) responses are fine to keep too, but only cache real successes
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  const rel = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;

  // dev tools pages should never be served stale
  if (rel.startsWith('dev/')) return;

  if (/^(assets|icons)\//.test(rel) && !rel.endsWith('assets.json')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
