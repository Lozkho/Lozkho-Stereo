/**
 * Service Worker de Lozkho Stereo.
 *
 * Estrategia:
 *   - HTML principal: Network-First (cae a cache si no hay red).
 *   - Assets del propio origen (_next/static, JS, CSS, fuentes locales):
 *     Network-First con fallback a cache. Esto asegura que cuando se publica
 *     un nuevo build, TODOS los usuarios lo vean en el siguiente reload,
 *     sin necesidad de cerrar la pestaña. Si la red falla, se sirve la
 *     versión cacheada (offline).
 *   - Fuentes de Google Fonts: Cache-First (cross-origin, no cambian).
 *
 * Versión: bump cada vez que se cambia la app. El `activate` limpia
 * caches antiguas. `skipWaiting()` + `clients.claim()` hacen que el
 * nuevo SW tome control inmediatamente en la pestaña ya abierta.
 */

const VERSION = "lozkho-v3";
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

// Dominios cuyos assets se cachean en runtime (Cache-First)
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

  // Fuentes de Google Fonts → Cache-First (cross-origin estables).
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

  // Assets estáticos del propio origen (JS, CSS, fuentes, imágenes):
  // Network-First con fallback a cache.
  // Esto es CRÍTICO para que los nuevos builds se carguen siempre.
  // Antes era Cache-First, lo que causaba que el usuario viera código
  // antiguo indefinidamente tras un nuevo despliegue.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || new Response("", { status: 504 }))
      )
  );
});
