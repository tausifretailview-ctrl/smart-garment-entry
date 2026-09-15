import { supabase } from "@/integrations/supabase/client";
import type { DailyIncentiveBracket } from "@/utils/dailySalesmanIncentive";

export type DailyIncentiveDayRow = {
  id?: string;
  employee_id: string | null;
  employee_name: string;
  incentive_date: string;
  total_qty: number;
  total_net_amount: number;
  is_eligible: boolean;
  incentive_amount: number;
  is_locked: boolean;
  computed_at?: string;
};

export async function fetchDailyIncentiveConfig(organizationId: string): Promise<{
  qty_threshold: number;
  is_enabled: boolean;
  brackets: DailyIncentiveBracket[];
} | null> {
  const { data: config, error: configError } = await (supabase as any)
    .from("daily_salesman_incentive_configs")
    .select("organization_id, qty_threshold, is_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (configError) throw configError;
  if (!config?.is_enabled) return null;

  const { data: brackets, error: bracketError } = await (supabase as any)
    .from("daily_salesman_incentive_brackets")
    .select("min_net_amount, max_net_amount, incentive_amount, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  if (bracketError) throw bracketError;

  return {
    qty_threshold: Number(config.qty_threshold),
    is_enabled: true,
    brackets: (brackets || []) as DailyIncentiveBracket[],
  };
}

function mapRpcDayRow(r: Record<string, unknown>): DailyIncentiveDayRow {
  return {
    id: r.id as string | undefined,
    employee_id: (r.employee_id as string | null) ?? null,
    employee_name: String(r.employee_name || ""),
    incentive_date: String(r.incentive_date || ""),
    total_qty: Number(r.total_qty) || 0,
    total_net_amount: Number(r.total_net_amount) || 0,
    is_eligible: !!r.is_eligible,
    incentive_amount: Number(r.incentive_amount) || 0,
    is_locked: !!r.is_locked,
    computed_at: r.computed_at as string | undefined,
  };
}

/**
 * Load daily incentive rows for a date range via server-side sync RPC.
 *
 * - Past IST days: locked snapshots win (no recompute on visit).
 * - Missing past days: computed once in SQL, stored locked.
 * - Today (IST): recomputed live in SQL, stored unlocked.
 */
export async function loadOrComputeDailyIncentiveDays(params: {
  organizationId: string;
  startYmd: string;
  endYmd: string;
}): Promise<DailyIncentiveDayRow[]> {
  const config = await fetchDailyIncentiveConfig(params.organizationId);
  if (!config) return [];

  const { data, error } = await (supabase as any).rpc("sync_daily_salesman_incentive_days", {
    p_org_id: params.organizationId,
    p_start_date: params.startYmd,
    p_end_date: params.endYmd,
  });
  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(mapRpcDayRow);
}
