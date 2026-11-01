import { supabase } from "@/integrations/supabase/client";
import { CLOSED_SALE_ORDER_STATUSES } from "./saleOrderReservations";

/**
 * Industrial mode "Pending by item": every line still to be dispatched on open
 * Sale Orders, rolled up per item with stock in hand and the shortfall.
 * Read-only: nothing here changes orders or stock.
 */

export type PendingItemRow = {
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  size: string | null;
  color: string | null;
  pending_qty: number | null;
  order_id: string;
  sale_orders: {
    order_number: string | null;
    customer_name: string | null;
    expected_delivery_date: string | null;
  } | null;
};

export type PendingItemOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  qty: number;
  dueDate: string | null;
};

export type PendingItemSummary = {
  key: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  size: string;
  color: string;
  pendingQty: number;
  stockQty: number;
  shortQty: number;
  earliestDue: string | null;
  orders: PendingItemOrder[];
};

export type PendingItemsTotals = {
  items: number;
  pendingQty: number;
  shortItems: number;
  shortQty: number;
  orders: number;
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}/;

function itemKey(r: PendingItemRow): string {
  if (r.variant_id) return `v:${r.variant_id}`;
  return `p:${r.product_id ?? ""}|${(r.size ?? "").trim().toUpperCase()}|${(r.color ?? "").trim().toUpperCase()}`;
}

/** Roll pending lines up per item. Short items first, then the earliest due date. */
export function summarizePendingItems(
  rows: PendingItemRow[],
  stockByVariant: Map<string, number>,
): PendingItemSummary[] {
  const byKey = new Map<string, PendingItemSummary>();

  for (const r of rows) {
    const qty = Number(r.pending_qty) || 0;
    if (qty <= 0) continue;
    const key = itemKey(r);
    const due = r.sale_orders?.expected_delivery_date;
    const dueDay = due && ISO_DAY_RE.test(due) ? due.slice(0, 10) : null;

    let s = byKey.get(key);
    if (!s) {
      s = {
        key,
        productId: r.product_id,
        variantId: r.variant_id,
        productName: (r.product_name ?? "").trim() || "Item",
        size: (r.size ?? "").trim(),
        color: (r.color ?? "").trim(),
        pendingQty: 0,
        stockQty: r.variant_id ? Math.max(0, Number(stockByVariant.get(r.variant_id)) || 0) : 0,
        shortQty: 0,
        earliestDue: null,
        orders: [],
      };
      byKey.set(key, s);
    }
    s.pendingQty += qty;
    if (dueDay && (!s.earliestDue || dueDay < s.earliestDue)) s.earliestDue = dueDay;

    const existing = s.orders.find((o) => o.orderId === r.order_id);
    if (existing) {
      existing.qty += qty;
    } else {
      s.orders.push({
        orderId: r.order_id,
        orderNumber: r.sale_orders?.order_number ?? "",
        customerName: r.sale_orders?.customer_name ?? "",
        qty,
        dueDate: dueDay,
      });
    }
  }

  const list = Array.from(byKey.values());
  for (const s of list) {
    s.shortQty = Math.max(0, s.pendingQty - s.stockQty);
    s.orders.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }
  return list.sort(
    (a, b) =>
      Number(b.shortQty > 0) - Number(a.shortQty > 0) ||
      (a.earliestDue ?? "9999").localeCompare(b.earliestDue ?? "9999") ||
      a.productName.localeCompare(b.productName) ||
      a.size.localeCompare(b.size),
  );
}

export function pendingItemsTotals(list: PendingItemSummary[]): PendingItemsTotals {
  const orders = new Set<string>();
  let pendingQty = 0;
  let shortItems = 0;
  let shortQty = 0;
  for (const s of list) {
    pendingQty += s.pendingQty;
    shortQty += s.shortQty;
    if (s.shortQty > 0) shortItems += 1;
    for (const o of s.orders) orders.add(o.orderId);
  }
  return { items: list.length, pendingQty, shortItems, shortQty, orders: orders.size };
}

export function filterPendingItems(list: PendingItemSummary[], search: string, onlyShort: boolean): PendingItemSummary[] {
  const term = search.trim().toLowerCase();
  return list.filter((s) => {
    if (onlyShort && s.shortQty <= 0) return false;
    if (!term) return true;
    return (
      s.productName.toLowerCase().includes(term) ||
      s.size.toLowerCase().includes(term) ||
      s.color.toLowerCase().includes(term) ||
      s.orders.some((o) => o.customerName.toLowerCase().includes(term) || o.orderNumber.toLowerCase().includes(term))
    );
  });
}

const PAGE = 1000;
const MAX_PAGES = 10;
const VARIANT_CHUNK = 200;

/** Open sale order lines with qty still to dispatch, plus stock in hand for those variants. */
export async function fetchPendingSaleOrderItems(organizationId: string): Promise<{
  items: PendingItemSummary[];
  truncated: boolean;
}> {
  const rows: PendingItemRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("sale_order_items")
      .select(
        "product_id, variant_id, product_name, size, color, pending_qty, order_id, sale_orders!inner(order_number, customer_name, expected_delivery_date)",
      )
      .gt("pending_qty", 0)
      .is("deleted_at", null)
      .eq("sale_orders.organization_id", organizationId)
      .is("sale_orders.deleted_at", null)
      .not("sale_orders.status", "in", `(${CLOSED_SALE_ORDER_STATUSES.join(",")})`)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as PendingItemRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  const variantIds = Array.from(new Set(rows.map((r) => r.variant_id).filter((v): v is string => !!v)));
  const stockByVariant = new Map<string, number>();
  for (let i = 0; i < variantIds.length; i += VARIANT_CHUNK) {
    const chunk = variantIds.slice(i, i + VARIANT_CHUNK);
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, stock_qty")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw error;
    for (const v of data ?? []) stockByVariant.set(v.id, Number(v.stock_qty) || 0);
  }

  return { items: summarizePendingItems(rows, stockByVariant), truncated };
}
