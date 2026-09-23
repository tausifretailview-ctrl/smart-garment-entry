// Firebase Cloud Messaging for the customer app. Everything is lazy:
// nothing Firebase-related loads or runs until the user taps the opt-in
// button (or a return visit finds permission already granted).
// NEVER call Notification.requestPermission() outside a click handler.

import { registerPush } from "./client";

function firebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  };
}

export function isPushSupportedBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

export function isIosStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function platformName(): string {
  const ua = window.navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web";
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
}

async function currentToken(): Promise<string | null> {
  try {
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return null;
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
    const messaging = getMessaging(app);
    const reg = await getRegistration();
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) return null;
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
  } catch {
    return null;
  }
}

// Click handler for the "Turn on notifications" button. Requests permission
// (the ONLY place that may do so), fetches the token, registers it.
export async function enablePush(
  subdomain: string,
  pageToken: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupportedBrowser()) return { ok: false, reason: "unsupported" };
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: "denied" };
  }
  if (permission !== "granted") return { ok: false, reason: permission };
  const fcmToken = await currentToken();
  if (!fcmToken) return { ok: false, reason: "no_token" };
  try {
    const res = await registerPush(subdomain, pageToken, fcmToken, platformName());
    if (!res.ok) return { ok: false, reason: res.error ?? "register_failed" };
    try {
      localStorage.setItem("ezzy_push_opt", "1");
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "register_failed" };
  }
}

// Return visits: permission already granted -> silently re-fetch + re-register
// so rotated tokens self-heal. Never prompts.
export async function repairPushRegistration(subdomain: string, pageToken: string): Promise<void> {
  try {
    if (!isPushSupportedBrowser()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const fcmToken = await currentToken();
    if (!fcmToken) return;
    await registerPush(subdomain, pageToken, fcmToken, platformName()).catch(() => undefined);
  } catch {
    /* silent */
  }
}

export function wasPushOptedIn(): boolean {
  try {
    return localStorage.getItem("ezzy_push_opt") === "1";
  } catch {
    return false;
  }
}

export function markPushOptOut(): void {
  try {
    localStorage.setItem("ezzy_push_opt", "0");
  } catch {
    /* ignore */
  }
}
