// Minimal service worker for Chrome PWA installability.
// Network-first passthrough: no offline caching of app data (records system —
// stale data is worse than no data), but keeps the app installable.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Passthrough; presence of a fetch handler satisfies install criteria.
  event.respondWith(fetch(event.request));
});
