// Dhara News Service Worker v3
// Handles: offline caching, push notifications, background sync

const CACHE_NAME    = "dhara-v3";
const ARTICLE_CACHE = "dhara-articles-v3";

// Fix #17: Only truly static assets belong here.
// Dynamic Next.js SSR pages (/morning-brief, /archive, /search, /live) must NOT
// be precached — they change on every request and would show stale content offline.
const STATIC_ASSETS = ["/manifest.json"];

// Dynamic SSR pages — always served network-first; fall back to a generic
// offline message rather than a stale cached version.
const NETWORK_FIRST_PAGES = ["/morning-brief", "/archive", "/search", "/live"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== ARTICLE_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const { request } = e;
  const url = new URL(request.url);

  // Always prefer fresh HTML for navigations; stale shell causes chunk 404s after deploys.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(cached =>
          cached || new Response("<html><body><h2>You are offline</h2></body></html>", {
            headers: { "Content-Type": "text/html" },
            status: 503,
          })
        )
      )
    );
    return;
  }

  // API: network first, fail gracefully
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.includes("/live/stream")) return; // SSE — never intercept
    e.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: "offline", cached: true }),
        { headers: { "Content-Type": "application/json" } }
      ))
    );
    return;
  }

  // Fix #17: Dynamic SSR pages — network first, no cache fallback (stale content
  // is worse than an honest offline message for pages like morning-brief/archive).
  if (NETWORK_FIRST_PAGES.some(p => url.pathname === p || url.pathname.startsWith(p + "?"))) {
    e.respondWith(
      fetch(request).catch(() => new Response(
        "<html><body><h2>You are offline</h2><p>This page requires a live connection.</p></body></html>",
        { headers: { "Content-Type": "text/html" }, status: 503 }
      ))
    );
    return;
  }

  // Article pages: network first, then cache fallback.
  // This avoids showing stale article truth/status after rescoring or relabels.
  if (url.pathname.startsWith("/article/")) {
    e.respondWith(
      caches.open(ARTICLE_CACHE).then(cache =>
        fetch(request).then(res => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => cache.match(request).then(cached =>
            cached || new Response(
              "<html><body><h2>You are offline</h2><p>No cached article available.</p></body></html>",
              { headers: { "Content-Type": "text/html" }, status: 503 }
            )
          ))
      )
    );
    return;
  }

  // Static: cache first
  e.respondWith(caches.match(request).then(c => c || fetch(request)));
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", e => {
  const data = e.data?.json() || {};
  const title = data.title || "धारा Breaking News";
  const options = {
    body:    data.body || data.headline || "A new verified story has been published.",
    icon:    "/icons/icon-192.svg",
    badge:   "/icons/icon-192.svg",
    tag:     data.cluster_id || "dhara-news",
    renotify: true,
    requireInteraction: data.truth_score >= 80,
    data:    { url: data.cluster_id ? `/article/${data.cluster_id}` : "/" },
    actions: [
      { action: "read",    title: "Read now" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type: "window" }).then(cs => {
      const existing = cs.find(c => c.url === url && "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── Messages from app ─────────────────────────────────────────────────────────
self.addEventListener("message", e => {
  if (e.data?.type === "CACHE_ARTICLE" && e.data.url) {
    caches.open(ARTICLE_CACHE).then(cache =>
      fetch(e.data.url).then(res => { if (res.ok) cache.put(e.data.url, res); })
    );
  }
  if (e.data?.type === "CLEAR_CACHE") {
    caches.delete(ARTICLE_CACHE);
  }
});
