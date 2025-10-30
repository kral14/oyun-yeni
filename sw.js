// Minimal service worker to enable installability and basic offline shell
const SW_VERSION = '2.1';
const CACHE = 'td-cache-v2.1';
console.log('[SW] version', SW_VERSION);
// Use relative URLs to work under subpaths (e.g., GitHub Pages)
const CORE_ASSETS = [
  'index.html',
  'mobile.html',
  'style.css',
  'game.js',
  'favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Add core assets one by one; skip missing to avoid install failure
    for (const p of CORE_ASSETS) {
      try {
        await cache.add(new Request(p, { cache: 'reload' }));
      } catch (e) {
        // ignore missing resources
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch (e) {
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});


