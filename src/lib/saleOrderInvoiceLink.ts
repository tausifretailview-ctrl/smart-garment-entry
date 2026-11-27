import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sale Bill → "Sale Order No.": a bill made by hand for a booked order (some items not
 * available, so the order was not converted). Saving the bill marks the order Invoiced, with
 * the bill's number, so the Sale Order dashboard and the Field Sales app show it.
 *
 * The bill's number / id / time live on the order (SQL 56 adds the columns). Until that SQL
 * runs, only the status is set.
 */

export const SALE_ORDER_INVOICED_STATUS = "invoiced";

/** Orders a bill can be linked to: still open for that customer. */
export const LINKABLE_SALE_ORDER_STATUSES = ["pending", "partial"];

export type LinkableSaleOrder = {
  id: string;
  order_number: string;
  order_date: string | null;
  net_amount: number | null;
  salesman: string | null;
  status: string;
};

type DbError = { code?: string; message?: string } | null;

/** A column the database does not have yet (SQL 56 not run). */
export function isMissingColumnError(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(String(err.message || ""));
}

/** Customer's open orders, newest first, plus the order this bill is already linked to. */
export async function fetchLinkableSaleOrders(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
  alsoOrderId?: string | null,
): Promise<LinkableSaleOrder[]> {
  const cols = "id, order_number, order_date, net_amount, salesman, status";
  const { data, error } = await client
    .from("sale_orders")
    .select(cols)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .in("status", LINKABLE_SALE_ORDER_STATUSES)
    .is("deleted_at", null)
    .order("order_date", { ascending: false })
    .limit(50);
  if (error) throw error;
  const list = (data ?? []) as LinkableSaleOrder[];
  if (alsoOrderId && !list.some((o) => o.id === alsoOrderId)) {
    const { data: one } = await client.from("sale_orders").select(cols).eq("id", alsoOrderId).maybeSingle();
    if (one) list.unshift(one as LinkableSaleOrder);
  }
  return list;
}

/** The order an existing bill was linked to (null when none, or before SQL 56). */
export async function fetchOrderLinkedToSale(client: SupabaseClient, saleId: string): Promise<string | null> {
  const { data, error } = await client
    .from("sale_orders")
    .select("id")
    .eq("invoiced_sale_id", saleId)
    .is("deleted_at", null)
    .limit(1);
  if (error) return null;
  return (data?.[0] as { id?: string } | undefined)?.id ?? null;
}

/** Mark the order Invoiced for this bill. Returns false when it could not be saved. */
export async function markSaleOrderInvoiced(
  client: SupabaseClient,
  orderId: string,
  sale: { id: string; saleNumber: string },
): Promise<boolean> {
  const full = {
    status: SALE_ORDER_INVOICED_STATUS,
    invoiced_sale_id: sale.id,
    invoiced_sale_number: sale.saleNumber,
    invoiced_at: new Date().toISOString(),
  };
  const { error } = await client.from("sale_orders").update(full as never).eq("id", orderId);
  if (!error) return true;
  if (!isMissingColumnError(error as DbError)) return false;
  const { error: e2 } = await client.from("sale_orders").update({ status: SALE_ORDER_INVOICED_STATUS } as never).eq("id", orderId);
  return !e2;
}

/** The bill no longer covers this order (link changed on edit): back to Pending. */
export async function unmarkSaleOrderInvoiced(client: SupabaseClient, orderId: string): Promise<boolean> {
  const { error } = await client
    .from("sale_orders")
    .update({ status: "pending", invoiced_sale_id: null, invoiced_sale_number: null, invoiced_at: null } as never)
    .eq("id", orderId)
    .eq("status", SALE_ORDER_INVOICED_STATUS);
  if (!error) return true;
  if (!isMissingColumnError(error as DbError)) return false;
  const { error: statusOnlyError } = await client
    .from("sale_orders")
    .update({ status: "pending" } as never)
    .eq("id", orderId)
    .eq("status", SALE_ORDER_INVOICED_STATUS);
  return !statusOnlyError;
}

/** Bill numbers for invoiced orders on a page (empty before SQL 56). */
export async function fetchInvoicedSaleNumbers(
  client: SupabaseClient,
  orderIds: string[],
): Promise<Record<string, string>> {
  if (orderIds.length === 0) return {};
  const { data, error } = await client
    .from("sale_orders")
    .select("id, invoiced_sale_number")
    .in("id", orderIds.slice(0, 200));
  if (error) return {};
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ id: string; invoiced_sale_number?: string | null }>) {
    if (r.invoiced_sale_number) out[r.id] = r.invoiced_sale_number;
  }
  return out;
}

/** Short label for the order picker. */
export function linkableSaleOrderLabel(o: LinkableSaleOrder): string {
  const date = o.order_date ? String(o.order_date).slice(0, 10).split("-").reverse().join("/") : "";
  const amount = o.net_amount != null ? `₹${Math.round(Number(o.net_amount)).toLocaleString("en-IN")}` : "";
  return [o.order_number, date, amount, o.salesman || ""].filter(Boolean).join(" · ");
}

/** One line of the linked order, as the Sale Bill's ORDER QTY column needs it. */
export type SaleOrderLineQty = {
  variant_id: string | null;
  product_id: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  order_qty: number | null;
  fulfilled_qty: number | null;
  pending_qty: number | null;
};

/** The linked order's lines (quantities only). Empty on any error: the column then shows "—". */
export async function fetchSaleOrderLineQtys(client: SupabaseClient, orderId: string): Promise<SaleOrderLineQty[]> {
  if (!orderId) return [];
  const { data, error } = await client
    .from("sale_order_items")
    .select("variant_id, product_id, barcode, size, color, order_qty, fulfilled_qty, pending_qty")
    .eq("order_id", orderId)
    .is("deleted_at", null)
    .limit(1000);
  if (error) return [];
  return (data ?? []) as SaleOrderLineQty[];
}

/** What a bill line is matched on: the item id, else the barcode, else product + size + colour. */
export type SaleOrderMatchLine = {
  variantId?: string | null;
  barcode?: string | null;
  productId?: string | null;
  size?: string | null;
  color?: string | null;
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Every key a line can be matched by, most exact first. */
function matchKeys(line: SaleOrderMatchLine): string[] {
  const keys: string[] = [];
  if (line.variantId) keys.push(`v:${line.variantId}`);
  if (norm(line.barcode)) keys.push(`b:${norm(line.barcode)}`);
  if (line.productId) keys.push(`p:${line.productId}|${norm(line.size)}|${norm(line.color)}`);
  return keys;
}

export type SaleOrderQtyNeed = {
  /** The key both the order line and the bill lines resolve to (for adding up billed qty). */
  key: string;
  /** Still to deliver: the pending quantity once part was delivered, else the ordered quantity. */
  required: number;
  ordered: number;
  delivered: number;
};

/**
 * Lookup from bill line to the linked order's quantity for that item. Order lines with the
 * same item are added up. Returns null for a bill line the order does not have.
 */
export function buildSaleOrderQtyLookup(
  rows: readonly SaleOrderLineQty[],
): (line: SaleOrderMatchLine) => SaleOrderQtyNeed | null {
  const needs = new Map<string, SaleOrderQtyNeed>();
  const alias = new Map<string, string>();
  for (const r of rows) {
    const keys = matchKeys({ variantId: r.variant_id, barcode: r.barcode, productId: r.product_id, size: r.size, color: r.color });
    if (keys.length === 0) continue;
    // One order item is stored under its most exact key; its other keys point to it.
    const main = keys.find((k) => alias.has(k)) ? alias.get(keys.find((k) => alias.has(k))!)! : keys[0];
    const ordered = Number(r.order_qty) || 0;
    const delivered = Number(r.fulfilled_qty) || 0;
    const pending = Math.max(0, Number(r.pending_qty ?? ordered - delivered) || 0);
    const required = delivered > 0 ? pending : ordered;
    const prev = needs.get(main);
    needs.set(main, {
      key: main,
      required: (prev?.required ?? 0) + required,
      ordered: (prev?.ordered ?? 0) + ordered,
      delivered: (prev?.delivered ?? 0) + delivered,
    });
    for (const k of keys) if (!alias.has(k)) alias.set(k, main);
  }
  return (line) => {
    for (const k of matchKeys(line)) {
      const main = alias.get(k);
      if (main) return needs.get(main) ?? null;
    }
    return null;
  };
}

/** Short note under the ORDER QTY number: how the bill's total for that item compares. */
export function saleOrderQtyHint(required: number, billed: number): { text: string; tone: "short" | "extra" | "match" } {
  const diff = Math.round((billed - required) * 1000) / 1000;
  if (diff < 0) return { text: `${-diff} short`, tone: "short" };
  if (diff > 0) return { text: `${diff} extra`, tone: "extra" };
  return { text: "matches", tone: "match" };
}
