import { supabase } from "@/integrations/supabase/client";
import type { ProfitDataset } from "@/utils/netProfitAnalysis";

/** Parity ceiling vs sumLines — same rupee band as sale settlement. */
export const NPA_KPI_PARITY_TOLERANCE = 0.5;

/** Query-key head shared by Index, OwnerDashboard, and Refresh. */
export const NET_PROFIT_KPI_QUERY_HEAD = "net-profit-kpis";

/** Stored dashboard net (v_dashboard_sales_summary / sales.net_amount after disc & S/R). */
export const STORED_NET_CAPTION = "Stored net after disc & S/R";

/** NPA engine net (before returns) minus qty-weighted COGS. */
export const NPA_NET_PROFIT_CAPTION = "NPA net (before returns) − COGS";

export const NPA_MARGIN_CAPTION = "NPA margin on NPA-net";

export type NetProfitKpis = {
  gross_sales: number;
  discounts: number;
  round_off: number;
  net_sales: number;
  return_amount: number;
  total_cogs: number;
  gross_profit: number;
  margin_percent: number;
  invoice_count: number;
};

export function emptyNetProfitKpis(): NetProfitKpis {
  return {
    gross_sales: 0,
    discounts: 0,
    round_off: 0,
    net_sales: 0,
    return_amount: 0,
    total_cogs: 0,
    gross_profit: 0,
    margin_percent: 0,
    invoice_count: 0,
  };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseNetProfitKpis(data: unknown): NetProfitKpis {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    gross_sales: num(row.gross_sales),
    discounts: num(row.discounts),
    round_off: num(row.round_off),
    net_sales: num(row.net_sales),
    return_amount: num(row.return_amount),
    total_cogs: num(row.total_cogs),
    gross_profit: num(row.gross_profit),
    margin_percent: num(row.margin_percent),
    invoice_count: Math.round(num(row.invoice_count)),
  };
}

export function netProfitKpisFromTotals(
  totals: ProfitDataset["totals"],
  invoiceCount: number,
): NetProfitKpis {
  return {
    gross_sales: totals.grossSales,
    discounts: totals.totalDiscounts,
    round_off: totals.roundOff,
    net_sales: totals.netSales,
    return_amount: totals.returnAmount,
    total_cogs: totals.totalCOGS,
    gross_profit: totals.grossProfit,
    margin_percent: totals.marginPercent,
    invoice_count: invoiceCount,
  };
}

/**
 * IST calendar-day bounds loadProfitDataset sends to PostgREST.
 * The business day is Asia/Kolkata — naive strings would be read as UTC and
 * silently drop POS bills billed before 05:30 IST / after 00:00 IST rollover.
 */
export function npaTimestampBounds(fromDate: string, toDate: string) {
  return {
    fromTimestamp: `${fromDate}T00:00:00.000+05:30`,
    toTimestamp: `${toDate}T23:59:59.999+05:30`,
  };
}

export async function fetchNetProfitKpis(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<NetProfitKpis> {
  const { data, error } = await supabase.rpc("get_net_profit_kpis", {
    p_org_id: organizationId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw error;
  return parseNetProfitKpis(data);
}
