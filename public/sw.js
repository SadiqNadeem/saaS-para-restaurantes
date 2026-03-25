/**
 * Service Worker — Kebab SaaS POS offline support
 *
 * Strategies:
 *  - App shell (HTML + same-origin JS/CSS assets): network-first, cache fallback
 *  - Product images from Supabase Storage: cache-first (immutable once uploaded)
 *  - Supabase REST/Auth API: network only (auth headers, realtime data)
 */

const CACHE_NAME = "pos-shell-v1";
const SHELL_URL = "/";

// ─── Install: pre-cache the HTML shell ───────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL))
  );
  // Take control immediately without waiting for old SW to die
  self.skipWaiting();
});

// ─── Activate: delete stale caches ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests
  if (request.method !== "GET") return;

  // ── Product images from Supabase Storage: cache-first ──
  if (
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.startsWith("/storage/v1/object/public/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(
            () =>
              cached ??
              new Response("", {
                status: 503,
                statusText: "Offline",
              })
          );
      })
    );
    return;
  }

  // ── All other cross-origin requests (Supabase API, auth, etc.): passthrough ──
  if (url.origin !== self.location.origin) return;

  // ── Same-origin static assets (/assets/...): cache-first, add to cache on miss ──
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Navigation requests: network-first, fallback to cached shell ──
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(SHELL_URL))
    );
    return;
  }

  // ── Everything else same-origin: network-first with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
