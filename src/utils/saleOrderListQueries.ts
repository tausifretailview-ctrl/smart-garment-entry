import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export const SALE_ORDER_LIST_PAGE_SIZE = 50;

const SALE_ORDER_LIST_COLUMNS = [
  "id",
  "order_number",
  "order_date",
  "expected_delivery_date",
  "customer_id",
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
  "net_amount",
  "status",
  "customer_accepted",
  "tax_type",
  "invoice_format",
  "gross_amount",
  "discount_amount",
  "gst_amount",
  "round_off",
  "notes",
  "terms_conditions",
  "shipping_address",
  "salesman",
  "quotation_id",
  "created_at",
  "organization_id",
].join(", ");

/** Qty fields only — enough for list subtext (fulfilled/total items). */
const SALE_ORDER_ITEM_QTY_EMBED = "order_qty, fulfilled_qty, pending_qty";

export const SALE_ORDER_LIST_SELECT = `${SALE_ORDER_LIST_COLUMNS}, sale_order_items(${SALE_ORDER_ITEM_QTY_EMBED})`;

export type SaleOrderListFilters = {
  statusFilter: string;
  customerFilter: string;
  fromDate?: Date;
  toDate?: Date;
  searchQuery: string;
};

export type SaleOrderDashboardStats = {
  total: number;
  totalValue: number;
  pending: number;
  partial: number;
  confirmed: number;
  pendingItems: number;
  pendingValue: number;
  conversionRate: string;
};

type FilterableQuery = {
  eq: (column: string, value: unknown) => FilterableQuery;
  or: (filters: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
};

function escapeIlikeTerm(raw: string): string {
  return raw.replace(/[%_,]/g, " ").trim();
}

export function applySaleOrderListFilters<Q extends FilterableQuery>(
  query: Q,
  filters: SaleOrderListFilters,
): Q {
  let q = query;

  if (filters.statusFilter !== "all") {
    q = q.eq("status", filters.statusFilter) as Q;
  }

  if (filters.customerFilter !== "all") {
    q = q.or(
      `customer_id.eq.${filters.customerFilter},customer_name.eq.${filters.customerFilter}`,
    ) as Q;
  }

  if (filters.fromDate) {
    q = q.gte("order_date", format(filters.fromDate, "yyyy-MM-dd")) as Q;
  }

  if (filters.toDate) {
    const end = format(filters.toDate, "yyyy-MM-dd");
    q = q.lte("order_date", `${end}T23:59:59.999Z`) as Q;
  }

  const term = escapeIlikeTerm(filters.searchQuery);
  if (term) {
    const pattern = `%${term}%`;
    q = q.or(
      `order_number.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern}`,
    ) as Q;
  }

  return q;
}

export function sumSaleOrderItemQtys(
  items: Array<{ order_qty?: number | null; fulfilled_qty?: number | null; pending_qty?: number | null }> | null | undefined,
) {
  const rows = items ?? [];
  return {
    totalItems: rows.reduce((sum, row) => sum + Number(row.order_qty || 0), 0),
    fulfilledItems: rows.reduce((sum, row) => sum + Number(row.fulfilled_qty || 0), 0),
    pendingItems: rows.reduce((sum, row) => sum + Number(row.pending_qty || 0), 0),
  };
}

export async function fetchSaleOrderListPage(
  organizationId: string,
  filters: SaleOrderListFilters,
  page: number,
  pageSize: number,
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("sale_orders")
    .select(SALE_ORDER_LIST_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  query = applySaleOrderListFilters(query, filters);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    rows: data ?? [],
    totalCount: count ?? 0,
  };
}

export async function fetchSaleOrderDashboardStats(
  organizationId: string,
): Promise<SaleOrderDashboardStats> {
  const orders: Array<{ id: string; status: string; net_amount: number | null }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("sale_orders")
      .select("id, status, net_amount")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = data ?? [];
    if (page.length === 0) break;
    orders.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const orderIds = orders.map((row) => row.id);
  let pendingItems = 0;

  for (let i = 0; i < orderIds.length; i += 500) {
    const chunk = orderIds.slice(i, i + 500);
    if (chunk.length === 0) continue;

    const { data, error } = await supabase
      .from("sale_order_items")
      .select("pending_qty")
      .in("order_id", chunk);

    if (error) throw error;
    pendingItems += (data ?? []).reduce((sum, row) => sum + Number(row.pending_qty || 0), 0);
  }

  const total = orders.length;
  const pending = orders.filter((row) => row.status === "pending").length;
  const partial = orders.filter((row) => row.status === "partial").length;
  const confirmed = orders.filter((row) => row.status === "confirmed").length;
  const totalValue = orders.reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
  const pendingValue = orders
    .filter((row) => row.status === "pending" || row.status === "partial")
    .reduce((sum, row) => sum + Number(row.net_amount || 0), 0);

  return {
    total,
    totalValue,
    pending,
    partial,
    confirmed,
    pendingItems,
    pendingValue,
    conversionRate: total > 0 ? ((confirmed / total) * 100).toFixed(1) : "0",
  };
}

export async function fetchSaleOrderCustomerOptions(organizationId: string) {
  const rows: Array<{ customer_id: string | null; customer_name: string }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("sale_orders")
      .select("customer_id, customer_name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("customer_name")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(
    new Map(
      rows.map((row) => [
        row.customer_id || row.customer_name,
        { id: row.customer_id, name: row.customer_name },
      ]),
    ).values(),
  ).filter((customer) => customer.name);
}

/** Full order + line items — for edit, print, WhatsApp, convert (not list bootstrap). */
export async function fetchSaleOrderWithItems(orderId: string) {
  const { data, error } = await supabase
    .from("sale_orders")
    .select("*, sale_order_items(*)")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Line items only — for expanded list row. */
export async function fetchSaleOrderLineItems(orderId: string) {
  const { data, error } = await supabase
    .from("sale_order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
