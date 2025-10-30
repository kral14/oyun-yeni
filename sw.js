// Minimal service worker to enable installability and basic offline shell
const CACHE = 'td-cache-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/mobile.html',
  '/style.css',
  '/game.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE_ASSETS.map((p) => new Request(p, { cache: 'reload' })));
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


