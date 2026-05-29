// Legacy service worker — replaced by Workbox (src/sw.ts).
// This version clears all stale caches left by the old sw.js
// so browsers that cached it get a clean slate on next visit.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
