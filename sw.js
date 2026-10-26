importScripts('./firebase-messaging-sw.js');

const CACHE_NAME = 'green-force-v64';
const OFFLINE_URL = './offline.html';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './manifest.json',
  './auth.js',
  './firebase-config.js',
  './gallery.js',
  './layout.js',
  './settings-view.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/farm/building_school.webp',
  './assets/images/farm/building_house.webp',
  './assets/images/farm/building_compost.webp',
  './assets/images/farm/building_market.webp',
  './assets/images/farm/garden_bed.webp',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force new SW to take over immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim()); // Take control of all clients immediately
    })
  );
});

// Helper para sanitizar respuestas redireccionadas y evitar el bloqueo ERR_FAILED de Fetch/Service Worker en localhost
function cleanResponse(response) {
  if (!response || !response.redirected) {
    return response;
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('fetch', (event) => {
  // EXCLUDE Remote Firebase Auth & API requests from Service Worker
  const isRemoteFirebase = (
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('identitytoolkit') ||
    (event.request.url.includes('firebase') && !event.request.url.includes(self.location.origin))
  );

  if (isRemoteFirebase) {
    return;
  }

  // Network-first for HTML, JS, CSS and page navigation to ensure fresh code
  const url = event.request.url;
  const isCritical = event.request.mode === 'navigate' ||
    url.includes('.html') ||
    url.includes('.js') ||
    url.includes('.css') ||
    url.endsWith('/') ||
    event.request.destination === 'document';

  if (isCritical) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh version
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return cleanResponse(response);
        })
        .catch(() => {
          // Try cached version if network fails
          return caches.match(event.request).then(cachedResponse => {
            if (!cachedResponse && event.request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
            return cachedResponse;
          });
        })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          // Check if we received a valid response
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
            return fetchResponse;
          }

          // Clone the response because it's a stream and can only be consumed once
          var responseToCache = fetchResponse.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              if (event.request.method === 'GET') {
                cache.put(event.request, responseToCache);
              }
            });

          return fetchResponse;
        }).catch(() => {
          // Offline fallback for HTML documents
          if (event.request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
          return response;
        });
      })
  );
});
