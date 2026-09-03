import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape matches `v_dashboard_stock_summary` / `get_dashboard_stock_summary`. */
export type DashboardStockSummaryRow = {
  organization_id: string;
  total_stock_qty: number;
  total_stock_value: number;
  total_sale_value: number;
  total_variant_count: number;
};

/** Row shape matches `v_dashboard_purchase_summary` / `get_dashboard_purchase_summary`. */
export type DashboardPurchaseSummaryRow = {
  organization_id: string;
  purchase_day: string;
  bill_count: number;
  total_purchase_amount: number;
  total_paid_amount: number;
  total_pending_amount: number;
  total_items_purchased: number;
};

/**
 * StatusBar stock tile. Same numbers as `v_dashboard_stock_summary`
 * (maybeSingle): empty org → null, caller uses `?? 0`.
 * On-hand qty is `product_variants.stock_qty` after Phase 7 migrate.
 */
export async function fetchDashboardStockSummary(
  client: SupabaseClient,
  orgId: string,
): Promise<DashboardStockSummaryRow | null> {
  const { data, error } = await client.rpc("get_dashboard_stock_summary", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const rows = (data ?? []) as DashboardStockSummaryRow[];
  return rows[0] ?? null;
}

/**
 * Main Dashboard purchase trend. Same rows as
 * `v_dashboard_purchase_summary` filtered `.gte("purchase_day", fromDay)`.
 */
export async function fetchDashboardPurchaseSummary(
  client: SupabaseClient,
  orgId: string,
  fromDay?: string | null,
): Promise<DashboardPurchaseSummaryRow[]> {
  const { data, error } = await client.rpc("get_dashboard_purchase_summary", {
    p_org_id: orgId,
    p_from_day: fromDay ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as DashboardPurchaseSummaryRow[];
}
