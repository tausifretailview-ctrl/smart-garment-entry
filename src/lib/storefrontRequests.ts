/**
 * Store requests (Street theme product page):
 *   reserve  "Reserve & try in store": the shop keeps a piece of that size aside for 24 hours
 *   restock  "Tell me when it's back": the shop messages the customer when a sold-out size returns
 *
 * Both are saved as rows in Website → Enquiries (website_enquiries.kind) by
 * submit_public_storefront_request (20270505120000); the public website never writes into bills.
 * The store shows a button only when the database says it can take that request
 * (get_org_public_info.store_features) and the shop has not switched it off
 * (organizations.settings.storefront_requests).
 */
export const STOREFRONT_REQUESTS_KEY = "storefront_requests";
export const SHOPPER_DETAILS_STORAGE_KEY = "st-shopper-v1";

export type StorefrontRequestKind = "reserve" | "restock";
export type StorefrontRequests = { reserve: boolean; restock: boolean };

export const NO_STOREFRONT_REQUESTS: StorefrontRequests = { reserve: false, restock: false };

const FEATURE_NAME: Record<StorefrontRequestKind, string> = { reserve: "reserve_try", restock: "restock_alert" };

function isOff(orgSettings: unknown, kind: StorefrontRequestKind): boolean {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return false;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_REQUESTS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)[kind] === false;
}

/** The shop's switches as saved (Website → Theme). Each is on unless switched off. */
export function parseStorefrontRequestSwitches(orgSettings: unknown): StorefrontRequests {
  return { reserve: !isOff(orgSettings, "reserve"), restock: !isOff(orgSettings, "restock") };
}

/**
 * What the public store may offer: the database must list the feature (so a store on a database
 * that cannot take the request shows no dead button) and the shop must not have switched it off.
 */
export function parseStorefrontRequests(
  orgInfo: { store_features?: unknown; settings?: unknown } | null | undefined,
): StorefrontRequests {
  const features = Array.isArray(orgInfo?.store_features) ? orgInfo.store_features : [];
  const switches = parseStorefrontRequestSwitches(orgInfo?.settings);
  return {
    reserve: features.includes(FEATURE_NAME.reserve) && switches.reserve,
    restock: features.includes(FEATURE_NAME.restock) && switches.restock,
  };
}

/** "today, 6:30 pm", "tomorrow, 6:30 pm" or "20 Nov, 6:30 pm". */
export function holdUntilLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(until) - day(now)) / 86_400_000);
  const time = until.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `tomorrow, ${time}`;
  return `${until.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/* ---------- shop side (Website → Enquiries) ---------- */

export type EnquiryKind = "enquiry" | StorefrontRequestKind;

export function enquiryKindOf(row: { kind?: string | null }): EnquiryKind {
  return row.kind === "reserve" || row.kind === "restock" ? row.kind : "enquiry";
}

export type EnquiryKindNote = { tone: "amber" | "slate" | "emerald" | "sky"; text: string } | null;

/**
 * The line shown under the customer on a reserve / restock row. `stock` is the size's current
 * stock for a restock row (undefined while it is loading or unknown).
 */
export function enquiryKindNote(
  row: { kind?: string | null; hold_until?: string | null; status?: string | null },
  stock: number | undefined,
  now: Date = new Date(),
): EnquiryKindNote {
  const kind = enquiryKindOf(row);
  if (kind === "reserve") {
    const until = row.hold_until ? new Date(row.hold_until) : null;
    if (until && !Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) {
      return { tone: "amber", text: `Reserve & try · keep aside till ${holdUntilLabel(row.hold_until, now)}` };
    }
    return { tone: "slate", text: "Reserve & try · time is over" };
  }
  if (kind === "restock") {
    if (row.status !== "new") return { tone: "slate", text: "Asked to be told when back" };
    if (stock !== undefined && stock > 0) return { tone: "emerald", text: "Back in stock now · tell the customer" };
    return { tone: "sky", text: "Waiting for this size to come back" };
  }
  return null;
}

/** WhatsApp text telling a waiting customer their size is back. */
export function restockMessage(input: {
  customerName: string;
  productName: string;
  size?: string | null;
  shopName: string;
  productUrl?: string | null;
}): string {
  const first = String(input.customerName || "").trim().split(/\s+/)[0];
  const size = String(input.size || "").trim();
  return (
    `${first ? `Hi ${first}, ` : "Hi, "}good news from ${input.shopName}! ` +
    `${input.productName}${size ? ` in size ${size}` : ""} is back in stock.` +
    (input.productUrl ? `\n${input.productUrl}` : "")
  );
}
