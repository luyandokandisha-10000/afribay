// ─────────────────────────────────────────────────────────────
// AfriBay — Progressive Web App Service Worker
// Offline resiliency, shell caching, and instant startup
// ─────────────────────────────────────────────────────────────

const CACHE_NAME = 'afribay-cache-v1.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/firebase.js',
  './src/firestore.js'
];

// Install: Cache static application shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[AfriBay SW] Pre-caching application shell');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[AfriBay SW] Note: Pre-cache item skipped:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old version caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[AfriBay SW] Removing outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for app assets, Network-First for API/OAuth calls
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip POST, PUT, DELETE requests (only GET is cacheable)
  if (request.method !== 'GET') {
    return;
  }

  // Network-First for dynamic API endpoints & Flutterwave
  if (url.pathname.startsWith('/api/') || url.hostname.includes('flutterwave') || url.hostname.includes('googleapis')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first / Stale-While-Revalidate for local shell and static media
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache for next time
        fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Not in cache: fetch from network
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Fallback to cached index.html for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
