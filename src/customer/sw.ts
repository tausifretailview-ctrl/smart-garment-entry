/// <reference lib="webworker" />
// firebase-messaging-sw.js (built by vite.customer-sw.config.ts from this file).
// Domain-root service worker for the CUSTOMER app only — separate domain from
// the ERP, no PWA plugin, no caching: push delivery + telemetry only.
//
// Telemetry mapping (push_messages.id arrives as FCM data.message_id):
//   notification shown (showNotification resolved) -> push_track 'delivered'
//   notificationclick        -> push_track 'opened', then open the bill / offer page
//                               (or WhatsApp, from the notification's WhatsApp button)
//   notificationclose        -> push_track 'dismissed'

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { buildPushDisplay, clickTarget, notificationOptions } from "./lib/pushDisplay";

declare const self: ServiceWorkerGlobalScope;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function track(messageId: string | undefined, event: string): Promise<void> {
  if (!messageId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/push_track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ p_message_id: messageId, p_event: event }),
    });
  } catch {
    /* telemetry must never break delivery */
  }
}

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
});

const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const display = buildPushDisplay(payload, self.location.origin);
  const { title, messageId } = display;
  const options = notificationOptions(display);

  // 'delivered' means the phone accepted the notification, not just that the worker woke up.
  // If display is refused (notifications blocked for the site/app, permission revoked) the
  // message stays 'sent' instead of being reported as delivered. Returning the promise keeps
  // the worker alive until the telemetry call is made. A picture or logo that will not load
  // must never cost the notification itself, so a refused rich notification is retried plain.
  return self.registration
    .showNotification(title, options)
    .catch(() =>
      self.registration.showNotification(title, {
        body: display.body,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        data: options.data,
        tag: display.tag,
      }),
    )
    .then(() => track(messageId, "delivered"))
    .catch(() => undefined);
});

self.addEventListener("notificationclick", (event) => {
  const notif = event.notification as Notification & {
    data?: { url?: string; messageId?: string; whatsappUrl?: string };
  };
  const url = clickTarget(
    { url: notif.data?.url ?? "/", whatsappUrl: notif.data?.whatsappUrl },
    (event as NotificationEvent & { action?: string }).action || undefined,
  );
  const messageId = notif.data?.messageId;
  notif.close();
  event.waitUntil(
    (async () => {
      await track(messageId, "opened");
      const origin = self.location.origin;
      const target = new URL(url, origin).href;
      // WhatsApp (another site) always opens on its own.
      if (!target.startsWith(origin)) {
        await self.clients.openWindow(target);
        return;
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        const c = client as WindowClient;
        if (c.url.startsWith(origin)) {
          await c.focus();
          await c.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  const notif = event.notification as Notification & { data?: { messageId?: string } };
  event.waitUntil(track(notif.data?.messageId, "dismissed"));
});
