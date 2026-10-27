/* Public install assets only. Never store account pages, API responses or student data. */
const CACHE = 'tmt-pwa-public-__PWA_BUILD_ID__';
const PUBLIC_FILES = ['/offline.html', '/logo/icon-192.png', '/logo/icon-512.png', '/logo/icon-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('tmt-pwa-public-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'GET' && url.origin === self.location.origin && PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(url.pathname, { cacheName: CACHE }).then(cached => cached || fetch(request)));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.mode !== 'navigate'
    || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  event.respondWith(fetch(request).catch(() => caches.match('/offline.html', { cacheName: CACHE })));
});
