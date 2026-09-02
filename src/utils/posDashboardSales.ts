import { format, subMonths } from "date-fns";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { localDayEndUtcIso, localDayStartUtcIso } from "@/lib/localDayBounds";
import {
  buildPosSaleHeaderSearchFilter,
  looksLikeInvoiceSequence,
  rankPosDashboardSearchResults,
  shouldUnionSaleItemsForPosSearch,
} from "@/utils/posDashboardSearch";
import {
  POS_LINE_ITEM_SALE_TYPES,
  buildLineItemSaleSearchArgs,
  fetchLineItemMatchingSaleIds,
} from "@/utils/lineItemSaleSearch";
import {
  fetchSaleReceiptVoucherRowsForInvoices,
  buildSaleReceiptModeAmountMap,
  buildSaleReceiptSplitMap,
  reconcileSaleInvoiceWithSplit,
} from "@/utils/customerBalanceUtils";
import {
  getEffectivePaidAmountForPosDashboard,
  getPosPaymentModeDisplayAmounts,
  getPosSaleOutstandingBalance,
  isHoldLikePosSale,
  isPosSalePaidCompleted,
  type PosDashboardSaleLike,
} from "@/utils/posDashboardSettlement";
import { getSaleReportGrossAmount, getSaleReportNetAmount } from "@/utils/cashierReportUtils";
import { withDashboardTimeout } from "@/utils/withDashboardTimeout";

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
export function resolvePosDashboardDateRange(startDate: string, endDate: string) {
  if (startDate || endDate) {
    return { startDate, endDate };
  }
  const today = new Date();
  return {
    startDate: format(subMonths(today, 12), "yyyy-MM-dd"),
    endDate: format(today, "yyyy-MM-dd"),
  };
}

/**
 * Receipt voucher crawl window for settlement enrich.
 * Daily / short ranges use a shorter lookback so opening the dashboard after a
 * POS save does not wait on a 12‑month voucher scan.
 */
export function resolvePosDashboardVoucherLookbackFrom(
  startDate: string,
  endDate: string,
): string | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = endDate ? new Date(`${endDate}T12:00:00`) : start;
  const spanDays = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );
  // Daily: 45 days (advances/CN in the same month still settle).
  // ≤31 days: 90 days. Wider ranges keep the historical 12‑month window.
  const lookbackMonths = spanDays <= 1 ? 0 : spanDays <= 31 ? 3 : 12;
  const lookbackDays = spanDays <= 1 ? 45 : 0;
  if (lookbackDays > 0) {
    const from = new Date(start);
    from.setDate(from.getDate() - lookbackDays);
    return format(from, "yyyy-MM-dd");
  }
  return format(subMonths(start, lookbackMonths), "yyyy-MM-dd");
}

/** Minimal sale row used to show a just-saved POS bill before the heavy refetch finishes. */
export type PosDashboardSaleSeed = {
  id: string;
  sale_number?: string | null;
  sale_date?: string | null;
  sale_type?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  flat_discount_percent?: number | null;
  sale_return_adjust?: number | null;
  round_off?: number | null;
  net_amount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  paid_amount?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  refund_amount?: number | null;
  points_redeemed_amount?: number | null;
  salesman?: string | null;
  notes?: string | null;
  tax_type?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  organization_id?: string | null;
  total_qty?: number | null;
  is_cancelled?: boolean | null;
  status?: string | null;
};

function saleDayInFilterRange(
  saleDay: string,
  startDate: string,
  endDate: string,
): boolean {
  if (!saleDay) return false;
  if (startDate && saleDay < startDate) return false;
  if (endDate && saleDay > endDate) return false;
  return true;
}

/**
 * Prepend a just-saved POS sale into cached dashboard page-1 queries so the
 * last bill is visible immediately when the user opens POS Dashboard.
 */
export function seedPosDashboardCacheWithSale(
  queryClient: QueryClient,
  organizationId: string,
  sale: PosDashboardSaleSeed,
): void {
  if (!organizationId || !sale?.id) return;

  const saleDay = sale.sale_date
    ? format(new Date(sale.sale_date), "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  // Prefer calendar date from ISO / date-only strings without TZ shift.
  const saleDayLocal = /^\d{4}-\d{2}-\d{2}/.test(String(sale.sale_date || ""))
    ? String(sale.sale_date).slice(0, 10)
    : saleDay;

  const seedRow = {
    ...sale,
    sale_date: sale.sale_date || saleDayLocal,
    is_cancelled: sale.is_cancelled ?? false,
    customers: null,
  };

  const queries = queryClient.getQueryCache().findAll({
    queryKey: ["pos-dashboard-sales", organizationId],
  });

  let seededList = false;
  for (const query of queries) {
    const key = query.queryKey as unknown[];
    if (!Array.isArray(key) || key.length < 3) continue;

    // Summary tile cache — bump counters lightly when date range matches.
    if (key[2] === "summary") {
      const startDate = String(key[5] ?? "");
      const endDate = String(key[6] ?? "");
      if (!saleDayInFilterRange(saleDayLocal, startDate, endDate)) continue;
      const stats = query.state.data as
        | {
            totalBills: number;
            totalQty: number;
            totalAmount: number;
            netSale: number;
            completedCount: number;
            completedAmount: number;
            pendingCount: number;
            pendingAmount: number;
            totalCash: number;
            totalCard: number;
            totalUpi: number;
            cashBillCount: number;
            cardBillCount: number;
            upiBillCount: number;
          }
        | undefined;
      if (!stats) continue;
      const net = Number(sale.net_amount || 0);
      const paid = Number(sale.paid_amount || 0);
      const cash = Number(sale.cash_amount || 0);
      const card = Number(sale.card_amount || 0);
      const upi = Number(sale.upi_amount || 0);
      const completed = String(sale.payment_status || "") === "completed";
      queryClient.setQueryData(key, {
        ...stats,
        totalBills: stats.totalBills + 1,
        totalQty: stats.totalQty + Number(sale.total_qty || 0),
        totalAmount: stats.totalAmount + Number(sale.gross_amount || 0),
        netSale: stats.netSale + net,
        completedCount: stats.completedCount + (completed ? 1 : 0),
        completedAmount: stats.completedAmount + (completed ? net : 0),
        pendingCount: stats.pendingCount + (completed ? 0 : 1),
        pendingAmount: stats.pendingAmount + (completed ? 0 : Math.max(0, net - paid)),
        totalCash: stats.totalCash + cash,
        totalCard: stats.totalCard + card,
        totalUpi: stats.totalUpi + upi,
        cashBillCount: stats.cashBillCount + (cash > 0 ? 1 : 0),
        cardBillCount: stats.cardBillCount + (card > 0 ? 1 : 0),
        upiBillCount: stats.upiBillCount + (upi > 0 ? 1 : 0),
      });
      continue;
    }

    // List page key: [key, org, search, period, start, end, ..., page, pageSize]
    const search = String(key[2] ?? "");
    const startDate = String(key[4] ?? "");
    const endDate = String(key[5] ?? "");
    const page = Number(key[13] ?? 1);
    if (search.trim()) continue;
    if (page !== 1) continue;
    if (!saleDayInFilterRange(saleDayLocal, startDate, endDate)) continue;

    const payload = query.state.data as
      | (PosDashboardSalesPayload & { totalCount: number })
      | undefined;
    if (!payload?.sales) continue;
    if (payload.sales.some((row) => row?.id === sale.id)) {
      seededList = true;
      continue;
    }

    queryClient.setQueryData(key, {
      ...payload,
      sales: [seedRow, ...payload.sales],
      totalCount: (payload.totalCount || 0) + 1,
    });
    seededList = true;
  }

  // First visit after save — seed today's default daily page so open isn't empty.
  if (!seededList) {
    const today = format(new Date(), "yyyy-MM-dd");
    if (saleDayLocal === today) {
      const { startDate, endDate } = resolvePosDashboardQueryDates("daily", today, today);
      const defaultKey = [
        "pos-dashboard-sales",
        organizationId,
        "",
        "daily",
        startDate,
        endDate,
        "all",
        [] as string[],
        "all",
        "all",
        "all",
        "all",
        "active",
        1,
        50,
      ] as const;
      queryClient.setQueryData(defaultKey, {
        sales: [seedRow],
        creditNoteUsage: {},
        totalCount: 1,
      });
    }
  }
}

export type PosDashboardCreditNoteUsage = Record<
  string,
  { credit_amount: number; used_amount: number; status: string }
>;

export type PosDashboardSearchMeta = {
  /** True when the line-item search hit the hard result cap. */
  lineItemCapped: boolean;
  /** The cap value used for this search. */
  lineItemCap: number;
  /** Number of distinct sale ids returned by the line-item search. */
  lineItemCount: number;
};

export type PosDashboardSalesPayload = {
  sales: any[];
  creditNoteUsage: PosDashboardCreditNoteUsage;
  searchMeta?: PosDashboardSearchMeta;
};


export type PosDashboardFilters = {
  organizationId: string;
  search: string;
  /** Exact customer when resolved — narrows stats RPC via customer_id index. */
  customerId?: string | null;
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
  /** When false, skip receipt settlement for faster first paint (background reconcile). */
  reconcile?: boolean;
};

export type PosDashboardPageResult = PosDashboardSalesPayload & {
  totalCount: number;
  /** Raw DB rows for background receipt reconcile. */
  sourceRows?: any[];
};

function applyQuickPosDisplayFields(sale: any): any {
  if (sale.is_cancelled || sale.payment_status === "cancelled") {
    return { ...sale, payment_status: "cancelled", pos_outstanding: 0 };
  }
  if (isHoldLikePosSale(sale)) {
    return { ...sale };
  }
  const modes = getPosPaymentModeDisplayAmounts(sale);
  return {
    ...sale,
    cash_amount: modes.cash,
    card_amount: modes.card,
    upi_amount: modes.upi,
    pos_outstanding: getPosSaleOutstandingBalance(sale),
  };
}

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

const POS_DASHBOARD_STATS_RPC_CACHE_KEY = "ezzy:rpc:get_pos_dashboard_stats";

let posDashboardStatsRpcWarned = false;

function isPosDashboardStatsRpcUnavailable(): boolean {
  try {
    return sessionStorage.getItem(POS_DASHBOARD_STATS_RPC_CACHE_KEY) === "0";
  } catch {
    return false;
  }
}

function markPosDashboardStatsRpcUnavailable(): void {
  try {
    sessionStorage.setItem(POS_DASHBOARD_STATS_RPC_CACHE_KEY, "0");
  } catch {
    // ignore storage failures
  }
}

function isPosDashboardStatsRpcNotFoundError(
  error: { code?: string; message?: string; status?: number; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = String(error.message || error.hint || "");
  return /get_pos_dashboard_stats/i.test(msg);
}

function warnPosDashboardStatsRpcFallback(reason: string): void {
  if (posDashboardStatsRpcWarned) return;
  posDashboardStatsRpcWarned = true;
  console.warn(
    `[POSDashboard] get_pos_dashboard_stats unavailable (${reason}) — using client summary scan. ` +
      "Apply migration supabase/migrations/20260823120100_pos_dashboard_stats_search_params.sql to remove this fallback.",
  );
}

export type PosDashboardRpcFilters = {
  cancelFilter: string;
  paymentMethodFilter: string;
  paymentStatusFilter: string[];
  saleTypeFilter: string;
  refundFilter: string;
  creditNoteFilter: string;
  userFilter: string;
};

export function buildPosDashboardRpcFilters(filters: PosDashboardFilters): PosDashboardRpcFilters {
  return {
    cancelFilter: filters.cancelFilter,
    paymentMethodFilter: filters.paymentMethodFilter,
    paymentStatusFilter: filters.paymentStatusFilter,
    saleTypeFilter: filters.saleTypeFilter,
    refundFilter: filters.refundFilter,
    creditNoteFilter: filters.creditNoteFilter,
    userFilter: filters.userFilter,
  };
}

function resolvePosDashboardRpcDates(filters: PosDashboardFilters): {
  from: string | null;
  to: string | null;
} {
  // Only invoice-serial lookups may aggregate outside the selected window.
  if (filters.search.trim() && looksLikeInvoiceSequence(filters.search.trim())) {
    return { from: null, to: null };
  }
  const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
  return {
    from: localDayStartUtcIso(bounded.startDate),
    to: localDayEndUtcIso(bounded.endDate),
  };
}

function parsePosDashboardStatsRow(
  row: Partial<PosDashboardSummaryStats>,
): PosDashboardSummaryStats {
  return {
    totalBills: Number(row.totalBills ?? 0),
    totalQty: Number(row.totalQty ?? 0),
    totalAmount: Number(row.totalAmount ?? 0),
    totalDiscount: Number(row.totalDiscount ?? 0),
    netSale: Number(row.netSale ?? 0),
    completedCount: Number(row.completedCount ?? 0),
    completedAmount: Number(row.completedAmount ?? 0),
    pendingCount: Number(row.pendingCount ?? 0),
    pendingAmount: Number(row.pendingAmount ?? 0),
    holdCount: Number(row.holdCount ?? 0),
    holdAmount: Number(row.holdAmount ?? 0),
    refundCount: Number(row.refundCount ?? 0),
    refundAmount: Number(row.refundAmount ?? 0),
    creditNoteCount: Number(row.creditNoteCount ?? 0),
    creditNoteAmount: Number(row.creditNoteAmount ?? 0),
    totalCash: Number(row.totalCash ?? 0),
    totalCard: Number(row.totalCard ?? 0),
    totalUpi: Number(row.totalUpi ?? 0),
    totalBalance: Number(row.totalBalance ?? 0),
    totalSaleReturnAdjust: Number(row.totalSaleReturnAdjust ?? 0),
    totalRoundOff: Number(row.totalRoundOff ?? 0),
    cashBillCount: Number(row.cashBillCount ?? 0),
    cardBillCount: Number(row.cardBillCount ?? 0),
    upiBillCount: Number(row.upiBillCount ?? 0),
  };
}

async function fetchPosDashboardSummaryViaRpc(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<PosDashboardSummaryStats> {
  const { from, to } = resolvePosDashboardRpcDates(filters);
  const { data, error } = await (client as any).rpc("get_pos_dashboard_stats", {
    p_organization_id: filters.organizationId,
    p_date_from: from,
    p_date_to: to,
    p_filters: buildPosDashboardRpcFilters(filters),
    p_search: filters.search.trim() || null,
    p_customer_id: filters.customerId || null,
  });

  if (error) {
    if (isPosDashboardStatsRpcNotFoundError(error)) {
      markPosDashboardStatsRpcUnavailable();
      warnPosDashboardStatsRpcFallback(error.code || String(error.status ?? "404"));
    } else {
      console.warn("get_pos_dashboard_stats RPC failed, using client fallback:", error.message || error);
    }
    throw error;
  }

  return parsePosDashboardStatsRow((data || {}) as Partial<PosDashboardSummaryStats>);
}

const POS_DASHBOARD_SUMMARY_SELECT =
  "id, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, net_amount, paid_amount, payment_status, payment_method, sale_number, cash_amount, card_amount, upi_amount, refund_amount, credit_note_id, credit_amount, credit_note_amount, sale_return_adjust, round_off, total_qty, is_cancelled";

/** Safer column list when full summary select fails (e.g. migration not yet applied). */
const POS_DASHBOARD_SUMMARY_FALLBACK_SELECT =
  "id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, payment_status, payment_method, sale_number, cash_amount, card_amount, upi_amount, refund_amount, credit_note_id, credit_amount, sale_return_adjust, round_off, total_qty, is_cancelled";

function posSearchBypassesDateFilter(search: string): boolean {
  return search.trim().length > 0;
}

function shouldApplyPosUserFilter(userFilter: string): boolean {
  return Boolean(userFilter) && userFilter !== "all" && userFilter !== "__pending__";
}

/**
 * Mix + credit POS bills save as payment_status=partial (not completed).
 * Pending / Balance KPI clicks must include both unpaid statuses.
 */
export const POS_DASHBOARD_UNPAID_STATUS_FILTER = ["pending", "partial"] as const;

/**
 * Cash / Card / UPI method chips must include mix (`payment_method=multiple`) rows
 * that actually tendered in that mode — otherwise mix cash/UPI never appears under
 * those filters (only under Mix Payment).
 */
export function buildPosDashboardPaymentMethodOrFilter(
  method: string,
): string | null {
  if (method === "cash") {
    return "payment_method.eq.cash,and(payment_method.eq.multiple,cash_amount.gt.0)";
  }
  if (method === "card") {
    return "payment_method.eq.card,and(payment_method.eq.multiple,card_amount.gt.0)";
  }
  if (method === "upi") {
    return "payment_method.eq.upi,and(payment_method.eq.multiple,upi_amount.gt.0)";
  }
  return null;
}

/** KPI strip: keep Paid/Pending/Cash totals for the date range while the table is filtered. */
export function buildPosDashboardSummaryScopeFilters(
  filters: PosDashboardFilters,
): PosDashboardFilters {
  return {
    ...filters,
    paymentMethodFilter: "all",
    paymentStatusFilter: [],
  };
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

  if (filters.customerId) {
    q = q.eq("customer_id", filters.customerId);
  }

  if (filters.paymentMethodFilter !== "all") {
    const methodOr = buildPosDashboardPaymentMethodOrFilter(filters.paymentMethodFilter);
    if (methodOr) {
      q = q.or(methodOr);
    } else {
      q = q.eq("payment_method", filters.paymentMethodFilter);
    }
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
  searchResolution: PosSearchResolution | null = null,
): Promise<number> {
  let query: any = applyPosDashboardFilters(
    client.from("sales").select("id", { count: "exact", head: true }),
    filters,
  );
  const resolution =
    searchResolution ?? (await resolvePosSearch(client, filters));
  query = applyResolvedPosSearch(query, resolution);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Line-item (sale_items ILIKE) match — always date-scoped.
 * Header search may still bypass dates (invoice serial lookup); product/barcode
 * union must not scan the org's full sale history per keystroke.
 */
const POS_LINE_ITEM_SEARCH_CAP = 500;

async function fetchPosSaleIdsMatchingLineItems(
  client: SupabaseClient,
  organizationId: string,
  filters: PosDashboardFilters,
  searchStr: string,
  _itemLimit: number,
): Promise<{ saleIds: string[]; meta: PosDashboardSearchMeta }> {
  const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
  const startIso = localDayStartUtcIso(bounded.startDate);
  const endIso = localDayEndUtcIso(bounded.endDate);

  try {
    return await fetchLineItemMatchingSaleIds(
      client,
      buildLineItemSaleSearchArgs({
        organizationId,
        search: searchStr,
        dateFrom: startIso,
        dateTo: endIso,
        limit: POS_LINE_ITEM_SEARCH_CAP,
        saleTypes: POS_LINE_ITEM_SALE_TYPES,
      }),
    );
  } catch (error) {
    console.error("search_line_item_sale_ids RPC failed:", error);
    throw error;
  }
}


/** Resolved once per dashboard fetch so count + page share one sale_items pass. */
type PosSearchResolution = {
  saleTextFilter: string;
  /** When set, restrict the sales query to these ids (header ± line-item union). */
  restrictToIds: string[] | null;
  /** When the search resolves to exactly one customer, filter by the indexed column instead of a long id list. */
  restrictToCustomerId?: string | null;
  /** Metadata about the line-item search, surfaced in the UI for cap warnings. */
  searchMeta?: PosDashboardSearchMeta;
};

/** Hard cap on header matches pulled per search (most recent first). */
const POS_HEADER_SEARCH_CAP = 400;

/**
 * Search resolution is identical for the table page, the row count and the KPI
 * tiles. Cache it briefly so a single keystroke batch resolves once, not 3×.
 */
const posSearchResolutionCache = new Map<
  string,
  { at: number; promise: Promise<PosSearchResolution | null> }
>();
const POS_SEARCH_CACHE_TTL_MS = 15_000;

function posSearchCacheKey(filters: PosDashboardFilters): string {
  return [
    filters.organizationId,
    filters.search.trim().toLowerCase(),
    filters.startDate,
    filters.endDate,
  ].join("|");
}

async function resolvePosSearch(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<PosSearchResolution | null> {
  if (!filters.search.trim()) return null;
  const key = posSearchCacheKey(filters);
  const now = Date.now();
  const cached = posSearchResolutionCache.get(key);
  if (cached && now - cached.at < POS_SEARCH_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = resolvePosSearchUncached(client, filters).catch((err) => {
    posSearchResolutionCache.delete(key);
    throw err;
  });
  posSearchResolutionCache.set(key, { at: now, promise });
  // Keep the cache small — this is a per-tab in-memory map.
  if (posSearchResolutionCache.size > 30) {
    for (const [k, v] of posSearchResolutionCache) {
      if (now - v.at > POS_SEARCH_CACHE_TTL_MS) posSearchResolutionCache.delete(k);
    }
  }
  return promise;
}

async function resolvePosSearchUncached(
  client: SupabaseClient,
  filters: PosDashboardFilters,
): Promise<PosSearchResolution | null> {
  const searchStr = filters.search.trim();
  if (!searchStr) return null;

  const saleTextFilter = buildPosSaleHeaderSearchFilter(searchStr);
  // Invoice-serial lookups must reach old bills, so they stay date-unbounded.
  // Name / phone searches stay inside the selected window (bounded to 12 months
  // for "All Time") so they never scan the org's full history.
  const dateBounded = !looksLikeInvoiceSequence(searchStr);
  const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
  const startIso = dateBounded ? localDayStartUtcIso(bounded.startDate) : null;
  const endIso = dateBounded ? localDayEndUtcIso(bounded.endDate) : null;

  let headerQuery: any = client
    .from("sales")
    .select("id, sale_number, sale_date, customer_id")
    .eq("organization_id", filters.organizationId)
    .in("sale_type", ["pos", "delivery_challan"])
    .is("deleted_at", null)
    .or(saleTextFilter)
    .order("sale_date", { ascending: false })
    .limit(POS_HEADER_SEARCH_CAP);
  if (startIso) headerQuery = headerQuery.gte("sale_date", startIso);
  if (endIso) headerQuery = headerQuery.lte("sale_date", endIso);
  const { data: headerMatches, error: headerError } = await headerQuery;
  if (headerError) throw headerError;

  const headerRows = (headerMatches || []) as {
    id: string;
    sale_number?: string | null;
    sale_date?: string | null;
    customer_id?: string | null;
  }[];
  const rankedHeaders = rankPosDashboardSearchResults(headerRows, searchStr);
  const headerMatchIds = rankedHeaders.map((s) => s.id).filter(Boolean);

  // Customer-wise search: when every hit belongs to one customer, filter on the
  // indexed customer_id instead of shipping a few hundred ids in an IN list.
  const distinctCustomerIds = new Set(
    headerRows.map((r) => r.customer_id).filter((v): v is string => !!v),
  );
  const singleCustomerId =
    distinctCustomerIds.size === 1 &&
    headerRows.every((r) => !!r.customer_id) &&
    !shouldUnionSaleItemsForPosSearch(searchStr)
      ? [...distinctCustomerIds][0]
      : null;
  if (singleCustomerId) {
    return { saleTextFilter, restrictToIds: null, restrictToCustomerId: singleCustomerId };
  }

  // When invoice serial matches exist (e.g. "1029" → POS/26-27/1029), skip line-item union.
  if (headerMatchIds.length > 0 && !shouldUnionSaleItemsForPosSearch(searchStr)) {
    return { saleTextFilter, restrictToIds: headerMatchIds };
  }

  let matchingSaleIds: string[] = [];
  let searchMeta: PosDashboardSearchMeta | undefined;
  if (shouldUnionSaleItemsForPosSearch(searchStr)) {
    const result = await fetchPosSaleIdsMatchingLineItems(
      client,
      filters.organizationId,
      filters,
      searchStr,
      1000,
    );
    matchingSaleIds = result.saleIds;
    searchMeta = result.meta;
  }


  if (matchingSaleIds.length > 0) {
    const allMatchIds = [...new Set([...headerMatchIds, ...matchingSaleIds])];
    return { saleTextFilter, restrictToIds: allMatchIds, searchMeta };
  }

  // No line-item hits — apply the same header text filter the list/count queries already scope.
  return { saleTextFilter, restrictToIds: null, searchMeta };
}


function applyResolvedPosSearch(query: any, resolution: PosSearchResolution | null): any {
  if (!resolution) return query;
  if (resolution.restrictToCustomerId) {
    return query.eq("customer_id", resolution.restrictToCustomerId);
  }
  if (resolution.restrictToIds && resolution.restrictToIds.length > 0) {
    return query.in("id", resolution.restrictToIds);
  }
  return query.or(resolution.saleTextFilter);
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

/** Ledger-consistent paid / status / balance (matches Customer Payment + invoice dashboard). */
async function enrichPosSalesWithReceiptSettlement(
  client: SupabaseClient,
  organizationId: string,
  sales: any[],
  options?: { voucherDateFrom?: string | null; voucherDateTo?: string | null },
): Promise<any[]> {
  if (!organizationId || sales.length === 0) return sales;

  // Only rows that can still change need the voucher crawl. Cancelled / hold /
  // already fully-paid bills are skipped so the fan-out stays small on big orgs.
  const needsSettlement = (sale: any): boolean => {
    if (sale.is_cancelled || sale.payment_status === "cancelled" || sale.payment_status === "hold") {
      return false;
    }
    const net = Number(sale.net_amount || 0) - Number(sale.sale_return_adjust || 0);
    const paid = Number(sale.paid_amount || 0);
    return !(sale.payment_status === "completed" && paid + 0.5 >= net);
  };

  const pending = sales.filter(needsSettlement);
  if (pending.length === 0) return sales;

  const invoiceRefs = pending.map((sale) => ({
    id: sale.id,
    sale_number: sale.sale_number,
    customer_id: sale.customer_id,
    net_amount: sale.net_amount,
    sale_return_adjust: sale.sale_return_adjust,
  }));

  // One voucher crawl → both settlement split and Cash/Card/UPI mode maps.
  // Previously these ran in parallel and each re-fetched the same receipt rows (~2× latency).
  const voucherRows = await fetchSaleReceiptVoucherRowsForInvoices(
    client,
    organizationId,
    invoiceRefs,
    {
      voucherDateFrom: options?.voucherDateFrom,
      voucherDateTo: options?.voucherDateTo,
    },
  );
  const splitBySale = buildSaleReceiptSplitMap(invoiceRefs, voucherRows);
  const modeBySale = buildSaleReceiptModeAmountMap(invoiceRefs, voucherRows);

  return sales.map((sale) => {
    if (!needsSettlement(sale)) {
      if (sale.is_cancelled || sale.payment_status === "cancelled" || sale.payment_status === "hold") {
        return sale;
      }
      // Settled rows keep the same at-sale mode capping the KPI strip uses.
      const modes = getPosPaymentModeDisplayAmounts(sale);
      return { ...sale, cash_amount: modes.cash, card_amount: modes.card, upi_amount: modes.upi };
    }
    const rec = reconcileSaleInvoiceWithSplit(sale, splitBySale.get(sale.id) ?? null);
    const enrichedSale = {
      ...sale,
      paid_amount: rec.paid_amount,
      payment_status: rec.payment_status,
      pos_outstanding: rec.outstanding,
    };
    const displayModes = getPosPaymentModeDisplayAmounts(
      enrichedSale,
      modeBySale.get(sale.id) ?? null,
    );
    return {
      ...enrichedSale,
      cash_amount: displayModes.cash,
      card_amount: displayModes.card,
      upi_amount: displayModes.upi,
    };
  });
}

/** Receipt settlement for visible POS rows (call after enrichPosSalesWithCreditNotes). */
export async function reconcilePosDashboardRows(
  client: SupabaseClient,
  organizationId: string,
  sales: any[],
  options?: { voucherDateFrom?: string | null; voucherDateTo?: string | null },
): Promise<any[]> {
  if (sales.length === 0) return [];
  return enrichPosSalesWithReceiptSettlement(client, organizationId, sales, options);
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
    totalAmount: nonHoldSales.reduce((sum, sale) => sum + getSaleReportGrossAmount(sale), 0),
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
    ...(() => {
      let totalCash = 0;
      let totalCard = 0;
      let totalUpi = 0;
      let cashBillCount = 0;
      let cardBillCount = 0;
      let upiBillCount = 0;
      for (const sale of nonHoldSales) {
        const modes = getPosPaymentModeDisplayAmounts(sale);
        totalCash += modes.cash;
        totalCard += modes.card;
        totalUpi += modes.upi;
        if (modes.cash > 0) cashBillCount += 1;
        if (modes.card > 0) cardBillCount += 1;
        if (modes.upi > 0) upiBillCount += 1;
      }
      return { totalCash, totalCard, totalUpi, cashBillCount, cardBillCount, upiBillCount };
    })(),
    totalBalance: nonHoldSales.reduce(
      (sum, sale) => sum + getPosSaleOutstandingBalance(sale),
      0,
    ),
    totalSaleReturnAdjust: nonHoldSales.reduce(
      (sum, sale) => sum + Number(sale.sale_return_adjust || 0),
      0,
    ),
    totalRoundOff: nonHoldSales.reduce((sum, sale) => sum + Number(sale.round_off || 0), 0),
  };
}

export async function fetchPosDashboardPage(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  options: PosDashboardPageOptions,
): Promise<PosDashboardPageResult> {
  if (!filters.organizationId) {
    return { sales: [], creditNoteUsage: {}, totalCount: 0 };
  }

  const reconcile = options.reconcile !== false;
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;

  // Resolve search once — count + page previously each ran sale_items ILIKE batches.
  const searchResolution = await withDashboardTimeout(
    resolvePosSearch(client, filters),
    "POS dashboard search resolution",
  );

  const [totalCount, dataResult] = await Promise.all([
    countFilteredPosSales(client, filters, searchResolution),
    (async () => {
      let query: any = buildPosDashboardBaseQuery(
        client,
        filters,
        POS_DASHBOARD_SALES_SELECT,
      ).range(from, to);
      query = applyResolvedPosSearch(query, searchResolution);
      return query;
    })(),
  ]);
  const { data, error } = await dataResult;
  if (error) throw error;

  const pageRows = data || [];
  if (pageRows.length === 0) {
    return { sales: [], creditNoteUsage: {}, totalCount, searchMeta: searchResolution?.searchMeta };
  }

  const enriched = await enrichPosSalesWithCreditNotes(pageRows);
  const bounded = resolvePosDashboardDateRange(filters.startDate, filters.endDate);
  const voucherDateFrom = resolvePosDashboardVoucherLookbackFrom(
    bounded.startDate,
    bounded.endDate,
  );
  const settlementOpts = {
    voucherDateFrom,
    voucherDateTo: bounded.endDate || null,
  };

  if (!reconcile) {
    const quickSales = enriched.sales.map(applyQuickPosDisplayFields);
    const rankedSales = filters.search.trim()
      ? rankPosDashboardSearchResults(quickSales, filters.search)
      : quickSales;
    return {
      sales: rankedSales,
      creditNoteUsage: enriched.creditNoteUsage,
      totalCount,
      sourceRows: enriched.sales,
      searchMeta: searchResolution?.searchMeta,
    };
  }

  const settled = await enrichPosSalesWithReceiptSettlement(
    client,
    filters.organizationId,
    enriched.sales,
    settlementOpts,
  );
  const rankedSales = filters.search.trim()
    ? rankPosDashboardSearchResults(settled, filters.search)
    : settled;
  return {
    sales: rankedSales,
    creditNoteUsage: enriched.creditNoteUsage,
    totalCount,
    searchMeta: searchResolution?.searchMeta,
  };
}


/**
 * Lightweight summary scan — sale columns only.
 * Do NOT receipt-enrich here: mode correction / KPI fallback only need at-sale
 * cash/card/upi capping via getPosPaymentModeDisplayAmounts(sale). Receipt enrich
 * on every summary row was starving the table fetch and leaving the skeleton up.
 */
async function scanPosDashboardSummaryRows(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  select: string,
): Promise<PosDashboardSaleLike[]> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  const allRows: PosDashboardSaleLike[] = [];
  // Resolve once — the previous per-page applyPosSearchToQuery re-ran sale_items ILIKE every 1000 rows.
  const searchResolution = await withDashboardTimeout(

    resolvePosSearch(client, filters),
    "POS dashboard summary search resolution",
  );

  while (true) {

    let query: any = buildPosDashboardBaseQuery(client, filters, select).range(
      offset,
      offset + PAGE_SIZE - 1,
    );
    query = applyResolvedPosSearch(query, searchResolution);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allRows.push(...(data as PosDashboardSaleLike[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

const POS_DASHBOARD_MODE_CORRECT_SELECT =
  "id, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, net_amount, paid_amount, payment_status, payment_method, sale_number, cash_amount, card_amount, upi_amount, sale_return_adjust, round_off, is_cancelled";

/**
 * When mix over-tender inflated cash_amount, RPC SUM(cash_amount) exceeds net sale.
 * Recompute mode totals with the same display cap used by table rows.
 */
async function correctPosDashboardModeTotalsIfNeeded(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  rpcStats: PosDashboardSummaryStats,
): Promise<PosDashboardSummaryStats> {
  const modeSum = rpcStats.totalCash + rpcStats.totalCard + rpcStats.totalUpi;
  if (modeSum <= rpcStats.netSale + 1) return rpcStats;

  try {
    const rows = await scanPosDashboardSummaryRows(
      client,
      filters,
      POS_DASHBOARD_MODE_CORRECT_SELECT,
    );
    if (rows.length === 0) return rpcStats;
    const modeStats = computePosDashboardSummaryStats(rows);
    return {
      ...rpcStats,
      totalCash: modeStats.totalCash,
      totalCard: modeStats.totalCard,
      totalUpi: modeStats.totalUpi,
      cashBillCount: modeStats.cashBillCount,
      cardBillCount: modeStats.cardBillCount,
      upiBillCount: modeStats.upiBillCount,
    };
  } catch (err) {
    console.warn("POS dashboard mode-total correction skipped:", err);
    return rpcStats;
  }
}

export function posDashboardModeTotalsNeedCorrection(stats: PosDashboardSummaryStats): boolean {
  const modeSum = stats.totalCash + stats.totalCard + stats.totalUpi;
  return modeSum > stats.netSale + 1;
}

/**
 * Recompute cash/card/UPI totals when mix over-tender inflated RPC mode sums.
 * Call in a background query — can scan the full filtered range.
 */
export async function correctPosDashboardSummaryModeTotals(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  rpcStats: PosDashboardSummaryStats,
): Promise<PosDashboardSummaryStats> {
  return correctPosDashboardModeTotalsIfNeeded(client, filters, rpcStats);
}

export type FetchPosDashboardSummaryOptions = {
  /** When false, return RPC stats immediately (mode correction in background). Default true. */
  correctModeTotals?: boolean;
};

export async function fetchPosDashboardSummary(
  client: SupabaseClient,
  filters: PosDashboardFilters,
  options?: FetchPosDashboardSummaryOptions,
): Promise<PosDashboardSummaryStats> {
  if (!filters.organizationId) return { ...EMPTY_POS_SUMMARY };

  // KPI strip ignores Paid/Pending/method table filters so mix+credit (partial) bills
  // still move Total Bills / Pending / Cash totals while the list stays filtered.
  const summaryFilters = buildPosDashboardSummaryScopeFilters(filters);

  if (!isPosDashboardStatsRpcUnavailable()) {
    try {
      const rpcStats = await fetchPosDashboardSummaryViaRpc(client, summaryFilters);
      if (options?.correctModeTotals === false) {
        return reconcilePosDashboardUnpaidCounts(rpcStats);
      }
      const corrected = await correctPosDashboardModeTotalsIfNeeded(
        client,
        summaryFilters,
        rpcStats,
      );
      return reconcilePosDashboardUnpaidCounts(corrected);
    } catch (err) {
      if (!isPosDashboardStatsRpcNotFoundError(err as { code?: string; message?: string; status?: number })) {
        console.warn("get_pos_dashboard_stats RPC threw, using client fallback:", err);
      }
    }
  }

  const totalCount = await countFilteredPosSales(client, summaryFilters);
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
      const allRows = await scanPosDashboardSummaryRows(client, summaryFilters, select);
      if (allRows.length > 0) {
        return reconcilePosDashboardUnpaidCounts(computePosDashboardSummaryStats(allRows));
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
  // Summary scope ignores status/method filters, so totalBills can exceed filtered list count.
  if (stats.totalBills < 0) return false;
  if (stats.totalBills === 0) return true;
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

/**
 * Some RPC builds count only payment_status=pending and omit partial (mix+credit).
 * Derive unpaid bill count from the residual so Pending KPI stays truthful.
 */
export function reconcilePosDashboardUnpaidCounts(
  stats: PosDashboardSummaryStats,
): PosDashboardSummaryStats {
  const unpaidBills = Math.max(
    0,
    stats.totalBills - stats.completedCount - stats.holdCount,
  );
  if (unpaidBills === stats.pendingCount) return stats;
  return { ...stats, pendingCount: unpaidBills };
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
  const searchResolution = await withDashboardTimeout(
    resolvePosSearch(client, filters),
    "POS dashboard export search resolution",
  );

  while (true) {

    let query: any = buildPosDashboardBaseQuery(
      client,
      filters,
      POS_DASHBOARD_SALES_SELECT,
    ).range(offset, offset + PAGE_SIZE - 1);
    query = applyResolvedPosSearch(query, searchResolution);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    allSales.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const enriched = await enrichPosSalesWithCreditNotes(allSales);
  return { ...enriched, searchMeta: searchResolution?.searchMeta };
}


export const POS_DASHBOARD_QUERY_KEY = "pos-dashboard-sales" as const;

export type PosDashboardPaymentPatch = {
  paid_amount: number;
  payment_status: string;
  payment_method?: string;
  /** Previous status — used to shift summary Pending → Paid without waiting on refetch. */
  prevPaymentStatus?: string;
  netAmount?: number;
  outstandingCleared?: number;
};

function applyPosDashboardPaymentPatchToRow(
  sale: Record<string, unknown> | null | undefined,
  saleId: string,
  patch: PosDashboardPaymentPatch,
): Record<string, unknown> | null | undefined {
  if (!sale || sale.id !== saleId) return sale;
  const next = {
    ...sale,
    paid_amount: patch.paid_amount,
    payment_status: patch.payment_status,
    ...(patch.payment_method ? { payment_method: patch.payment_method } : {}),
  };
  return {
    ...next,
    pos_outstanding: getPosSaleOutstandingBalance(next as PosDashboardSaleLike),
  };
}

/**
 * Show Paid immediately after Record Payment by patching cached page / reconcile
 * rows (same idea as seedPosDashboardCacheWithSale).
 */
export function patchPosDashboardSalePayment(
  queryClient: QueryClient,
  organizationId: string,
  saleId: string,
  patch: PosDashboardPaymentPatch,
): void {
  if (!organizationId || !saleId) return;

  const queries = queryClient.getQueryCache().findAll({
    queryKey: [POS_DASHBOARD_QUERY_KEY, organizationId],
  });

  for (const query of queries) {
    const key = query.queryKey as unknown[];
    const data = query.state.data;
    if (data == null) continue;

    if (key[2] === "summary") {
      const stats = data as PosDashboardSummaryStats;
      const prev = String(patch.prevPaymentStatus || "");
      const becameCompleted =
        prev !== "completed" && patch.payment_status === "completed";
      if (!becameCompleted) continue;
      const net = Number(patch.netAmount || 0);
      const cleared = Number(patch.outstandingCleared ?? net);
      queryClient.setQueryData(key, {
        ...stats,
        completedCount: stats.completedCount + 1,
        completedAmount: stats.completedAmount + net,
        pendingCount: Math.max(0, stats.pendingCount - 1),
        pendingAmount: Math.max(0, stats.pendingAmount - cleared),
        totalBalance: Math.max(0, stats.totalBalance - cleared),
      });
      continue;
    }

    if (Array.isArray(data)) {
      queryClient.setQueryData(
        key,
        data.map((row) => applyPosDashboardPaymentPatchToRow(row, saleId, patch)),
      );
      continue;
    }

    if (typeof data === "object" && data !== null && "sales" in data) {
      const payload = data as PosDashboardPageResult;
      queryClient.setQueryData(key, {
        ...payload,
        sales: (payload.sales || []).map((row) =>
          applyPosDashboardPaymentPatchToRow(row, saleId, patch),
        ),
        ...(payload.sourceRows
          ? {
              sourceRows: payload.sourceRows.map((row) =>
                applyPosDashboardPaymentPatchToRow(row, saleId, patch),
              ),
            }
          : {}),
      });
    }
  }
}

/** Invalidate table page and summary tiles after a POS dashboard mutation. */
export function invalidatePosDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
  options?: { refetchType?: "all" | "active" | "none" },
) {
  queryClient.invalidateQueries({
    queryKey: organizationId
      ? [POS_DASHBOARD_QUERY_KEY, organizationId]
      : [POS_DASHBOARD_QUERY_KEY],
    // Default "all" so inactive tab-cached dashboard queries refresh after POS save.
    refetchType: options?.refetchType ?? "all",
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
