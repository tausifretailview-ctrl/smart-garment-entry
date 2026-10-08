/* Loaded into the Workbox service worker (vite.config.ts → workbox.importScripts).
   Handles taps on website order / enquiry notifications: focus the open app and
   ask it to route in-app, or open the Website page when no window is open.
   Other notifications are left alone. */
self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  if (data.source !== "ezzy-website-enquiry") return;
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
