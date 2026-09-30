// Firebase Cloud Messaging for the customer app. Everything is lazy:
// nothing Firebase-related loads or runs until the user taps the opt-in
// button (or a return visit finds permission already granted).
// NEVER call Notification.requestPermission() outside a click handler.

import { registerPush } from "./client";
import { cleanVapidKey, describeVapidKeyProblem } from "./vapidKey";
import { withTimeout } from "./withTimeout";

// Each setup step can stall without failing (worker never activates, push service
// unreachable, slow network). Give each a limit so the button reports where it stuck.
const STEP_TIMEOUT_MS = {
  isSupported: 8_000,
  swRegister: 15_000,
  swActive: 15_000,
  getToken: 25_000,
  registerRpc: 20_000,
};

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

// True only when every Firebase value the messaging flow needs is present.
// authDomain/storageBucket are intentionally excluded: unused by FCM.
export function isFirebaseConfigured(): boolean {
  const required = [
    import.meta.env.VITE_FIREBASE_API_KEY,
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    import.meta.env.VITE_FIREBASE_APP_ID,
    import.meta.env.VITE_FIREBASE_VAPID_KEY,
  ];
  return required.every((v) => typeof v === "string" && v.trim().length > 0);
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

/** Short, customer-safe code for why a token could not be fetched (shown on screen for support). */
function tokenErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code) return code;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.slice(0, 120) || "token_error";
}

async function fetchToken(): Promise<{ token: string | null; reason?: string }> {
  if (!isFirebaseConfigured()) return { token: null, reason: "not_configured" };
  const vapidKey = cleanVapidKey(import.meta.env.VITE_FIREBASE_VAPID_KEY as string);
  const vapidProblem = describeVapidKeyProblem(vapidKey);
  if (vapidProblem) return { token: null, reason: `vapid_${vapidProblem}` };
  try {
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await withTimeout(isSupported(), STEP_TIMEOUT_MS.isSupported, "is_supported"))) {
      return { token: null, reason: "unsupported" };
    }
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
    const messaging = getMessaging(app);
    const reg = await withTimeout(getRegistration(), STEP_TIMEOUT_MS.swRegister, "sw_register");
    // A worker that fails to install never becomes active; without this the token step waits on it.
    await withTimeout(navigator.serviceWorker.ready, STEP_TIMEOUT_MS.swActive, "sw_active");
    const token = await withTimeout(
      getToken(messaging, { vapidKey, serviceWorkerRegistration: reg }),
      STEP_TIMEOUT_MS.getToken,
      "get_token",
    );
    return token ? { token } : { token: null, reason: "empty_token" };
  } catch (err) {
    return { token: null, reason: tokenErrorCode(err) };
  }
}

async function currentToken(): Promise<string | null> {
  return (await fetchToken()).token;
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
  const { token: fcmToken, reason: tokenReason } = await fetchToken();
  if (!fcmToken) return { ok: false, reason: tokenReason === "unsupported" ? "unsupported" : `token: ${tokenReason ?? "none"}` };
  try {
    const res = await withTimeout(
      registerPush(subdomain, pageToken, fcmToken, platformName()),
      STEP_TIMEOUT_MS.registerRpc,
      "register_rpc",
    );
    if (!res.ok) return { ok: false, reason: `register: ${res.error ?? "failed"}` };
    try {
      localStorage.setItem("ezzy_push_opt", "1");
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `register: ${tokenErrorCode(err)}` };
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
