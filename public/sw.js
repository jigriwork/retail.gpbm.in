// Minimal service worker: lets browsers offer "Install app". It caches
// nothing, so every page and figure always comes fresh from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
