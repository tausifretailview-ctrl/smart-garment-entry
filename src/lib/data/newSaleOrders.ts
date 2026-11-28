/**
 * New sale orders badge (Nov 2026): like missed calls on a phone, the Sale Order Dashboard menu
 * shows how many orders came in since this user last opened the dashboard on this browser.
 * Orders the user booked themselves are not counted. Opening the dashboard clears it (all tabs).
 */
const KEY = (orgId: string, userId: string) => `saleOrdersSeenAt:${orgId}:${userId}`;
export const SALE_ORDERS_SEEN_EVENT = "ezzy:sale-orders-seen";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window / blocked storage: the badge just counts from this visit */
  }
}

/** When the user last opened the dashboard. First time on this browser: from now (no flood of old orders). */
export function readSaleOrdersSeenAt(orgId: string, userId: string, now = new Date()): string {
  const saved = safeGet(KEY(orgId, userId));
  if (saved && !Number.isNaN(Date.parse(saved))) return saved;
  const iso = now.toISOString();
  safeSet(KEY(orgId, userId), iso);
  return iso;
}

/** Opening the dashboard: clear the badge here and in the other tabs (storage event). */
export function markSaleOrdersSeen(orgId: string, userId: string, now = new Date()): string {
  const iso = now.toISOString();
  safeSet(KEY(orgId, userId), iso);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SALE_ORDERS_SEEN_EVENT, { detail: { orgId, userId, iso } }));
  return iso;
}

export function isSaleOrdersSeenKey(key: string | null, orgId: string, userId: string): boolean {
  return key === KEY(orgId, userId);
}

type CountQuery = {
  eq: (c: string, v: string) => CountQuery;
  is: (c: string, v: null) => CountQuery;
  gt: (c: string, v: string) => CountQuery;
  or: (f: string) => PromiseLike<{ count: number | null; error: { message?: string } | null }>;
};
export type NewSaleOrdersDb = {
  from: (table: string) => { select: (cols: string, opts: { count: "exact"; head: true }) => CountQuery };
};

/** Orders created after `sinceIso` by someone else (or by the Field Sales app / website). */
export async function countNewSaleOrders(db: NewSaleOrdersDb, orgId: string, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from("sale_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gt("created_at", sinceIso)
    .or(`created_by.is.null,created_by.neq.${userId}`);
  if (error) throw new Error(error.message || "count failed");
  return count ?? 0;
}

export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
