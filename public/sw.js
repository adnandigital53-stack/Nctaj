// Network-first for every navigation, always — this whole site's design
// is that an admin edit shows up immediately with no rebuild, on a live D1
// read on every request. A service worker that ever served a cached HTML
// page instead of that fresh read would quietly undermine the one thing
// this backend is built around, so this never caches a navigation response.
// It only steps in when the network genuinely fails, with a single
// precached offline page.
//
// Content-hashed static assets (/_astro/*) and R2-served photos
// (/uploads/*) are the opposite case — their filenames change whenever
// their content does, so caching them opportunistically is free.
//
// Bump this on any change to the logic below; the activate handler deletes
// any cache under a different name, which is the only way an already-
// installed client picks up the new behavior.
const CACHE = 'nctaj-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // every admin form is a POST — let it through untouched
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts/GTM: not ours to cache or fall back for
  if (url.pathname.startsWith('/admin')) return; // never intercept authenticated pages

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
