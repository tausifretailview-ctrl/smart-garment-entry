import { supabase } from "@/integrations/supabase/client";
import {
  incentiveSettingsAreEditable,
  type DailyIncentiveBillSlab,
  type DailyIncentiveBracket,
} from "@/utils/dailySalesmanIncentive";

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

export type DailyIncentiveConfig = {
  qty_threshold: number;
  is_enabled: boolean;
  brackets: DailyIncentiveBracket[];
  billSlabs: DailyIncentiveBillSlab[];
};

export async function fetchDailyIncentiveConfig(
  organizationId: string,
): Promise<DailyIncentiveConfig | null> {
  const { data: config, error: configError } = await (supabase as any)
    .from("daily_salesman_incentive_configs")
    .select("organization_id, qty_threshold, is_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (configError) throw configError;
  if (!config) return null;

  const { data: brackets, error: bracketError } = await (supabase as any)
    .from("daily_salesman_incentive_brackets")
    .select("min_net_amount, max_net_amount, incentive_amount, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  if (bracketError) throw bracketError;

  const { data: slabs, error: slabError } = await (supabase as any)
    .from("daily_salesman_incentive_bill_slabs")
    .select("min_bill_amount, incentive_amount, sort_order")
    .eq("organization_id", organizationId)
    .order("min_bill_amount", { ascending: true });
  if (slabError) {
    console.error("daily incentive bill slabs:", slabError);
  }

  return {
    qty_threshold: Number(config.qty_threshold),
    is_enabled: config.is_enabled === true,
    brackets: (brackets || []) as DailyIncentiveBracket[],
    billSlabs: slabError ? [] : ((slabs || []) as DailyIncentiveBillSlab[]),
  };
}

export type DailyIncentiveSettingsInput = {
  organizationId: string;
  isEnabled: boolean;
  qtyThreshold: number;
  perPieceAmount: number;
  billSlabs: DailyIncentiveBillSlab[];
};

/** Writes one organization's incentive settings. ADEEBAAREEBA rows are refused. */
export async function saveDailyIncentiveSettings(input: DailyIncentiveSettingsInput): Promise<void> {
  if (!incentiveSettingsAreEditable(input.organizationId)) {
    throw new Error("ADEEBAAREEBA daily incentive settings stay as they are.");
  }
  const qty = Number(input.qtyThreshold);
  const perPiece = Number(input.perPieceAmount);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Minimum quantity must be zero or more.");
  if (!Number.isFinite(perPiece) || perPiece < 0) throw new Error("Per piece amount must be zero or more.");

  const slabs = input.billSlabs
    .map((slab, index) => ({
      min_bill_amount: Number(slab.min_bill_amount),
      incentive_amount: Number(slab.incentive_amount),
      sort_order: index + 1,
    }))
    .filter((slab) => slab.min_bill_amount > 0 || slab.incentive_amount > 0);
  for (const slab of slabs) {
    if (!Number.isFinite(slab.min_bill_amount) || slab.min_bill_amount < 0) {
      throw new Error("Bill amount must be zero or more.");
    }
    if (!Number.isFinite(slab.incentive_amount) || slab.incentive_amount < 0) {
      throw new Error("Bill incentive must be zero or more.");
    }
  }

  const { error: configError } = await (supabase as any)
    .from("daily_salesman_incentive_configs")
    .upsert(
      {
        organization_id: input.organizationId,
        qty_threshold: qty,
        is_enabled: input.isEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (configError) throw configError;

  const { error: deleteBracketError } = await (supabase as any)
    .from("daily_salesman_incentive_brackets")
    .delete()
    .eq("organization_id", input.organizationId);
  if (deleteBracketError) throw deleteBracketError;

  const { error: insertBracketError } = await (supabase as any)
    .from("daily_salesman_incentive_brackets")
    .insert({
      organization_id: input.organizationId,
      min_net_amount: 0,
      max_net_amount: null,
      incentive_amount: perPiece,
      sort_order: 1,
    });
  if (insertBracketError) throw insertBracketError;

  const { error: deleteSlabError } = await (supabase as any)
    .from("daily_salesman_incentive_bill_slabs")
    .delete()
    .eq("organization_id", input.organizationId);
  if (deleteSlabError) throw deleteSlabError;

  if (slabs.length === 0) return;
  const { error: insertSlabError } = await (supabase as any)
    .from("daily_salesman_incentive_bill_slabs")
    .insert(
      slabs.map((slab) => ({
        organization_id: input.organizationId,
        min_bill_amount: slab.min_bill_amount,
        incentive_amount: slab.incentive_amount,
        sort_order: slab.sort_order,
      })),
    );
  if (insertSlabError) throw insertSlabError;
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
  if (!config?.is_enabled) return [];

  const { data, error } = await (supabase as any).rpc("sync_daily_salesman_incentive_days", {
    p_org_id: params.organizationId,
    p_start_date: params.startYmd,
    p_end_date: params.endYmd,
  });
  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(mapRpcDayRow);
}
