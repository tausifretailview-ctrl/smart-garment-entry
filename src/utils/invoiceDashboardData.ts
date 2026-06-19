import type { QueryClient } from "@tanstack/react-query";
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
  "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_email, customer_address, gross_amount, discount_amount, flat_discount_amount, flat_discount_percent, other_charges, round_off, net_amount, paid_amount, payment_method, payment_status, delivery_status, salesman, notes, total_qty, created_at, updated_at, created_by, irn, ack_no, einvoice_status, einvoice_error, einvoice_qr_code, sale_return_adjust, due_date, shipping_address, sale_type, is_cancelled, cancelled_at, cancelled_reason, shop_name, customers:customer_id (gst_number)";

/** Lighter select for paginated dashboard table (faster first paint). */
export const INVOICE_DASHBOARD_LIST_SELECT =
  "id, sale_number, sale_date, customer_id, customer_name, customer_phone, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, payment_method, payment_status, delivery_status, salesman, total_qty, sale_return_adjust, is_cancelled, shop_name, sale_type, created_by, customers:customer_id (gst_number)";

export type InvoiceDashboardSaleDateFilter = {
  start: string | null;
  end: string | null;
};

export type InvoiceDashboardFilters = {
  organizationId: string;
  debouncedSearch: string;
  /** When resolved (e.g. picker), narrows stats RPC via customer_id index. */
  customerId?: string | null;
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
  totalCount: number;
};

export type InvoiceDashboardRpcFilters = {
  search: string;
  deliveryFilter: string;
  shopFilter: string;
  userFilter: string;
  voucherDateFrom: string | null;
  voucherDateTo: string | null;
  paymentStatusFilter: string[];
};

export function buildInvoiceDashboardRpcFilters(
  filters: InvoiceDashboardFilters,
): InvoiceDashboardRpcFilters {
  return {
    search: filters.debouncedSearch.trim(),
    deliveryFilter: filters.deliveryFilter,
    shopFilter: filters.shopFilter,
    userFilter: filters.userFilter,
    voucherDateFrom: filters.voucherDateFrom,
    voucherDateTo: filters.voucherDateTo,
    paymentStatusFilter: filters.paymentStatusFilter,
  };
}

const EMPTY_INVOICE_DASHBOARD_STATS: InvoiceDashboardStats = {
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

export function shouldUnionSaleItemsForInvoiceSearch(searchStr: string): boolean {
  const t = searchStr.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return t.length >= 8;
  return /[A-Za-z]/.test(t) && t.length >= 4;
}

function shouldApplyInvoiceUserFilter(userFilter: string): boolean {
  return Boolean(userFilter) && userFilter !== "all" && userFilter !== "__pending__";
}

function applyQuickInvoiceDisplayFields(inv: any): any {
  const isInvCancelled = inv.is_cancelled === true || inv.payment_status === "cancelled";
  if (isInvCancelled) {
    return { ...inv, payment_status: "cancelled" as const, outstanding: 0 };
  }
  if (inv.payment_status === "hold") {
    return { ...inv };
  }
  const outstanding = Math.max(
    0,
    Number(inv.net_amount || 0) -
      Number(inv.paid_amount || 0) -
      Number(inv.sale_return_adjust || 0),
  );
  return { ...inv, outstanding };
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
      .select("sale_id")
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

function applyInvoiceDashboardFilters(query: any, filters: InvoiceDashboardFilters) {
  let q = query
    .eq("organization_id", filters.organizationId)
    .eq("sale_type", "invoice")
    .is("deleted_at", null);

  if (filters.deliveryFilter !== "all") {
    q = q.eq("delivery_status", filters.deliveryFilter);
  }
  if (filters.paymentStatusFilter.length > 0) {
    q = applyPaymentStatusFilterToSalesQuery(q, filters.paymentStatusFilter);
  }
  if (filters.shopFilter !== "all") {
    q = q.eq("shop_name", filters.shopFilter);
  }
  if (shouldApplyInvoiceUserFilter(filters.userFilter)) {
    q = q.eq("created_by", filters.userFilter);
  }
  if (filters.saleDateFilter.start) {
    q = q.gte("sale_date", filters.saleDateFilter.start);
  }
  if (filters.saleDateFilter.end) {
    q = q.lte("sale_date", filters.saleDateFilter.end);
  }
  if (filters.customerId) {
    q = q.eq("customer_id", filters.customerId);
  }
  return q;
}

function buildFilteredSalesQuery(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
  select: string,
) {
  return applyInvoiceDashboardFilters(client.from("sales").select(select), filters).order(
    "created_at",
    { ascending: false },
  );
}

async function countFilteredInvoiceSales(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
): Promise<number> {
  let query: any = applyInvoiceDashboardFilters(
    client.from("sales").select("id", { count: "exact", head: true }),
    filters,
  );
  query = await applySearchToSalesQuery(client, filters, query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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

function invoiceDashboardRpcErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
}

const INVOICE_DASHBOARD_STATS_SELECT =
  "id, sale_number, customer_id, net_amount, discount_amount, flat_discount_amount, total_qty, delivery_status, payment_status, is_cancelled, paid_amount, sale_return_adjust";

function computeInvoiceDashboardStats(rows: any[]): InvoiceDashboardStats {
  return {
    totalInvoices: rows.length,
    totalAmount: rows.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.net_amount || 0)),
      0,
    ),
    totalDiscount: rows.reduce(
      (sum, inv) =>
        sum + Number(inv.discount_amount || 0) + Number(inv.flat_discount_amount || 0),
      0,
    ),
    totalQty: rows.reduce((sum, inv) => sum + Number(inv.total_qty || 0), 0),
    pendingAmount: rows.reduce((sum, inv) => {
      if (inv.is_cancelled === true || inv.payment_status === "cancelled") return sum;
      return sum + Math.max(0, Number(inv.outstanding ?? 0));
    }, 0),
    deliveredCount: rows.filter((inv) => inv.delivery_status === "delivered").length,
    deliveredAmount: rows
      .filter((inv) => inv.delivery_status === "delivered")
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.net_amount || 0)), 0),
    undeliveredCount: rows.filter(
      (inv) => (inv.delivery_status || "undelivered") !== "delivered",
    ).length,
    undeliveredAmount: rows
      .filter((inv) => (inv.delivery_status || "undelivered") !== "delivered")
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.net_amount || 0)), 0),
  };
}

/** Fast client aggregation when RPC is missing (no receipt reconcile — cards only). */
async function fetchInvoiceDashboardStatsClient(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
): Promise<InvoiceDashboardStats> {
  if (!filters.organizationId) {
    return { ...EMPTY_INVOICE_DASHBOARD_STATS };
  }

  const PAGE_SIZE = 1000;
  let offset = 0;
  const allRows: any[] = [];

  while (true) {
    let query: any = buildFilteredSalesQuery(
      client,
      filters,
      INVOICE_DASHBOARD_STATS_SELECT,
    ).range(offset, offset + PAGE_SIZE - 1);
    query = await applySearchToSalesQuery(client, filters, query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allRows.length === 0) {
    return { ...EMPTY_INVOICE_DASHBOARD_STATS };
  }

  const displayRows = allRows.map(applyQuickInvoiceDisplayFields);
  const statsRows =
    filters.paymentStatusFilter.length > 0
      ? displayRows.filter((inv) => filters.paymentStatusFilter.includes(inv.payment_status))
      : displayRows.filter(
          (inv) =>
            inv.is_cancelled !== true &&
            inv.payment_status !== "cancelled" &&
            inv.payment_status !== "hold",
        );

  return computeInvoiceDashboardStats(statsRows);
}

function parseInvoiceDashboardStatsRow(row: Partial<InvoiceDashboardStats>): InvoiceDashboardStats {
  return {
    totalInvoices: Number(row.totalInvoices ?? 0),
    totalAmount: Number(row.totalAmount ?? 0),
    totalDiscount: Number(row.totalDiscount ?? 0),
    totalQty: Number(row.totalQty ?? 0),
    pendingAmount: Number(row.pendingAmount ?? 0),
    deliveredCount: Number(row.deliveredCount ?? 0),
    deliveredAmount: Number(row.deliveredAmount ?? 0),
    undeliveredCount: Number(row.undeliveredCount ?? 0),
    undeliveredAmount: Number(row.undeliveredAmount ?? 0),
  };
}

/** Server-side summary tiles; falls back to client scan when RPC is unavailable. */
export async function fetchInvoiceDashboardStats(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
): Promise<InvoiceDashboardStats> {
  if (!filters.organizationId) {
    return { ...EMPTY_INVOICE_DASHBOARD_STATS };
  }

  try {
    const { data, error } = await client.rpc("get_invoice_dashboard_stats", {
      p_organization_id: filters.organizationId,
      p_date_from: filters.saleDateFilter.start,
      p_date_to: filters.saleDateFilter.end,
      p_filters: buildInvoiceDashboardRpcFilters(filters),
      p_search: filters.debouncedSearch.trim() || null,
      p_customer_id: filters.customerId || null,
    });

    if (error) {
      console.warn(
        "get_invoice_dashboard_stats RPC failed, using client fallback:",
        invoiceDashboardRpcErrorMessage(error),
      );
      return fetchInvoiceDashboardStatsClient(client, filters);
    }

    return parseInvoiceDashboardStatsRow((data || {}) as Partial<InvoiceDashboardStats>);
  } catch (err) {
    console.warn(
      "get_invoice_dashboard_stats RPC failed, using client fallback:",
      invoiceDashboardRpcErrorMessage(err),
    );
    return fetchInvoiceDashboardStatsClient(client, filters);
  }
}

/** @deprecated Use fetchInvoiceDashboardStats */
export const fetchInvoiceDashboardStatsViaRpc = fetchInvoiceDashboardStats;

const SR_RECONCILE_TOLERANCE = 0.005;

export type InvoiceDashboardPageOptions = {
  page: number;
  pageSize: number;
  /** When false, skip receipt reconcile for faster first paint (use sourceRows + reconcile query). */
  reconcile?: boolean;
};

export type InvoiceDashboardPageResult = {
  invoices: any[];
  totalCount: number;
  /** Raw DB rows for background reconcile (omitted when reconcile: true). */
  sourceRows?: any[];
};

export async function reconcileInvoiceDashboardRows(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
  invoices: any[],
): Promise<any[]> {
  if (invoices.length === 0) return [];

  const splitBySale = new Map<string, SaleReceiptVoucherSplit>();
  const splitOpts = {
    voucherDateFrom: filters.voucherDateFrom,
    voucherDateTo: filters.voucherDateTo,
  };
  const batchSplit = await fetchSaleReceiptSplitsForInvoices(
    client,
    filters.organizationId,
    invoices.map((inv: any) => ({
      id: inv.id,
      sale_number: inv.sale_number,
      customer_id: inv.customer_id,
    })),
    splitOpts,
  );
  batchSplit.forEach((v, k) => splitBySale.set(k, v));

  const saleIdsNeedingItemsGross = invoices
    .filter((inv: any) => Number(inv.sale_return_adjust || 0) > SR_RECONCILE_TOLERANCE)
    .map((inv: any) => inv.id)
    .filter(Boolean);
  const itemsGrossBySale = await fetchItemsGrossForSales(client, saleIdsNeedingItemsGross);

  let linkedReturns: Array<{
    linked_sale_id: string | null;
    return_date: string | null;
    return_number: string | null;
  }> = [];
  if (saleIdsNeedingItemsGross.length > 0) {
    const { data } = await client
      .from("sale_returns")
      .select("linked_sale_id, return_date, return_number")
      .eq("organization_id", filters.organizationId)
      .in("linked_sale_id", saleIdsNeedingItemsGross)
      .is("deleted_at", null);
    linkedReturns = data || [];
  }

  return invoices.map((inv: any) => {
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
}

async function fetchItemsGrossForSales(
  client: SupabaseClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const itemsGrossBySale = new Map<string, number>();
  if (saleIds.length === 0) return itemsGrossBySale;

  for (let i = 0; i < saleIds.length; i += 200) {
    const idBatch = saleIds.slice(i, i + 200);
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
  return itemsGrossBySale;
}

/** Server-side paginated invoice rows with per-page reconcile (stats via RPC). */
export async function fetchInvoiceDashboardPage(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
  options: InvoiceDashboardPageOptions,
): Promise<InvoiceDashboardPageResult> {
  if (!filters.organizationId) {
    return { invoices: [], totalCount: 0 };
  }

  const reconcile = options.reconcile !== false;
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  const select = reconcile ? INVOICE_DASHBOARD_SALES_SELECT : INVOICE_DASHBOARD_LIST_SELECT;

  // Match export/unified fetch: range before search filters, then await (not range after .or()).
  const [totalCount, dataResult] = await Promise.all([
    countFilteredInvoiceSales(client, filters),
    (async () => {
      let query: any = buildFilteredSalesQuery(client, filters, select).range(from, to);
      query = await applySearchToSalesQuery(client, filters, query);
      return query;
    })(),
  ]);
  const { data, error } = await dataResult;
  if (error) throw error;

  const pageRows = data || [];
  if (pageRows.length === 0) {
    return { invoices: [], totalCount };
  }

  if (!reconcile) {
    const quickDisplay = pageRows.map(applyQuickInvoiceDisplayFields);
    const invoices =
      filters.paymentStatusFilter.length > 0
        ? quickDisplay.filter((inv: any) =>
            filters.paymentStatusFilter.includes(inv.payment_status),
          )
        : quickDisplay;
    return { invoices, totalCount, sourceRows: pageRows };
  }

  const normalized = await reconcileInvoiceDashboardRows(client, filters, pageRows);
  const invoices =
    filters.paymentStatusFilter.length > 0
      ? normalized.filter((inv: any) =>
          filters.paymentStatusFilter.includes(inv.payment_status),
        )
      : normalized;

  return { invoices, totalCount };
}

/** Default weekly range — matches SalesInvoiceDashboard initial periodFilter. */
export function buildDefaultWeeklyInvoiceDashboardFilters(
  organizationId: string,
): InvoiceDashboardFilters {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startYmd = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endYmd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return {
    organizationId,
    debouncedSearch: "",
    deliveryFilter: "all",
    paymentStatusFilter: [],
    shopFilter: "all",
    userFilter: "all",
    saleDateFilter: {
      start: `${startYmd}T00:00:00`,
      end: `${endYmd}T23:59:59.999`,
    },
    voucherDateFrom: startYmd,
    voucherDateTo: endYmd,
  };
}

export const INVOICE_DASHBOARD_DEFAULT_PAGE_SIZE = 50;

export const INVOICE_DASHBOARD_QUERY_KEY = "invoice-dashboard-unified" as const;

/** Invalidate page, stats, and reconcile queries after a dashboard mutation. */
export function invalidateInvoiceDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  queryClient.invalidateQueries({
    queryKey: organizationId
      ? [INVOICE_DASHBOARD_QUERY_KEY, organizationId]
      : [INVOICE_DASHBOARD_QUERY_KEY],
  });
}

/** Instant delivery badge update — avoids waiting on reconcile refetch + keepPreviousData. */
export function patchInvoiceDashboardDeliveryStatus(
  queryClient: QueryClient,
  organizationId: string,
  saleId: string,
  deliveryStatus: string,
) {
  const patchRow = (inv: any) =>
    inv?.id === saleId ? { ...inv, delivery_status: deliveryStatus } : inv;

  queryClient.setQueriesData(
    { queryKey: [INVOICE_DASHBOARD_QUERY_KEY, organizationId] },
    (old: unknown) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        return old.map(patchRow);
      }
      if (typeof old === "object") {
        const row = old as {
          invoices?: any[];
          sourceRows?: any[];
          deliveredCount?: number;
          undeliveredCount?: number;
        };
        if (Array.isArray(row.invoices) || Array.isArray(row.sourceRows)) {
          return {
            ...row,
            invoices: row.invoices?.map(patchRow),
            sourceRows: row.sourceRows?.map(patchRow),
          };
        }
      }
      return old;
    },
  );
}

export async function refetchInvoiceDashboardQueries(
  queryClient: QueryClient,
  organizationId: string,
) {
  invalidateInvoiceDashboardQueries(queryClient, organizationId);
  await queryClient.refetchQueries({
    queryKey: [INVOICE_DASHBOARD_QUERY_KEY, organizationId],
    type: "active",
  });
}

/** React Query prefetch bundle for post-login warm (weekly default filters). */
export function invoiceDashboardPrefetchQueryOptions(
  client: SupabaseClient,
  organizationId: string,
  pageSize: number = INVOICE_DASHBOARD_DEFAULT_PAGE_SIZE,
) {
  const filters = buildDefaultWeeklyInvoiceDashboardFilters(organizationId);
  const queryKey = [
    "invoice-dashboard-unified",
    organizationId,
    "",
    "all",
    [] as string[],
    "all",
    "all",
    filters.voucherDateFrom,
    filters.voucherDateTo,
    1,
    pageSize,
  ] as const;

  return {
    queryKey,
    queryFn: () =>
      fetchInvoiceDashboardPage(client, filters, {
        page: 1,
        pageSize,
        reconcile: false,
      }),
  };
}

/** Full filtered fetch for export paths (not used by paginated table). */
export async function fetchInvoiceDashboardUnified(
  client: SupabaseClient,
  filters: InvoiceDashboardFilters,
): Promise<InvoiceDashboardUnifiedResult> {
  if (!filters.organizationId) {
    return { invoices: [], stats: { ...EMPTY_INVOICE_DASHBOARD_STATS }, totalCount: 0 };
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
    return { invoices: [], stats: { ...EMPTY_INVOICE_DASHBOARD_STATS }, totalCount: 0 };
  }

  const normalized = await reconcileInvoiceDashboardRows(client, filters, allInvoices);
  const filteredForTable =
    filters.paymentStatusFilter.length > 0
      ? normalized.filter((inv: any) =>
          filters.paymentStatusFilter.includes(inv.payment_status),
        )
      : normalized;

  return {
    invoices: filteredForTable,
    stats: { ...EMPTY_INVOICE_DASHBOARD_STATS },
    totalCount: filteredForTable.length,
  };
}

/** Repair stale paid_amount / payment_status for the visible table page only (deferred). */
export async function syncVisibleInvoiceStaleFields(
  client: SupabaseClient,
  organizationId: string,
  visibleInvoices: any[],
  voucherDateFrom: string | null,
  voucherDateTo: string | null,
): Promise<boolean> {
  const pageInvoices = visibleInvoices.filter(
    (inv: any) => inv?.id && !inv.is_cancelled && inv.payment_status !== "hold",
  );
  if (pageInvoices.length === 0) return false;

  const splitBySale = await fetchSaleReceiptSplitsForInvoices(
    client,
    organizationId,
    pageInvoices.map((inv: any) => ({
      id: inv.id,
      sale_number: inv.sale_number,
      customer_id: inv.customer_id,
    })),
    { voucherDateFrom, voucherDateTo },
  );

  const saleIdsNeedingItemsGross = pageInvoices
    .filter((inv: any) => Number(inv.sale_return_adjust || 0) > SR_RECONCILE_TOLERANCE)
    .map((inv: any) => inv.id)
    .filter(Boolean);
  const itemsGrossBySale = await fetchItemsGrossForSales(client, saleIdsNeedingItemsGross);

  return syncStaleInvoicePaymentFields(
    client,
    organizationId,
    pageInvoices,
    splitBySale,
    itemsGrossBySale,
  );
}

/** Repair stale paid_amount / payment_status for visible page rows only (min writes). */
export async function syncStaleInvoicePaymentFields(
  client: SupabaseClient,
  organizationId: string,
  pageInvoices: any[],
  splitBySale: Map<string, SaleReceiptVoucherSplit>,
  itemsGrossBySale: Map<string, number>,
): Promise<boolean> {
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

  if (staleUpdates.length === 0) return false;

  await Promise.all(
    staleUpdates.map(({ inv, normalizedPaid, normalizedStatus }) =>
      client
        .from("sales")
        .update({ paid_amount: normalizedPaid, payment_status: normalizedStatus })
        .eq("id", inv.id)
        .eq("organization_id", organizationId),
    ),
  );
  return true;
}
