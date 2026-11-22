/**
 * One request id per new bill, reused when the same bill is saved again (review item B6).
 *
 * The bill save is one request. If it commits but the reply is lost, the screen shows an error
 * with the cart still full; saving again used to create a second bill. With the id, the second
 * save hits the unique rule on sales (organization_id, client_request_id) and the app opens the
 * bill already saved (migration 20270514120000).
 *
 * "The same bill" = same customer, amounts, payment and lines, saved again within a few
 * minutes without a successful save in between. After a successful save the next bill always
 * gets a new id, so two identical bills rung one after the other stay two bills. When the rule
 * does fire, the cashier is asked whether it is the same bill (confirmSameSavedBill), because
 * an identical new sale can follow a bill whose reply was lost.
 */
export const SALE_REQUEST_ID_KEY = "client_request_id";
/** How long a failed attempt keeps its id. */
export const SALE_REQUEST_TTL_MS = 10 * 60 * 1000;

const HEADER_KEYS = [
  "sale_type",
  "customer_id",
  "customer_name",
  "customer_phone",
  "gross_amount",
  "discount_amount",
  "flat_discount_amount",
  "round_off",
  "net_amount",
  "payment_method",
  "cash_amount",
  "card_amount",
  "upi_amount",
  "sale_return_adjust",
  "salesman",
] as const;
const LINE_KEYS = ["variant_id", "product_name", "size", "quantity", "unit_price", "discount_percent", "line_total"] as const;

const norm = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  return String(v);
};

/** What makes two save attempts "the same bill". Times and generated numbers are left out. */
export function saleRequestFingerprint(sale: Record<string, unknown>, items: Record<string, unknown>[]): string {
  const header = HEADER_KEYS.map((k) => norm(sale[k])).join("|");
  const lines = items.map((item) => LINE_KEYS.map((k) => norm(item[k])).join("|")).join("\n");
  return `${header}\n${lines}`;
}

const newId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export type SaleRequestTracker = {
  /** The id to send for this bill: the pending one when the bill is the same, else a new one. */
  idFor: (fingerprint: string) => string;
  /** A new id for this bill even when one is pending (the cashier said it is a different sale). */
  fresh: (fingerprint: string) => string;
  /** The bill is saved and every follow-up step is done: the next bill gets a new id. */
  saved: () => void;
};

export function createSaleRequestTracker(now: () => number = Date.now, ttlMs: number = SALE_REQUEST_TTL_MS): SaleRequestTracker {
  let pending: { id: string; fingerprint: string; at: number } | null = null;
  return {
    idFor(fingerprint) {
      if (pending && pending.fingerprint === fingerprint && now() - pending.at < ttlMs) return pending.id;
      pending = { id: newId(), fingerprint, at: now() };
      return pending.id;
    },
    fresh(fingerprint) {
      pending = { id: newId(), fingerprint, at: now() };
      return pending.id;
    },
    saved() {
      pending = null;
    },
  };
}

/** Asks the cashier whether the bill already saved under this request id is the one on screen. */
export function sameSavedBillQuestion(existing: Record<string, unknown>): string {
  const number = String(existing.sale_number ?? "").trim() || "A bill";
  const amount = Math.round(Number(existing.net_amount) || 0).toLocaleString("en-IN");
  const savedAt = existing.created_at ? new Date(String(existing.created_at)) : null;
  const time =
    savedAt && !Number.isNaN(savedAt.getTime())
      ? ` at ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      : "";
  return [
    `${number} for ₹${amount} with these same items was saved from this screen${time}, but its confirmation did not reach this computer.`,
    "",
    "OK = it is the same bill. Do not save it again.",
    "Cancel = it is a different sale. Save a new bill.",
  ].join("\n");
}

export function confirmSameSavedBill(existing: Record<string, unknown>): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  return window.confirm(sameSavedBillQuestion(existing));
}
