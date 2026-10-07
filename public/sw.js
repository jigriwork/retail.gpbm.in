// Service worker: lets browsers offer "Install app" and shows phone
// notifications. It caches nothing, so pages always come fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "GPBM Retail", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "GPBM Retail";
  const options = {
    badge: "/icon-192.png",
    body: data.body || "",
    data: { url: data.url || "/" },
    icon: "/icon-192.png",
    renotify: true,
    silent: Boolean(data.silent),
    tag: data.tag || "gpbm",
    vibrate: data.silent ? [] : [120, 60, 120],
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // An open app plays its own chime and refreshes the 🔔 count.
    const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    windows.forEach((client) => client.postMessage({ body: options.body, silent: options.silent, title, type: "gpbm-push", url: options.data.url }));
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    if (open) { await open.focus(); if ("navigate" in open) await open.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
