/**
 * Owner alerts on the EzzyERP Android app (Capacitor + FCM).
 * The phone registers once (button in Settings → Owner alerts); the `owner-alerts`
 * edge function then sends cashier reports, low-stock, bill and day-end alerts.
 * Everything here is a no-op on web / Electron.
 */
import { Capacitor } from "@capacitor/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * owner_* tables come from migration 20261231170000, applied by hand. Lovable regenerates
 * types.ts from the live database and drops tables it doesn't have yet, so these reads go
 * through an untyped client instead of depending on the generated file.
 */
export const ownerAlertsDb = supabase as unknown as SupabaseClient;

export const OWNER_ALERT_CHANNEL_ID = "owner_alerts";
const TOKEN_KEY = "ezzy_owner_push_token";
const REGISTER_TIMEOUT_MS = 20_000;

export function isOwnerPushSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the server row still exists */
  }
}

async function plugin() {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
}

/** Ask Android for an FCM token (requires notification permission). */
async function registerForToken(): Promise<string> {
  const Push = await plugin();
  await Push.createChannel({
    id: OWNER_ALERT_CHANNEL_ID,
    name: "Owner alerts",
    description: "Cashier report, low stock, bills and day-end summary",
    importance: 4,
    visibility: 1,
  }).catch(() => undefined);

  return new Promise<string>((resolve, reject) => {
    let done = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      handles.forEach((h) => void h.remove());
      fn();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("The phone did not return a notification token. Check internet and try again."))),
      REGISTER_TIMEOUT_MS,
    );
    void Push.addListener("registration", (t) => finish(() => resolve(t.value))).then((h) => handles.push(h));
    void Push.addListener("registrationError", (e) =>
      finish(() => reject(new Error(e?.error || "Notification registration failed"))),
    ).then((h) => handles.push(h));
    void Push.register();
  });
}

async function saveDevice(organizationId: string, userId: string, token: string) {
  const { error } = await ownerAlertsDb.from("owner_push_devices").upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      fcm_token: token,
      platform: "android",
      status: "active",
      inactive_reason: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,fcm_token" },
  );
  if (error) throw error;
}

/** Button in Settings: ask permission (from the click), register, save this phone. */
export async function enableOwnerAlertsOnThisPhone(organizationId: string, userId: string): Promise<void> {
  if (!isOwnerPushSupported()) throw new Error("Open EzzyERP in the Android app to turn on phone alerts.");
  const Push = await plugin();
  let perm = await Push.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await Push.requestPermissions();
  }
  if (perm.receive !== "granted") {
    throw new Error("Notifications are blocked for EzzyERP. Allow them in Android Settings → Apps → EzzyERP → Notifications.");
  }
  const token = await registerForToken();
  await saveDevice(organizationId, userId, token);
  storeToken(token);
}

export async function disableOwnerAlertsOnThisPhone(organizationId: string): Promise<void> {
  const token = storedToken();
  if (token) {
    await ownerAlertsDb
      .from("owner_push_devices")
      .delete()
      .eq("organization_id", organizationId)
      .eq("fcm_token", token);
  }
  storeToken(null);
}

export function thisPhoneHasOwnerAlerts(): boolean {
  return !!storedToken();
}

/**
 * App start: if this phone already turned alerts on, refresh its token silently
 * (FCM rotates tokens). Never asks for permission here.
 */
export async function refreshOwnerAlertsToken(organizationId: string, userId: string): Promise<void> {
  if (!isOwnerPushSupported() || !storedToken()) return;
  try {
    const Push = await plugin();
    const perm = await Push.checkPermissions();
    if (perm.receive !== "granted") return;
    const token = await registerForToken();
    await saveDevice(organizationId, userId, token);
    storeToken(token);
  } catch {
    /* next app start retries */
  }
}

/** Tapping an alert opens its screen (data.route set by owner-alerts). */
export async function listenForOwnerAlertTaps(navigate: (path: string) => void): Promise<() => void> {
  if (!isOwnerPushSupported()) return () => undefined;
  const Push = await plugin();
  const handle = await Push.addListener("pushNotificationActionPerformed", (action) => {
    const route = (action.notification?.data as { route?: string } | undefined)?.route;
    if (route && route.startsWith("/")) navigate(route);
  });
  return () => void handle.remove();
}

// ---- Invoice alerts (called after a bill is saved; never blocks the save) ----

const INVOICE_SETTINGS_TTL_MS = 10 * 60 * 1000;
const invoiceSettingsCache = new Map<string, { at: number; on: boolean }>();

async function invoiceAlertsOn(organizationId: string): Promise<boolean> {
  const hit = invoiceSettingsCache.get(organizationId);
  if (hit && Date.now() - hit.at < INVOICE_SETTINGS_TTL_MS) return hit.on;
  let on = false;
  try {
    const { data, error } = await ownerAlertsDb
      .from("owner_alert_settings")
      .select("enabled, invoice_mode")
      .eq("organization_id", organizationId)
      .maybeSingle();
    on = !error && !!data?.enabled && !!data.invoice_mode && data.invoice_mode !== "off";
  } catch {
    on = false;
  }
  invoiceSettingsCache.set(organizationId, { at: Date.now(), on });
  return on;
}

/** Settings saved: forget the cached on/off so the next bill uses it. */
export function clearOwnerInvoiceAlertCache(organizationId?: string) {
  if (organizationId) invoiceSettingsCache.delete(organizationId);
  else invoiceSettingsCache.clear();
}

/** Fire-and-forget: the edge function applies the amount threshold and dedupes per bill. */
export function notifyOwnersOfNewBill(organizationId: string, saleId: string): void {
  void (async () => {
    try {
      if (!(await invoiceAlertsOn(organizationId))) return;
      await supabase.functions.invoke("owner-alerts", { body: { type: "invoice", organizationId, saleId } });
    } catch {
      /* an alert must never affect billing */
    }
  })();
}

export async function sendOwnerTestAlert(organizationId: string): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke("owner-alerts", { body: { type: "test", organizationId } });
  if (error) throw error;
  const r = (data ?? {}) as { sent?: number; failed?: number; error?: string };
  if (r.error) throw new Error(r.error);
  return { sent: Number(r.sent) || 0, failed: Number(r.failed) || 0 };
}
