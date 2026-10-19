import { supabase } from "@/integrations/supabase/client";
import { localDayBounds } from "@/lib/localDayBounds";

const PAGE_SIZE = 1000;

/**
 * Sum of `sales.sale_return_adjust` (S/R credit used on bills) for a calendar
 * range. Same row filter as v_dashboard_sales_summary, so
 * `total_sales − this` matches the POS Dashboard "Net Sale" (netSale − S/R Adj).
 */
export async function fetchSaleReturnAdjustTotal(
  orgId: string,
  startYmd: string,
  endYmd: string,
): Promise<number> {
  const { startIso, endIso } = localDayBounds(startYmd, endYmd);
  let total = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_return_adjust")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .or("is_cancelled.is.null,is_cancelled.eq.false")
      .gt("sale_return_adjust", 0)
      .gte("sale_date", startIso)
      .lte("sale_date", endIso)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) total += Number(r.sale_return_adjust) || 0;
    if (rows.length < PAGE_SIZE) break;
  }
  return total;
}

/**
 * get_erp_dashboard_stats with `total_sales` net of S/R credit used on bills,
 * so Main Dashboard / mobile Home "Sale" matches POS Dashboard Net Sale.
 * If the S/R sum fails, the RPC total is shown unchanged.
 */
export async function fetchErpDashboardStatsAfterSr<T extends { total_sales: number }>(
  orgId: string,
  startYmd: string,
  endYmd: string,
): Promise<T | null> {
  const [{ data, error }, srAdjust] = await Promise.all([
    supabase.rpc("get_erp_dashboard_stats", {
      p_org_id: orgId,
      p_start_date: startYmd,
      p_end_date: endYmd,
    }),
    fetchSaleReturnAdjustTotal(orgId, startYmd, endYmd).catch(() => 0),
  ]);
  if (error) throw error;
  const stats = data as unknown as T | null;
  if (!stats) return stats;
  return { ...stats, total_sales: (Number(stats.total_sales) || 0) - srAdjust };
}
