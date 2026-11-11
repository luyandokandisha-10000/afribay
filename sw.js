// ─────────────────────────────────────────────────────────────
// AfriBay — Progressive Web App Service Worker
// Offline resiliency, shell caching, and instant startup
// ─────────────────────────────────────────────────────────────

const CACHE_NAME = 'afribay-cache-v2.0';
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

// Install: Cache static application shell & skip waiting
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[AfriBay SW] Pre-caching application shell v2.0');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[AfriBay SW] Note: Pre-cache item skipped:', err);
      });
    })
  );
});

// Activate: Clean up old version caches immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[AfriBay SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for HTML navigation and API calls, Cache-First for static assets
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Network-First for HTML page navigation so users ALWAYS get the freshest app update
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Network-First for dynamic API endpoints & external providers
  if (url.pathname.startsWith('/api/') || url.hostname.includes('flutterwave') || url.hostname.includes('googleapis') || url.hostname.includes('pawapay')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache with background revalidation for static icons & scripts
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        return response;
      });
    })
  );
});
