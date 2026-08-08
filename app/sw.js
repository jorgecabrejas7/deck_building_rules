// Module-cache guard. Without it, a deploy can hand a returning browser a
// stale module next to a fresh one: the HTTP cache decides per-file, and no
// ?v= on the entry propagates to deep `import './x.js'` requests — a
// mixed-version graph that only a hard reload fixes (observed live twice).
//
// Strategy: network-first with forced revalidation for every same-origin GET.
// `cache: 'no-cache'` makes the browser revalidate each file with the server
// (GitHub Pages answers cheap ETag 304s), so every file in one page load
// agrees with the currently deployed version. The versioned cache below is an
// OFFLINE FALLBACK only — it is never consulted while the network answers.
//
// Deploy story: bump VERSION on deploys that should drop the offline
// fallback cache. Forgetting the bump cannot re-introduce cache poisoning —
// online correctness never depends on it, because fetches never trust the
// HTTP cache. Any byte change to this file triggers an immediate update
// (skipWaiting + clients.claim), since browsers refetch the registered SW
// script bypassing the HTTP cache.
const VERSION = 'v1';
const CACHE = 'pdc-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request, { cache: 'no-cache' });
      if (fresh.ok) (await caches.open(CACHE)).put(e.request, fresh.clone());
      return fresh;
    } catch (err) {
      const hit = await caches.match(e.request, { cacheName: CACHE });
      if (hit) return hit;
      throw err;
    }
  })());
});
