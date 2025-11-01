// Minimal service worker to enable installability and basic offline shell
const SW_VERSION = '3.0-nocache';
console.log('[SW] version', SW_VERSION);

self.addEventListener('install', (event) => {
  // No precaching; ensure new SW takes control immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge ALL caches on every activate to avoid stale assets
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  // Network-only with explicit no-store to keep browser cache clean
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response('Offline', { status: 503 })));
});

// Optional: Clear caches on demand via message
self.addEventListener('message', async (event) => {
  if (event.data === 'PURGE_CACHES') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    event.source && event.source.postMessage && event.source.postMessage('CACHES_CLEARED');
  }
});


