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
