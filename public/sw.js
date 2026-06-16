/**
 * Smart Broker USA — Service Worker
 *
 * This service worker is intentionally minimal. The previous version used
 * Workbox with an opaqueredirect handler on '/' that intercepted the Google
 * OAuth redirect and prevented Firebase Auth from processing the credential
 * on mobile Chrome — causing an infinite login loop.
 *
 * This version:
 *   1. Clears ALL old caches on install (removes the broken Workbox cache)
 *   2. Takes over all clients immediately (skipWaiting + clientsClaim)
 *   3. Does NOT cache the login page '/' — always fetches from network
 *   4. Does NOT intercept or modify any redirect responses
 *   5. Caches static assets and dashboard pages with safe strategies
 */

const CACHE_VERSION = 'sb-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DASHBOARD_CACHE = `${CACHE_VERSION}-dashboard`;

// On install: delete ALL old caches and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.skipWaiting())
  );
});

// On activate: claim all clients so this SW takes effect immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch handler — never intercept the login page or auth routes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache or intercept:
  //   - The login page '/'
  //   - Firebase auth routes '/__/auth/*'
  //   - API routes '/api/*'
  //   - Any POST/PUT/DELETE requests
  //   - Cross-origin requests (Google OAuth, Firebase, etc.)
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/' ||
    url.pathname.startsWith('/__/auth') ||
    url.pathname.startsWith('/api/')
  ) {
    // Pass through to network — no caching, no interception
    return;
  }

  // Static assets (_next/static/*): cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Dashboard pages: network-first with cache fallback
  if (url.pathname.startsWith('/dashboard/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(DASHBOARD_CACHE).then((cache) =>
              cache.put(event.request, response.clone())
            );
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || fetch(event.request))
        )
    );
    return;
  }

  // Everything else: network-first, no caching
});
