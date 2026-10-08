/**
 * Small business-alert popups (low stock, dues, dead stock, today's sales).
 * Pure helpers: per-device on/off switches and the "when was it last shown" log,
 * both in localStorage per org + user.
 */

export type AlertPopupKind =
  | "low_stock"
  | "customer_dues"
  | "supplier_dues"
  | "dead_stock"
  | "today_sold";

export const ALERT_POPUP_KINDS: readonly AlertPopupKind[] = [
  "low_stock",
  "customer_dues",
  "supplier_dues",
  "dead_stock",
  "today_sold",
];

export const ALERT_POPUP_LABELS: Record<AlertPopupKind, string> = {
  low_stock: "Low stock",
  customer_dues: "Customer payments due",
  supplier_dues: "Supplier payments due",
  dead_stock: "Dead stock",
  today_sold: "Today's sold items with stock",
};

/** Today's sales summary repeats at most this often (the others once a day). */
export const TODAY_SOLD_REPEAT_MS = 3 * 60 * 60 * 1000;

/** Supplier bills older than this many days with money still due. */
export const SUPPLIER_DUE_AFTER_DAYS = 30;

export type AlertPopupPrefs = Record<AlertPopupKind, boolean>;
/** Epoch ms of the last time each kind was shown (or checked and found empty). */
export type AlertPopupLog = Partial<Record<AlertPopupKind, number>>;

export const DEFAULT_ALERT_POPUP_PREFS: AlertPopupPrefs = {
  low_stock: true,
  customer_dues: true,
  supplier_dues: true,
  dead_stock: true,
  today_sold: true,
};

const PREFS_EVENT = "ezzy-alert-popup-prefs";

function prefsKey(orgId: string, userId: string): string {
  return `ezzy-alert-popups:prefs:${orgId}:${userId}`;
}

function logKey(orgId: string, userId: string): string {
  return `ezzy-alert-popups:log:${orgId}:${userId}`;
}

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: popups still work for this session */
  }
}

export function loadAlertPopupPrefs(orgId: string, userId: string): AlertPopupPrefs {
  const stored = readJson<AlertPopupPrefs>(prefsKey(orgId, userId)) ?? {};
  const prefs = { ...DEFAULT_ALERT_POPUP_PREFS };
  for (const kind of ALERT_POPUP_KINDS) {
    if (typeof stored[kind] === "boolean") prefs[kind] = stored[kind] as boolean;
  }
  return prefs;
}

export function saveAlertPopupPrefs(orgId: string, userId: string, prefs: AlertPopupPrefs): void {
  writeJson(prefsKey(orgId, userId), prefs);
  try {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  } catch {
    /* non-browser */
  }
}

/** Fires when any switch changes in this window (bell panel ↔ popup host). */
export function onAlertPopupPrefsChange(handler: () => void): () => void {
  window.addEventListener(PREFS_EVENT, handler);
  return () => window.removeEventListener(PREFS_EVENT, handler);
}

export function loadAlertPopupLog(orgId: string, userId: string): AlertPopupLog {
  const stored = readJson<AlertPopupLog>(logKey(orgId, userId)) ?? {};
  const log: AlertPopupLog = {};
  for (const kind of ALERT_POPUP_KINDS) {
    const v = stored[kind];
    if (typeof v === "number" && Number.isFinite(v)) log[kind] = v;
  }
  return log;
}

export function recordAlertPopupShown(
  orgId: string,
  userId: string,
  kind: AlertPopupKind,
  at: number = Date.now(),
): AlertPopupLog {
  const next = { ...loadAlertPopupLog(orgId, userId), [kind]: at };
  writeJson(logKey(orgId, userId), next);
  return next;
}

function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** Once per calendar day; today's sales every few hours. */
export function isAlertPopupDue(kind: AlertPopupKind, log: AlertPopupLog, now: number): boolean {
  const last = log[kind];
  if (last === undefined) return true;
  if (kind === "today_sold") return now - last >= TODAY_SOLD_REPEAT_MS;
  return !sameLocalDay(last, now);
}

export function formatInrShort(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export interface TodaySoldLine {
  variantId: string;
  name: string;
  qty: number;
  stock: number | null;
}

type SoldItemRow = {
  variant_id: string | null;
  product_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
};

/** Sum today's sale lines per variant, biggest sellers first. */
export function aggregateTodaySold(rows: SoldItemRow[], limit: number): TodaySoldLine[] {
  const byVariant = new Map<string, TodaySoldLine>();
  for (const row of rows) {
    if (!row.variant_id) continue;
    const qty = Number(row.quantity || 0);
    if (qty <= 0) continue;
    const existing = byVariant.get(row.variant_id);
    if (existing) {
      existing.qty += qty;
      continue;
    }
    const variantBits = [row.size, row.color]
      .map((v) => (v ?? "").trim())
      .filter((v) => v && v !== "-");
    const base = (row.product_name ?? "").trim() || "Item";
    byVariant.set(row.variant_id, {
      variantId: row.variant_id,
      name: variantBits.length ? `${base} (${variantBits.join(" / ")})` : base,
      qty,
      stock: null,
    });
  }
  return [...byVariant.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}
