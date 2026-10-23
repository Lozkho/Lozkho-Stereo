/**
 * Service Worker de Lozkho Stereo.
 *
 * Cache-First para assets estáticos (imágenes, fuentes, _next/static).
 * Network-First para el HTML principal (para que se actualice si hay nueva versión).
 *
 * Estrategia: precachea el shell en `install`, borra caches antiguas en `activate`,
 * y responde con cache si la red falla. Esto permite que la app se abra sin conexión.
 */

const VERSION = "lozkho-v2";
const CORE_CACHE = `${VERSION}-core`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./robots.txt",
];

// Dominios cuyos assets se cachean en runtime (Network-First con fallback a cache)
const RUNTIME_CACHEABLE_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fuentes de Google Fonts → Cache-First (caen en runtime cache).
  // Estas son cross-origin pero las cacheamos igual para offline.
  if (RUNTIME_CACHEABLE_ORIGINS.includes(url.origin)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached || new Response("", { status: 504 }));
      })
    );
    return;
  }

  // Solo gestionamos peticiones del mismo origen
  if (url.origin !== self.location.origin) return;

  // HTML → Network-First (cae a cache si no hay red)
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Assets estáticos → Cache-First
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
