self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // A simple fetch handler is required by Chrome to trigger the install prompt
  // We can just pass the request through to the network
  e.respondWith(fetch(e.request).catch(() => {
    // Optional offline fallback could go here
  }));
});
