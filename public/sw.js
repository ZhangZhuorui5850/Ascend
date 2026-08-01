const CACHE_VERSION = "zgca-shell-v4";
const PUBLIC_SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PUBLIC_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("zgca-shell-") && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  // All application navigations remain network-only. The fallback is a public,
  // identity-free document; authenticated pages, RSC, actions, APIs and files
  // are never written to Cache Storage.
  event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Ascend 提醒", body: event.data?.text() || "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "Ascend 提醒";
  const body = typeof payload.body === "string" ? payload.body : "打开 Ascend 查看详情";
  const targetPath = typeof payload.targetPath === "string" && payload.targetPath.startsWith("/")
    ? payload.targetPath
    : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    data: { targetPath },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.targetPath || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(targetPath);
        return existing.focus();
      }
      return self.clients.openWindow(targetPath);
    }),
  );
});
