import { format, subMonths } from "date-fns";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { localDayEndUtcIso, localDayStartUtcIso } from "@/lib/localDayBounds";
import {
  getEffectivePaidAmountForPosDashboard,
  getPosSaleOutstandingBalance,
  isHoldLikePosSale,
  isPosSalePaidCompleted,
  type PosDashboardSaleLike,
} from "@/utils/posDashboardSettlement";

/** Calendar bounds for server queries from period chip + date inputs (fixes persisted single-day monthly). */
export function resolvePosDashboardQueryDates(
  periodFilter: string,
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  switch (periodFilter) {
    case "daily": {
      const day = startDate || endDate || today;
      return { startDate: day, endDate: day };
    }
    case "monthly": {
      const anchor = endDate || startDate || today;
      const [y, mo, da] = anchor.split("-").map(Number);
      const d = new Date(y, mo - 1, da);
      return {
        startDate: format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"),
        endDate: anchor,
      };
    }
    case "quarterly": {
      const anchor = endDate || startDate || today;
      const [y, mo, da] = anchor.split("-").map(Number);
      const d = new Date(y, mo - 1, da);
      const quarterMonth = Math.floor(d.getMonth() / 3) * 3;
      return {
        startDate: format(new Date(d.getFullYear(), quarterMonth, 1), "yyyy-MM-dd"),
        endDate: anchor,
      };
    }
    case "all":
      return { startDate: "", endDate: "" };
    default:
      return { startDate, endDate };
  }
}

/** When All Time has no dates, bound fetch to rolling 12 months (UI label unchanged). */
function resolvePosDashboardDateRange(startDate: string, endDate: string) {
  if (startDate || endDate) {
    return { startDate, endDate };
  }
  const today = new Date();
  return {
    startDate: format(subMonths(today, 12), "yyyy-MM-dd"),
    endDate: format(today, "yyyy-MM-dd"),
  };
}

export type PosDashboardCreditNoteUsage = Record<
  string,
  { credit_amount: number; used_amount: number; status: string }
>;

export type PosDashboardSalesPayload = {
  sales: any[];
  creditNoteUsage: PosDashboardCreditNoteUsage;
};

export type PosDashboardFilters = {
  organizationId: string;
  search: string;
  startDate: string;
  endDate: string;
  paymentMethodFilter: string;
  paymentStatusFilter: string[];
  saleTypeFilter: string;
  refundFilter: string;
  creditNoteFilter: string;
  userFilter: string;
  cancelFilter: string;
};

export type PosDashboardPageOptions = {
  page: number;
  pageSize: number;
};

export type PosDashboardSummaryStats = {
  totalBills: number;
  totalQty: number;
  totalAmount: number;
  totalDiscount: number;
  netSale: number;
  completedCount: number;
  completedAmount: number;
  pendingCount: number;
  pendingAmount: number;
  holdCount: number;
  holdAmount: number;
  refundCount: number;
  refundAmount: number;
  creditNoteCount: number;
  creditNoteAmount: number;
  totalCash: number;
  totalCard: number;
  totalUpi: number;
  totalBalance: number;
  totalSaleReturnAdjust: number;
  totalRoundOff: number;
  cashBillCount: number;
  cardBillCount: number;
  upiBillCount: number;
};

const EMPTY_POS_SUMMARY: PosDashboardSummaryStats = {
  totalBills: 0,
  totalQty: 0,
  totalAmount: 0,
  totalDiscount: 0,
  netSale: 0,
  completedCount: 0,
  completedAmount: 0,
  pendingCount: 0,
  pendingAmount: 0,
  holdCount: 0,
  holdAmount: 0,
  refundCount: 0,
  refundAmount: 0,
  creditNoteCount: 0,
  creditNoteAmount: 0,
  totalCash: 0,
  totalCard: 0,
  totalUpi: 0,
  totalBalance: 0,
  totalSaleReturnAdjust: 0,
  totalRoundOff: 0,
  cashBillCount: 0,
  cardBillCount: 0,
  upiBillCount: 0,
};

export const POS_DASHBOARD_SALES_SELECT =
  "*, customers:customer_id (gst_number)";

const POS_DASHBOARD_SUMMARY_SELECT =
  "id, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, net_amount, paid_amount, payment_status, payment_method, sale_number, cash_amount, card_amount, upi_amount, refund_amount, credit_note_id, credit_amount, credit_note_amount, sale_return_adjust, round_off, total_qty, is_cancelled";

/** Safer column list when full summary select fails (e.g. migration not yet applied). */
const POS_DASHBOARD_SUMMARY_FALLBACK_SELECT =
  "id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, payment_status, payment_method, sale_number, cash_amount, card_amount, upi_amount, refund_amount, credit_note_id, credit_amount, sale_return_adjust, round_off, total_qty, is_cancelled";

function posSearchBypassesDateFilter(search: string): boolean {
  return search.trim().length > 0;
}

function shouldUnionSaleItemsForPosSearch(searchStr: string): boolean {
  const t = searchStr.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return t.length >= 4;
  return /[A-Za-z]/.test(t) && t.length >= 3;
}

function shouldApplyPosUserFilter(userFilter: string): boolean {
  return Boolean(userFilter) && userFilter !== "all" && userFilter !== "__pending__";
}

function applyPosDashboardFilters(query: any, filters: PosDashboardFilters) {
  let q = query
    .eq("organization_id", filters.organizationId)
    .in("sale_type", ["pos", "delivery_challan"])
    .is("deleted_at", null);

  if (filters.cancelFilter === "active") {
    q = q.or("is_cancelled.is.null,is_cancelled.eq.false");
  } else if (filters.cancelFilter === "cancelled") {
    q = q.eq("is_cancelled", true);
  }

  if (shouldApplyPosUserFilter(filters.userFilter)) {
    q = q.eq("created_by", filters.userFilter);
  }

  if (filters.paymentMethodFilter !== "all") {
    q = q.eq("payment_method", filters.paymentMethodFilter);
  }

  if (filters.paymentStatusFilter.length > 0) {
    q = q.in("payment_status", filters.paymentStatusFilter);
  }

  if (filters.saleTypeFilter === "dc") {
    q = q.eq("sale_type", "delivery_challan");
  } else if (filters.saleTypeFilter === "pos") {
    q = q.eq("sale_type", "pos");
  } else if (filters.saleTypeFilter === "cn") {
    q = q.or("credit_note_id.not.is.null,credit_amount.gt.0");
  }

  if (filters.refundFilter === "with_refund") {
    q = q.gt("refund_amount", 0);
  } else if (filters.refundFilter === "without_refund") {
    q = q.or("refund_amount.is.null,refund_amount.eq.0");
  }

  if (filters.creditNoteFilter === "with_credit_note") {
    q = q.or("credit_note_id.not.is.null,credit_amount.gt.0");
  } else if (filters.creditNoteFilter === "without_credit_note") {
    q = q.is("credit_note_id", null).or("credit_amount.is.null,credit_amount.eq.0");
  }

  if (!posSearchBypassesDateFilter(filters.search)) {
    const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
    const startIso = localDayStartUtcIso(bounded.startDate);
    const endIso = localDayEndUtcIso(bounded.endDate);
    if (startIso) q = q.gte("sale_date", startIso);
    if (endIso) q = q.lte("sale_date", endIso);
  }

  return q;
}

function buildPosDashboardBaseQuery(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  select: string,
) {
  return applyPosDashboardFilters(client.from("sales").select(select), filters)
    .order("sale_date", { ascending: false })
    .order("id", { ascending: false });
}

async function countFilteredPosSales(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<number> {
  let query: any = applyPosDashboardFilters(
    client.from("sales").select("id", { count: "exact", head: true }),
    filters,
  );
  query = await applyPosSearchToQuery(client, filters, query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchPosSaleIdsMatchingLineItems(
  client: SupabaseClient,
  organizationId: string,
  filters: PosDashboardFilters,
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
      .in("sale_type", ["pos", "delivery_challan"])
      .is("deleted_at", null);
    if (!posSearchBypassesDateFilter(searchStr)) {
      const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
      const startIso = localDayStartUtcIso(bounded.startDate);
      const endIso = localDayEndUtcIso(bounded.endDate);
      if (startIso) q = q.gte("sale_date", startIso);
      if (endIso) q = q.lte("sale_date", endIso);
    }
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

async function applyPosSearchToQuery(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  query: any,
): Promise<any> {
  const searchStr = filters.search.trim();
  if (!searchStr) return query;

  const saleTextFilter =
    `sale_number.ilike.%${searchStr}%,` +
    `customer_name.ilike.%${searchStr}%,` +
    `customer_phone.ilike.%${searchStr}%`;

  let matchingSaleIds: string[] = [];
  if (shouldUnionSaleItemsForPosSearch(searchStr)) {
    matchingSaleIds = await fetchPosSaleIdsMatchingLineItems(
      client,
      filters.organizationId,
      filters,
      searchStr,
      1000,
    );
  }

  if (matchingSaleIds.length > 0) {
    const { data: textMatches } = await client
      .from("sales")
      .select("id")
      .eq("organization_id", filters.organizationId)
      .in("sale_type", ["pos", "delivery_challan"])
      .is("deleted_at", null)
      .or(saleTextFilter);
    const textMatchIds = (textMatches || []).map((s: any) => s.id);
    const allMatchIds = [...new Set([...textMatchIds, ...matchingSaleIds])];
    return query.in("id", allMatchIds);
  }
  return query.or(saleTextFilter);
}

async function enrichPosSalesWithCreditNotes(
  sales: any[],
): Promise<{ sales: any[]; creditNoteUsage: PosDashboardCreditNoteUsage }> {
  const creditNoteUsage: PosDashboardCreditNoteUsage = {};
  if (sales.length === 0) {
    return { sales, creditNoteUsage };
  }

  const saleIdsForCN = sales.map((s: { id: string }) => s.id);
  const cnBySaleId: Record<string, any> = {};
  for (let i = 0; i < saleIdsForCN.length; i += 500) {
    const batch = saleIdsForCN.slice(i, i + 500);
    if (batch.length === 0) continue;
    const { data: cnData } = await supabase
      .from("credit_notes")
      .select("id, sale_id, credit_amount, used_amount, status")
      .in("sale_id", batch)
      .is("deleted_at", null);
    cnData?.forEach((c: any) => {
      if (c.sale_id) cnBySaleId[c.sale_id] = c;
    });
  }

  const enriched = sales.map((s: any) => {
    const cn = cnBySaleId[s.id];
    if (!cn) return s;
    return {
      ...s,
      credit_note_id: s.credit_note_id || cn.id,
      credit_note_amount: s.credit_note_amount || cn.credit_amount || 0,
    };
  });

  enriched.forEach((s: any) => {
    const cn = cnBySaleId[s.id];
    if (cn) {
      creditNoteUsage[cn.id] = {
        credit_amount: cn.credit_amount || 0,
        used_amount: cn.used_amount || 0,
        status: cn.status,
      };
    }
  });

  const directCnIds = enriched
    .map((s: any) => s.credit_note_id)
    .filter((id: string | null) => id && !creditNoteUsage[id]);
  if (directCnIds.length > 0) {
    const { data: directCN } = await supabase
      .from("credit_notes")
      .select("id, credit_amount, used_amount, status")
      .in("id", directCnIds);
    directCN?.forEach((c: any) => {
      creditNoteUsage[c.id] = {
        credit_amount: c.credit_amount || 0,
        used_amount: c.used_amount || 0,
        status: c.status,
      };
    });
  }

  return { sales: enriched, creditNoteUsage };
}

export function computePosDashboardSummaryStats(
  rows: PosDashboardSaleLike[],
): PosDashboardSummaryStats {
  if (rows.length === 0) return { ...EMPTY_POS_SUMMARY };

  const nonHoldSales = rows.filter((sale) => !isHoldLikePosSale(sale));
  const holdSales = rows.filter((sale) => isHoldLikePosSale(sale));

  return {
    totalBills: rows.length,
    totalQty: nonHoldSales.reduce(
      (sum, sale) => sum + Number((sale as { total_qty?: number }).total_qty || 0),
      0,
    ),
    totalAmount: nonHoldSales.reduce((sum, sale) => sum + Number(sale.gross_amount || 0), 0),
    totalDiscount: nonHoldSales.reduce(
      (sum, sale) =>
        sum +
        Number(sale.discount_amount || 0) +
        Number(sale.flat_discount_amount || 0) +
        Number((sale as { points_redeemed_amount?: number }).points_redeemed_amount || 0),
      0,
    ),
    netSale: nonHoldSales.reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0),
    completedCount: nonHoldSales.filter((sale) => isPosSalePaidCompleted(sale)).length,
    completedAmount: nonHoldSales
      .filter((sale) => isPosSalePaidCompleted(sale))
      .reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0),
    pendingCount: nonHoldSales.filter(
      (sale) => !isPosSalePaidCompleted(sale) && !isHoldLikePosSale(sale),
    ).length,
    pendingAmount: nonHoldSales
      .filter((sale) => !isPosSalePaidCompleted(sale))
      .reduce((sum, sale) => sum + getPosSaleOutstandingBalance(sale), 0),
    holdCount: holdSales.length,
    holdAmount: holdSales.reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0),
    refundCount: nonHoldSales.filter((sale) => Number((sale as { refund_amount?: number }).refund_amount || 0) > 0).length,
    refundAmount: nonHoldSales.reduce(
      (sum, sale) => sum + Number((sale as { refund_amount?: number }).refund_amount || 0),
      0,
    ),
    creditNoteCount: nonHoldSales.filter(
      (sale) =>
        !!(sale as { credit_note_id?: string | null }).credit_note_id ||
        Number((sale as { credit_amount?: number }).credit_amount || 0) > 0,
    ).length,
    creditNoteAmount: nonHoldSales.reduce(
      (sum, sale) =>
        sum +
        Number(
          (sale as { credit_note_amount?: number }).credit_note_amount ||
            (sale as { credit_amount?: number }).credit_amount ||
            0,
        ),
      0,
    ),
    totalCash: nonHoldSales.reduce((sum, sale) => sum + Number(sale.cash_amount || 0), 0),
    totalCard: nonHoldSales.reduce((sum, sale) => sum + Number(sale.card_amount || 0), 0),
    totalUpi: nonHoldSales.reduce((sum, sale) => sum + Number(sale.upi_amount || 0), 0),
    totalBalance: nonHoldSales.reduce(
      (sum, sale) => sum + getPosSaleOutstandingBalance(sale),
      0,
    ),
    totalSaleReturnAdjust: nonHoldSales.reduce(
      (sum, sale) => sum + Number(sale.sale_return_adjust || 0),
      0,
    ),
    totalRoundOff: nonHoldSales.reduce((sum, sale) => sum + Number(sale.round_off || 0), 0),
    cashBillCount: nonHoldSales.filter((sale) => Number(sale.cash_amount || 0) > 0).length,
    cardBillCount: nonHoldSales.filter((sale) => Number(sale.card_amount || 0) > 0).length,
    upiBillCount: nonHoldSales.filter((sale) => Number(sale.upi_amount || 0) > 0).length,
  };
}

export async function fetchPosDashboardPage(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  options: PosDashboardPageOptions,
): Promise<PosDashboardSalesPayload & { totalCount: number }> {
  if (!filters.organizationId) {
    return { sales: [], creditNoteUsage: {}, totalCount: 0 };
  }

  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;

  const [totalCount, dataResult] = await Promise.all([
    countFilteredPosSales(client, filters),
    (async () => {
      let query: any = buildPosDashboardBaseQuery(
        client,
        filters,
        POS_DASHBOARD_SALES_SELECT,
      ).range(from, to);
      query = await applyPosSearchToQuery(client, filters, query);
      return query;
    })(),
  ]);
  const { data, error } = await dataResult;
  if (error) throw error;

  const enriched = await enrichPosSalesWithCreditNotes(data || []);
  return { ...enriched, totalCount };
}

async function scanPosDashboardSummaryRows(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  select: string,
): Promise<PosDashboardSaleLike[]> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  const allRows: PosDashboardSaleLike[] = [];

  while (true) {
    let query: any = buildPosDashboardBaseQuery(client, filters, select).range(
      offset,
      offset + PAGE_SIZE - 1,
    );
    query = await applyPosSearchToQuery(client, filters, query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allRows.push(...(data as PosDashboardSaleLike[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

export async function fetchPosDashboardSummary(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<PosDashboardSummaryStats> {
  if (!filters.organizationId) return { ...EMPTY_POS_SUMMARY };

  const totalCount = await countFilteredPosSales(client, filters);
  if (totalCount === 0) return { ...EMPTY_POS_SUMMARY };

  // "*" first — matches the working paginated table fetch; explicit lists can fail if a column is missing in prod.
  const selectAttempts = [
    "*",
    POS_DASHBOARD_SUMMARY_FALLBACK_SELECT,
    POS_DASHBOARD_SUMMARY_SELECT,
  ];
  let lastError: unknown;

  for (const select of selectAttempts) {
    try {
      const allRows = await scanPosDashboardSummaryRows(client, filters, select);
      if (allRows.length > 0) {
        return computePosDashboardSummaryStats(allRows);
      }
    } catch (err) {
      lastError = err;
      console.warn("POS dashboard summary scan failed:", err);
    }
  }

  if (lastError) throw lastError;
  throw new Error(
    `POS dashboard summary: count is ${totalCount} but no rows were returned from scan`,
  );
}

/** True when summary tiles have real money/count signal (not an empty RPC/shell object). */
export function posDashboardSummaryLooksValid(
  stats: PosDashboardSummaryStats,
  totalCount: number,
): boolean {
  if (totalCount === 0) return stats.totalBills === 0;
  if (stats.totalBills <= 0) return false;
  return (
    stats.totalBills === totalCount ||
    stats.netSale > 0 ||
    stats.totalAmount > 0 ||
    stats.totalCash > 0 ||
    stats.totalCard > 0 ||
    stats.totalUpi > 0 ||
    stats.completedCount > 0 ||
    stats.pendingCount > 0 ||
    stats.holdCount > 0
  );
}

/** Full filtered fetch for export (not used by paginated table). */
export async function fetchPosDashboardExportRows(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<PosDashboardSalesPayload> {
  if (!filters.organizationId) {
    return { sales: [], creditNoteUsage: {} };
  }

  const PAGE_SIZE = 1000;
  let offset = 0;
  const allSales: any[] = [];

  while (true) {
    let query: any = buildPosDashboardBaseQuery(
      client,
      filters,
      POS_DASHBOARD_SALES_SELECT,
    ).range(offset, offset + PAGE_SIZE - 1);
    query = await applyPosSearchToQuery(client, filters, query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allSales.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return enrichPosSalesWithCreditNotes(allSales);
}

export const POS_DASHBOARD_QUERY_KEY = "pos-dashboard-sales" as const;

/** Invalidate table page and summary tiles after a POS dashboard mutation. */
export function invalidatePosDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  queryClient.invalidateQueries({
    queryKey: organizationId
      ? [POS_DASHBOARD_QUERY_KEY, organizationId]
      : [POS_DASHBOARD_QUERY_KEY],
  });
}

/** @deprecated Use fetchPosDashboardPage for the dashboard table. */
export async function fetchPosDashboardSales(
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<PosDashboardSalesPayload> {
  return fetchPosDashboardExportRows(supabase, {
    organizationId,
    search: "",
    startDate,
    endDate,
    paymentMethodFilter: "all",
    paymentStatusFilter: [],
    saleTypeFilter: "all",
    refundFilter: "all",
    creditNoteFilter: "all",
    userFilter: "all",
    cancelFilter: "active",
  });
}
