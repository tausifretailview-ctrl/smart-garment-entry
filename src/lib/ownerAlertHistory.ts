import { ownerAlertTapPath } from "@/lib/ownerAlertTap";

/**
 * Owner alert history (Notifications page): every alert the owner-alerts function
 * sent is a row in owner_push_log. Newer function bundles also save the title, body
 * and tap data; rows from before that (or before the history SQL) only have kind +
 * ref, so their text and tap screen are rebuilt here from the ref.
 */

export type OwnerAlertKind = "invoice" | "cashier" | "day_end" | "low_stock" | "review" | "test";

export type OwnerAlertFilter = "all" | "unread" | "bills" | "reports" | "stock" | "reviews";

export interface OwnerPushLogRow {
  id: string;
  kind: string;
  ref: string;
  created_at: string;
  sent_count?: number | null;
  failed_count?: number | null;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

export interface OwnerAlertSaleInfo {
  sale_number?: string | null;
  net_amount?: number | null;
  customer_name?: string | null;
}

export interface OwnerAlertItem {
  id: string;
  kind: OwnerAlertKind | string;
  title: string;
  body: string;
  createdAt: string;
  /** Screen a tap opens (org-relative), same as tapping the phone notification. */
  path: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IST_OFFSET_MS = 330 * 60_000;

function istDate(iso: string): string {
  const t = Date.parse(iso);
  return new Date((Number.isFinite(t) ? t : Date.now()) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Old low-stock rows with nothing sent had no low products (no message was made). */
export function isShownOwnerAlert(row: OwnerPushLogRow): boolean {
  if (row.title?.trim()) return true;
  const delivered = (Number(row.sent_count) || 0) + (Number(row.failed_count) || 0) > 0;
  return row.kind !== "low_stock" || delivered;
}

/** Tap screen when the row has no saved data (same routes the function sends). */
function fallbackPath(row: OwnerPushLogRow): string | null {
  switch (row.kind) {
    case "invoice":
      return UUID.test(row.ref) ? `/owner-alert/bill/${row.ref}` : null;
    case "cashier":
    case "day_end":
      return `/owner-alert/report?date=${/^\d{4}-\d{2}-\d{2}/.test(row.ref) ? row.ref.slice(0, 10) : istDate(row.created_at)}`;
    case "test":
      return `/owner-alert/report?date=${istDate(row.created_at)}`;
    case "low_stock":
      return "/stock-report?status=low";
    case "review":
      return "/customer-reviews";
    default:
      return null;
  }
}

function fallbackText(row: OwnerPushLogRow, sale?: OwnerAlertSaleInfo): { title: string; body: string } {
  const time = row.ref.split("@")[1] ?? "";
  switch (row.kind) {
    case "invoice": {
      if (!sale?.sale_number) return { title: "New bill", body: "Tap to open the bill" };
      const who = sale.customer_name?.trim() || "Walk-in";
      return { title: `New bill ${sale.sale_number}`, body: `${inr(Number(sale.net_amount))} · ${who}` };
    }
    case "cashier":
      return { title: time ? `Business report ${time}` : "Business report", body: "Tap to see the day's sales report" };
    case "day_end":
      return {
        title: `Day-end summary ${istDate(row.created_at).split("-").reverse().join("-")}`,
        body: "Tap to see the day's sales report",
      };
    case "low_stock":
      return { title: "Products low on stock", body: "Tap to see the low stock list" };
    case "review":
      return { title: "New customer review", body: "Tap to see customer reviews" };
    case "test":
      return { title: "EzzyERP owner alerts are on", body: "Test alert" };
    default:
      return { title: "Shop alert", body: "" };
  }
}

export function ownerAlertItem(row: OwnerPushLogRow, sale?: OwnerAlertSaleInfo): OwnerAlertItem {
  const saved = row.title?.trim();
  const text = saved ? { title: saved, body: String(row.body ?? "") } : fallbackText(row, sale);
  const path = (row.data ? ownerAlertTapPath(row.data) : null) ?? fallbackPath(row);
  return { id: row.id, kind: row.kind, title: text.title, body: text.body, createdAt: row.created_at, path };
}

/** Invoice rows without saved text: sale ids to look up for the bill number and amount. */
export function saleIdsToDescribe(rows: OwnerPushLogRow[]): string[] {
  return [...new Set(rows.filter((r) => r.kind === "invoice" && !r.title?.trim() && UUID.test(r.ref)).map((r) => r.ref))];
}

export function matchesOwnerAlertFilter(item: OwnerAlertItem, filter: OwnerAlertFilter, unread: boolean): boolean {
  switch (filter) {
    case "unread":
      return unread;
    case "bills":
      return item.kind === "invoice";
    case "reports":
      return item.kind === "cashier" || item.kind === "day_end" || item.kind === "test";
    case "stock":
      return item.kind === "low_stock";
    case "reviews":
      return item.kind === "review";
    default:
      return true;
  }
}

/** "Today" / "Yesterday" / "Mon, 20 Oct" groups, newest first (input already newest first). */
export function groupOwnerAlertsByDay<T extends { createdAt: string }>(items: T[], now = new Date()): { label: string; items: T[] }[] {
  const today = istDate(now.toISOString());
  const yesterday = istDate(new Date(now.getTime() - 24 * 60 * 60_000).toISOString());
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const day = istDate(item.createdAt);
    const label =
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/* ── Read state: saved on this device always, and in owner_alert_reads once that SQL is run ── */

const READ_KEY = (orgId: string, userId: string) => `ezzy_owner_alert_read:${orgId}:${userId}`;
const MAX_LOCAL_READ = 500;

export function loadLocalReadIds(orgId: string, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY(orgId, userId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveLocalReadIds(orgId: string, userId: string, ids: Iterable<string>): void {
  try {
    const list = [...ids].slice(-MAX_LOCAL_READ);
    localStorage.setItem(READ_KEY(orgId, userId), JSON.stringify(list));
  } catch {
    /* private mode / storage full: read marks only last for this session */
  }
}

/** Short type name shown in the Notifications list. */
export function ownerAlertKindLabel(kind: string): string {
  switch (kind) {
    case "invoice":
      return "Bill";
    case "cashier":
      return "Business report";
    case "day_end":
      return "Day-end";
    case "low_stock":
      return "Low stock";
    case "review":
      return "Review";
    case "test":
      return "Test";
    default:
      return "Alert";
  }
}

/** IST calendar day "YYYY-MM-DD" → UTC ISO bounds for the whole day. */
export function istDayBoundsIso(day: string, edge: "start" | "end"): string {
  return new Date(`${day}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+05:30`).toISOString();
}

/** Today in IST, shifted by whole days. */
export function istDayOffset(days: number, now = new Date()): string {
  return istDate(new Date(now.getTime() + days * 24 * 60 * 60_000).toISOString());
}
