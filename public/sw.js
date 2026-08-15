const CACHE_NAME = "rabbit-timer-v18";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/images/icons/icon-192.png",
  "/images/icons/icon-512.png",
  "/images/icons/apple-touch-icon.png",
  "/images/sprites/rabbit-jump.png",
  "/images/sprites/rabbit-eat-1.png",
  "/images/sprites/rabbit-eat-2.png",
  "/images/sprites/rabbit-carrot.png",
  "/images/sprites/blue-mood-sprite.webp",
  "/images/sprites/green-sleep-sprite.webp",
  "/images/sprites/finish-line.webp",
  "/images/sprites/bunny-celebrate-1.webp",
  "/images/sprites/bunny-celebrate-2.webp",
  "/images/timer-styles/blue-mood-housing.webp",
  "/images/timer-styles/blue-mood-thumbnail.webp",
  "/images/timer-styles/green-sleep-housing.webp",
  "/images/timer-styles/green-sleep-thumbnail.webp",
  "/images/sprites/2212930E-A0C9-4214-B4A0-47D163A34245.PNG",
  "/images/sprites/paint-1.webp",
  "/images/sprites/paint-2.webp",
  "/images/sprites/paint-3.webp",
];
const STATIC_PATHS = new Set(APP_SHELL.filter((path) => path !== "/"));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match("/")),
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !STATIC_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => new URL(client.url).pathname === targetUrl);
      if (existingClient) return existingClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { title: "Timer", body: "Time’s up!" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Timer", {
      body: payload.body || "Time’s up!",
      icon: payload.icon || "/images/icons/icon-192.png",
      badge: payload.badge || "/images/icons/icon-192.png",
      tag: payload.tag || "carrot-timer",
      data: { url: payload.url || "/" },
    }),
  );
});
