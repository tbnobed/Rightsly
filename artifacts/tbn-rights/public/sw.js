const CACHE_PREFIX = "rightsly-shell-";
const CACHE_NAME = `${CACHE_PREFIX}__RIGHTSLY_BUILD_ID__`;
const SCOPE_URL = new URL("./", self.registration.scope).href;
const INDEX_URL = new URL("index.html", self.registration.scope).href;
const PRECACHE_PATHS = /*__RIGHTSLY_PRECACHE__*/[];
const STATIC_ASSETS = PRECACHE_PATHS.map(
  (asset) => new URL(asset, self.registration.scope).href,
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        STATIC_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      ))
      .then(async () => {
        const cache = await caches.open(CACHE_NAME);
        const indexResponse = await cache.match(INDEX_URL);
        if (!indexResponse) throw new Error("Rightsly app shell was not precached.");
        await cache.put(SCOPE_URL, indexResponse);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname.replace(/^\/+/, "");

  // Rightsly is a system of record. Never cache authenticated API responses.
  if (relativePath === "api" || relativePath.startsWith("api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SCOPE_URL, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SCOPE_URL) ?? await caches.match(INDEX_URL);
          return cached ?? new Response(
            "<!doctype html><title>Rightsly is offline</title><main><h1>Rightsly is offline</h1><p>Reconnect to access licensing data.</p></main>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
