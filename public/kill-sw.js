/**
 * BREAK-GLASS kill switch — NOT registered by default.
 *
 * If the production service worker misbehaves in the field:
 * 1. Temporarily deploy this file as the site SW (replace /sw.js or point registerSW to
 *    /kill-sw.js) OR serve it at /sw.js for one deploy.
 * 2. On the next visit, this script unregisters itself, deletes all Cache Storage
 *    buckets, and reloads open clients — clients fall back to plain network fetches.
 * 3. Revert to a normal build once clients have cleared the bad SW.
 *
 * Coexists with vercel.json no-cache HTML: after unregister, index.html always comes
 * from the network (not precache).
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })(),
  );
});
