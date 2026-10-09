/* Loaded into the Workbox service worker (vite.config.ts → workbox.importScripts).
   Handles taps on website order / enquiry and customer review notifications:
   focus the open app and ask it to route in-app, or open the page when no
   window is open. Other notifications are left alone. */
const EZZY_ALERT_SOURCES = ["ezzy-website-enquiry", "ezzy-customer-review"];
self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  if (EZZY_ALERT_SOURCES.indexOf(data.source) < 0) return;
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "ezzy-open-path", path: data.path || "/website" });
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(data.url || "/");
    })(),
  );
});
