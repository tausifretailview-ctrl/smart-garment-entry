/**
 * Owner alerts on the EzzyERP Android app (Capacitor + FCM).
 * The phone registers once (button in Settings → Owner alerts); the `owner-alerts`
 * edge function then sends cashier reports, low-stock, bill and day-end alerts.
 * Everything here is a no-op on web / Electron.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ownerAlertTapTarget, type OwnerAlertTap } from "@/lib/ownerAlertTap";

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

/**
 * Imported statically on purpose: a Capacitor plugin is a Proxy that answers every property,
 * including `then`, so returning it from an async function (or awaiting it) never resolves.
 * That is what left "Turn on alerts" spinning forever.
 */
const Push = PushNotifications;

/** Ask Android for an FCM token (requires notification permission). */
async function registerForToken(): Promise<string> {
  await withTimeout(
    Push.createChannel({
      id: OWNER_ALERT_CHANNEL_ID,
      name: "Owner alerts",
      description: "Cashier report, low stock, bills and day-end summary",
      importance: 4,
      visibility: 1,
    }),
    10_000,
    "channel timeout",
  ).catch(() => undefined);

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
    // A native failure here (e.g. Firebase not set up in the APK) rejects instead of firing registrationError.
    void Push.register().catch((e: unknown) =>
      finish(() => reject(new Error(`Android could not register for notifications: ${e instanceof Error ? e.message : String(e)}`))),
    );
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

export type OwnerPushStep = "permission" | "token" | "saving";

export const OWNER_PUSH_BLOCKED_TEXT =
  "Notifications are blocked for EzzyERP. Open Android Settings → Apps → EzzyERP → Notifications, turn them on, then tap the button again.";

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Button in Settings / first-run prompt: ask permission (from the tap), register, save this phone. */
export async function enableOwnerAlertsOnThisPhone(
  organizationId: string,
  userId: string,
  onStep?: (step: OwnerPushStep) => void,
): Promise<void> {
  if (!isOwnerPushSupported()) throw new Error("Open EzzyERP in the Android app to turn on phone alerts.");
  onStep?.("permission");
  let perm = await withTimeout(
    Push.checkPermissions(),
    10_000,
    "The phone did not answer the notification check (step 1). Close and reopen the app, then try again.",
  );
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    // A dismissed Android dialog can leave this pending; never keep the button stuck.
    perm = await withTimeout(Push.requestPermissions(), 60_000, "No answer to the notification permission. Tap the button again and choose Allow.");
  }
  if (perm.receive !== "granted") throw new Error(OWNER_PUSH_BLOCKED_TEXT);
  onStep?.("token");
  const token = await registerForToken();
  onStep?.("saving");
  try {
    await withTimeout(saveDevice(organizationId, userId, token), 20_000, "no answer from the server in 20 seconds");
  } catch (e) {
    throw new Error(`The phone was not saved on the server: ${ownerAlertErrorText(e)}`);
  }
  storeToken(token);
  dismissOwnerAlertsPrompt();
}

// ---- One-time "turn on alerts?" prompt in the Android app ----

const PROMPT_KEY = "ezzy_owner_push_prompted";

export function shouldOfferOwnerAlertsPrompt(): boolean {
  if (!isOwnerPushSupported() || storedToken()) return false;
  try {
    return !localStorage.getItem(PROMPT_KEY);
  } catch {
    return false;
  }
}

export function dismissOwnerAlertsPrompt() {
  try {
    localStorage.setItem(PROMPT_KEY, new Date().toISOString());
  } catch {
    /* storage blocked: the prompt may show again, which is harmless */
  }
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
    const perm = await Push.checkPermissions();
    if (perm.receive !== "granted") return;
    const token = await registerForToken();
    await saveDevice(organizationId, userId, token);
    storeToken(token);
  } catch {
    /* next app start retries */
  }
}

/** Tapping an alert opens its screen or bill (see ownerAlertTapTarget). */
export async function listenForOwnerAlertTaps(onTap: (target: OwnerAlertTap) => void): Promise<() => void> {
  if (!isOwnerPushSupported()) return () => undefined;
  const handle = await Push.addListener("pushNotificationActionPerformed", (action) => {
    const target = ownerAlertTapTarget(action.notification?.data);
    if (target) onTap(target);
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

/**
 * Plain words for a failed owner-alerts call. "Failed to send a request to the Edge Function"
 * (FunctionsFetchError) means the owner-alerts function is not deployed / not reachable.
 */
/** Supabase/PostgREST errors are plain objects, so String(e) gives "[object Object]". */
function rawErrorText(e: unknown): { msg: string; code: string } {
  if (e instanceof Error) return { msg: e.message, code: String((e as { code?: unknown }).code ?? "") };
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const msg = [o.message, o.details, o.hint].filter((x) => typeof x === "string" && x).join(" · ");
    return { msg: msg || JSON.stringify(e), code: String(o.code ?? "") };
  }
  return { msg: String(e ?? ""), code: "" };
}

export function ownerAlertErrorText(e: unknown): string {
  const name = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
  const { msg, code } = rawErrorText(e);
  if (code === "42P01" || code === "PGRST205" || /relation .*owner_.* does not exist|could not find the table/i.test(msg)) {
    return `Owner alerts are not set up in the database yet (owner alerts SQL not run). Details: ${msg}`;
  }
  if (code === "42501" || /row-level security/i.test(msg)) {
    return `Only an admin of this shop can change owner alerts. Details: ${msg}`;
  }
  if (name === "FunctionsFetchError" || /failed to send a request to the edge function/i.test(msg)) {
    return "The owner alerts service is not set up on the server yet (owner-alerts function not deployed). Ask your EzzyERP admin to deploy it, then try again.";
  }
  if (/push provider not configured|firebase|FIREBASE_SERVICE_ACCOUNT/i.test(msg)) {
    return "Firebase is not set up on the server yet (FIREBASE_SERVICE_ACCOUNT_JSON secret). Ask your EzzyERP admin.";
  }
  return msg || "Unknown error";
}

export async function sendOwnerTestAlert(organizationId: string): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke("owner-alerts", { body: { type: "test", organizationId } });
  if (error) {
    // FunctionsHttpError keeps the Response in .context; surface the function's own reason.
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = (await ctx.clone().json().catch(() => null)) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  const r = (data ?? {}) as { sent?: number; failed?: number; error?: string };
  if (r.error) throw new Error(r.error);
  return { sent: Number(r.sent) || 0, failed: Number(r.failed) || 0 };
}
