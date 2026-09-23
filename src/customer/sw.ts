/// <reference lib="webworker" />
// firebase-messaging-sw.js (built by vite.customer.config.ts from this file).
// Domain-root service worker for the CUSTOMER app only — separate domain from
// the ERP, no PWA plugin, no caching: push delivery + telemetry only.
//
// Telemetry mapping (push_messages.id arrives as FCM data.message_id):
//   background push received -> push_track 'delivered'
//   notificationclick        -> push_track 'opened', then open /m/:id
//   notificationclose        -> push_track 'dismissed'

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

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
  const data = (payload.data ?? {}) as Record<string, string>;
  const messageId = data.message_id;
  const title = payload.notification?.title ?? data.title ?? "New update";
  const bodyText = payload.notification?.body ?? data.body ?? "";
  const url =
    "/m/" +
    encodeURIComponent(messageId ?? "") +
    "?title=" +
    encodeURIComponent(title) +
    "&body=" +
    encodeURIComponent(bodyText);

  // Fire telemetry without awaiting (waitUntil keeps the worker alive).
  const trackPromise = track(messageId, "delivered");
  const showPromise = self.registration.showNotification(title, {
    body: bodyText,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url, messageId },
    tag: messageId ?? "shop-update",
  });
  return Promise.all([trackPromise, showPromise]).then(() => undefined);
});

self.addEventListener("notificationclick", (event) => {
  const notif = event.notification as Notification & {
    data?: { url?: string; messageId?: string };
  };
  const url: string = notif.data?.url ?? "/";
  const messageId = notif.data?.messageId;
  notif.close();
  event.waitUntil(
    (async () => {
      await track(messageId, "opened");
      const origin = self.location.origin;
      const target = new URL(url, origin).href;
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
