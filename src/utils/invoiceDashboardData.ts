import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCnAdjustDateForSale } from "@/utils/customerAuditBundle";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
  type SaleReceiptVoucherSplit,
} from "@/utils/customerBalanceUtils";
import {
  derivePaidAndStatus,
  warnSettlementPathMismatch,
} from "@/utils/saleSettlement";

export const INVOICE_DASHBOARD_SALES_SELECT =
  "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_email, customer_address, gross_amount, discount_amount, flat_discount_amount, flat_discount_percent, other_charges, round_off, net_amount, paid_amount, payment_method, payment_status, delivery_status, salesman, notes, total_qty, created_at, updated_at, irn, ack_no, einvoice_status, einvoice_error, einvoice_qr_code, sale_return_adjust, due_date, shipping_address, sale_type, is_cancelled, cancelled_at, cancelled_reason, shop_name, customers:customer_id (gst_number)";

export type InvoiceDashboardSaleDateFilter = {
  start: string | null;
  end: string | null;
};

export type InvoiceDashboardFilters = {
  organizationId: string;
  debouncedSearch: string;
  deliveryFilter: string;
  paymentStatusFilter: string[];
  shopFilter: string;
  userFilter: string;
  saleDateFilter: InvoiceDashboardSaleDateFilter;
  /** Calendar YYYY-MM-DD bounds for receipt voucher_date scoping (cloud usage). */
  voucherDateFrom: string | null;
  voucherDateTo: string | null;
};

export type InvoiceDashboardStats = {
  totalInvoices: number;
  totalAmount: number;
  totalDiscount: number;
  totalQty: number;
  pendingAmount: number;
  deliveredCount: number;
  deliveredAmount: number;
  undeliveredCount: number;
  undeliveredAmount: number;
};

export type InvoiceDashboardUnifiedResult = {
  invoices: any[];
  stats: InvoiceDashboardStats;
};

export function shouldUnionSaleItemsForInvoiceSearch(searchStr: string): boolean {
  const t = searchStr.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return t.length >= 8;
  return /[A-Za-z]/.test(t) && t.length >= 4;
}

function applyPaymentStatusFilterToSalesQuery(query: any, paymentStatusFilter: string[]) {
  if (paymentStatusFilter.length === 0) return query;
  const hasCancelled = paymentStatusFilter.includes("cancelled");
  const rest = paymentStatusFilter.filter((s) => s !== "cancelled");
  if (hasCancelled && rest.length === 0) {
    return query.or("payment_status.eq.cancelled,is_cancelled.eq.true");
  }
  if (hasCancelled && rest.length > 0) {
    const inList = rest.join(",");
    return query.or(
      `and(payment_status.in.(${inList}),is_cancelled.eq.false),is_cancelled.eq.true,payment_status.eq.cancelled`,
    );
  }
  return query.in("payment_status", rest).eq("is_cancelled", false);
}

/** Line-item search scoped to this org's invoice sales in the active date range (avoids org-wide sale_items scan). */
async function fetchSaleIdsMatchingLineItems(
  client: SupabaseClient,
  organizationId: string,
  saleDateFilter: InvoiceDashboardSaleDateFilter,
  searchStr: string,
  itemLimit: number,
): Promise<string[]> {
  const saleIdsInRange: string[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let q = client
      .from("sales")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sale_type", "invoice")
      .is("deleted_at", null);
    if (saleDateFilter.start) q = q.gte("sale_date", saleDateFilter.start);
    if (saleDateFilter.end) q = q.lte("sale_date", saleDateFilter.end);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    saleIdsInRange.push(...data.map((r) => r.id).filter(Boolean));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  if (saleIdsInRange.length === 0) return [];

  const orFilter =
    `barcode.ilike.%${searchStr}%,` +
    `product_name.ilike.%${searchStr}%,` +
    `size.ilike.%${searchStr}%,` +
    `color.ilike.%${searchStr}%`;

  const matched = new Set<string>();
  for (let i = 0; i < saleIdsInRange.length; i += 200) {
    const batch = saleIdsInRange.slice(i, i + 200);
    const { data: matchingItems, error } = await client
      .from("sale_items")
      .select("sale_id, sales!inner(organization_id)")
      .eq("sales.organization_id", organizationId)
      .in("sale_id", batch)
      .is("deleted_at", null)
      .or(orFilter)
      .limit(itemLimit);
    if (error) throw error;
    (matchingItems || []).forEach((row) => {
      if (row.sale_id) matched.add(row.sale_id);
    });
    if (matched.size >= itemLimit) break;
  }
  return [...matched];
}

function buildFilteredSalesQuery(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
  select: string,
) {
  let query = client
    .from("sales")
    .select(select)
    .eq("organization_id", filters.organizationId)
    .eq("sale_type", "invoice")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.deliveryFilter !== "all") {
    query = query.eq("delivery_status", filters.deliveryFilter);
  }
  if (filters.paymentStatusFilter.length > 0) {
    query = applyPaymentStatusFilterToSalesQuery(query, filters.paymentStatusFilter);
  }
  if (filters.shopFilter !== "all") {
    query = query.eq("shop_name", filters.shopFilter);
  }
  if (filters.userFilter !== "all" && filters.userFilter !== "__pending__") {
    query = query.eq("created_by", filters.userFilter);
  }
  if (filters.saleDateFilter.start) {
    query = query.gte("sale_date", filters.saleDateFilter.start);
  }
  if (filters.saleDateFilter.end) {
    query = query.lte("sale_date", filters.saleDateFilter.end);
  }
  return query;
}

async function applySearchToSalesQuery(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
  query: any,
): Promise<any> {
  const searchStr = filters.debouncedSearch.trim();
  if (!searchStr) return query;

  const saleTextFilter =
    `sale_number.ilike.%${searchStr}%,` +
    `customer_name.ilike.%${searchStr}%,` +
    `customer_phone.ilike.%${searchStr}%,` +
    `salesman.ilike.%${searchStr}%`;

  let matchingSaleIds: string[] = [];
  if (shouldUnionSaleItemsForInvoiceSearch(searchStr)) {
    matchingSaleIds = await fetchSaleIdsMatchingLineItems(
      client,
      filters.organizationId,
      filters.saleDateFilter,
      searchStr,
      1000,
    );
  }

  if (matchingSaleIds.length > 0) {
    const { data: textMatches } = await client
      .from("sales")
      .select("id")
      .eq("organization_id", filters.organizationId)
      .eq("sale_type", "invoice")
      .is("deleted_at", null)
      .or(saleTextFilter);
    const textMatchIds = (textMatches || []).map((s: any) => s.id);
    const allMatchIds = [...new Set([...textMatchIds, ...matchingSaleIds])];
    return query.in("id", allMatchIds);
  }
  return query.or(saleTextFilter);
}

/** One pass over filtered invoices: normalize rows + summary stats (replaces duplicate list + reconciled-stats queries). */
export async function fetchInvoiceDashboardUnified(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
): Promise<InvoiceDashboardUnifiedResult> {
  const emptyStats: InvoiceDashboardStats = {
    totalInvoices: 0,
    totalAmount: 0,
    totalDiscount: 0,
    totalQty: 0,
    pendingAmount: 0,
    deliveredCount: 0,
    deliveredAmount: 0,
    undeliveredCount: 0,
    undeliveredAmount: 0,
  };
  if (!filters.organizationId) {
    return { invoices: [], stats: emptyStats };
  }

  const PAGE_SIZE = 1000;
  let offset = 0;
  const allInvoices: any[] = [];

  while (true) {
    let query: any = buildFilteredSalesQuery(
      client,
      filters,
      INVOICE_DASHBOARD_SALES_SELECT,
    ).range(offset, offset + PAGE_SIZE - 1);
    query = await applySearchToSalesQuery(client, filters, query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allInvoices.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allInvoices.length === 0) {
    return { invoices: [], stats: emptyStats };
  }

  const splitBySale = new Map<string, SaleReceiptVoucherSplit>();
  const splitOpts = {
    voucherDateFrom: filters.voucherDateFrom,
    voucherDateTo: filters.voucherDateTo,
  };
  for (let i = 0; i < allInvoices.length; i += 200) {
    const batch = allInvoices.slice(i, i + 200);
    const batchSplit = await fetchSaleReceiptSplitsForInvoices(
      client,
      filters.organizationId,
      batch.map((inv: any) => ({
        id: inv.id,
        sale_number: inv.sale_number,
        customer_id: inv.customer_id,
      })),
      splitOpts,
    );
    batchSplit.forEach((v, k) => splitBySale.set(k, v));
  }

  const allSaleIds = allInvoices.map((inv: any) => inv.id).filter(Boolean);
  const itemsGrossBySale = new Map<string, number>();
  for (let i = 0; i < allSaleIds.length; i += 200) {
    const idBatch = allSaleIds.slice(i, i + 200);
    const { data: itemRows } = await client
      .from("sale_items")
      .select("sale_id, quantity, mrp")
      .in("sale_id", idBatch)
      .is("deleted_at", null);
    (itemRows || []).forEach((it: any) => {
      if (!it.sale_id) return;
      const g = (Number(it.quantity) || 0) * (Number(it.mrp) || 0);
      itemsGrossBySale.set(it.sale_id, (itemsGrossBySale.get(it.sale_id) || 0) + g);
    });
  }

  const { data: linkedReturns } = await client
    .from("sale_returns")
    .select("linked_sale_id, return_date, return_number")
    .eq("organization_id", filters.organizationId)
    .in("linked_sale_id", allSaleIds)
    .is("deleted_at", null);

  const normalized = allInvoices.map((inv: any) => {
    const isInvCancelled = inv.is_cancelled === true || inv.payment_status === "cancelled";
    if (isInvCancelled) {
      return { ...inv, payment_status: "cancelled" as const, outstanding: 0 };
    }
    if (inv.payment_status === "hold") {
      return { ...inv };
    }
    const rec = reconcileSaleInvoiceWithSplit(
      { ...inv, items_gross: itemsGrossBySale.get(inv.id) ?? null },
      splitBySale.get(inv.id) ?? null,
    );
    const cnAdjustYmd =
      Number(inv.sale_return_adjust || 0) > 0.005
        ? resolveCnAdjustDateForSale(inv.id, [], linkedReturns || [])
        : null;
    return {
      ...inv,
      paid_amount: rec.paid_amount,
      payment_status: rec.payment_status,
      outstanding: rec.outstanding,
      cn_adjust_date: cnAdjustYmd,
    };
  });

  const filteredForTable =
    filters.paymentStatusFilter.length > 0
      ? normalized.filter((inv: any) =>
          filters.paymentStatusFilter.includes(inv.payment_status),
        )
      : normalized;

  await syncStaleInvoicePaymentFields(
    client,
    filters.organizationId,
    normalized.filter((inv: any) => !inv.is_cancelled && inv.payment_status !== "hold"),
    splitBySale,
    itemsGrossBySale,
  );

  const emptyStats: InvoiceDashboardStats = {
    totalInvoices: 0,
    totalAmount: 0,
    totalDiscount: 0,
    totalQty: 0,
    pendingAmount: 0,
    deliveredCount: 0,
    deliveredAmount: 0,
    undeliveredCount: 0,
    undeliveredAmount: 0,
  };

  return { invoices: filteredForTable, stats: emptyStats };
}

/** Repair stale paid_amount / payment_status for visible page rows only (min writes). */
export async function syncStaleInvoicePaymentFields(
  client: SupabaseClient,
  organizationId: string,
  pageInvoices: any[],
  splitBySale: Map<string, SaleReceiptVoucherSplit>,
  itemsGrossBySale: Map<string, number>,
): Promise<void> {
  const staleUpdates = pageInvoices
    .filter((inv: any) => !inv.is_cancelled && inv.payment_status !== "hold")
    .map((inv: any) => {
      const split = splitBySale.get(inv.id) ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
      const rec = reconcileSaleInvoiceWithSplit(
        { ...inv, items_gross: itemsGrossBySale.get(inv.id) ?? null },
        split,
      );
      const { paymentStatus: derivedStatus } = derivePaidAndStatus({
        netAmount: Number(inv.net_amount || 0),
        saleReturnAdjust: Number(inv.sale_return_adjust || 0),
        cashReceived: split.cash,
        advanceApplied: split.adv,
        cnApplied: split.cn,
        discountGiven: split.discount,
        paymentMethod: inv.payment_method,
      });
      warnSettlementPathMismatch(
        "SalesInvoiceDashboard.staleNormalize",
        rec.payment_status,
        derivedStatus,
      );
      return { inv, normalizedPaid: rec.paid_amount, normalizedStatus: rec.payment_status };
    })
    .filter(
      ({ inv, normalizedPaid, normalizedStatus }) =>
        Math.abs(Number(inv.paid_amount || 0) - normalizedPaid) > 0.009 ||
        (inv.payment_status || "pending") !== normalizedStatus,
    );

  if (staleUpdates.length === 0) return;

  await Promise.all(
    staleUpdates.map(({ inv, normalizedPaid, normalizedStatus }) =>
      client
        .from("sales")
        .update({ paid_amount: normalizedPaid, payment_status: normalizedStatus })
        .eq("id", inv.id)
        .eq("organization_id", organizationId),
    ),
  );
}
