import { supabase } from "@/integrations/supabase/client";

/**
 * "Reserved" = qty still pending on other open (not yet billed) Sale Orders for
 * the exact same variant (same product + size + colour). Informational only:
 * nothing here blocks booking or changes stock.
 */

export type SaleOrderReservationOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  qty: number;
};

export type SaleOrderReservation = {
  qty: number;
  orders: SaleOrderReservationOrder[];
};

export type SaleOrderReservationRow = {
  variant_id: string | null;
  order_id: string;
  pending_qty: number | null;
  sale_orders: {
    order_number: string | null;
    customer_name: string | null;
    status: string | null;
    deleted_at: string | null;
  } | null;
};

/** Order statuses that no longer hold stock (fully billed or closed). */
const CLOSED_SALE_ORDER_STATUSES = ["confirmed", "cancelled", "completed", "closed"];

const VARIANT_ID_CHUNK = 200;

export function summarizeSaleOrderReservations(
  rows: SaleOrderReservationRow[],
  excludeOrderId?: string | null,
): Map<string, SaleOrderReservation> {
  const byVariant = new Map<string, SaleOrderReservation>();
  for (const row of rows) {
    const qty = Number(row.pending_qty) || 0;
    const order = row.sale_orders;
    if (!row.variant_id || qty <= 0 || !order) continue;
    if (excludeOrderId && row.order_id === excludeOrderId) continue;
    if (order.deleted_at) continue;
    if (CLOSED_SALE_ORDER_STATUSES.includes(String(order.status || "").toLowerCase())) continue;

    const entry = byVariant.get(row.variant_id) || { qty: 0, orders: [] };
    entry.qty += qty;
    const existing = entry.orders.find((o) => o.orderId === row.order_id);
    if (existing) {
      existing.qty += qty;
    } else {
      entry.orders.push({
        orderId: row.order_id,
        orderNumber: order.order_number || "",
        customerName: order.customer_name || "",
        qty,
      });
    }
    byVariant.set(row.variant_id, entry);
  }
  return byVariant;
}

/** Sum reservations of several variant ids (size grid merges duplicate size+colour rows). */
export function combineSaleOrderReservations(
  variantIds: string[],
  byVariant: Map<string, SaleOrderReservation>,
): SaleOrderReservation | null {
  let qty = 0;
  const orders = new Map<string, SaleOrderReservationOrder>();
  for (const id of variantIds) {
    const r = byVariant.get(id);
    if (!r) continue;
    qty += r.qty;
    for (const o of r.orders) {
      const existing = orders.get(o.orderId);
      if (existing) existing.qty += o.qty;
      else orders.set(o.orderId, { ...o });
    }
  }
  return qty > 0 ? { qty, orders: Array.from(orders.values()) } : null;
}

export function formatSaleOrderReservationTooltip(reservation: SaleOrderReservation): string {
  const lines = reservation.orders.map(
    (o) => `${o.orderNumber || "Sale Order"}${o.customerName ? ` · ${o.customerName}` : ""} · ${o.qty} pcs`,
  );
  return `Reserved in open Sale Order(s):\n${lines.join("\n")}`;
}

export async function fetchOpenSaleOrderReservations(
  organizationId: string,
  variantIds: string[],
  excludeOrderId?: string | null,
): Promise<Map<string, SaleOrderReservation>> {
  const ids = Array.from(new Set(variantIds.filter(Boolean)));
  if (!organizationId || ids.length === 0) return new Map();

  const rows: SaleOrderReservationRow[] = [];
  for (let i = 0; i < ids.length; i += VARIANT_ID_CHUNK) {
    const chunk = ids.slice(i, i + VARIANT_ID_CHUNK);
    const { data, error } = await supabase
      .from("sale_order_items")
      .select("variant_id, order_id, pending_qty, sale_orders!inner(order_number, customer_name, status, deleted_at)")
      .in("variant_id", chunk)
      .gt("pending_qty", 0)
      .is("deleted_at", null)
      .eq("sale_orders.organization_id", organizationId)
      .is("sale_orders.deleted_at", null)
      .not("sale_orders.status", "in", `(${CLOSED_SALE_ORDER_STATUSES.join(",")})`);
    if (error) throw error;
    rows.push(...((data || []) as unknown as SaleOrderReservationRow[]));
  }
  return summarizeSaleOrderReservations(rows, excludeOrderId);
}
