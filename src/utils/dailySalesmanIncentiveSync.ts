import { eachDayOfInterval, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { istCalendarYmd, istDayBounds } from "@/lib/localDayBounds";
import {
  aggregateDailySalesmanIncentive,
  type DailyIncentiveBracket,
  type DailyIncentiveComputedRow,
} from "@/utils/dailySalesmanIncentive";

export type DailyIncentiveDayRow = DailyIncentiveComputedRow & {
  id?: string;
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

function ymdRange(startYmd: string, endYmd: string): string[] {
  const start = parseISO(startYmd);
  const end = parseISO(endYmd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

async function loadStoredDays(
  organizationId: string,
  startYmd: string,
  endYmd: string,
): Promise<DailyIncentiveDayRow[]> {
  const { data, error } = await (supabase as any)
    .from("daily_salesman_incentive_days")
    .select(
      "id, employee_id, employee_name, incentive_date, total_qty, total_net_amount, is_eligible, incentive_amount, is_locked, computed_at",
    )
    .eq("organization_id", organizationId)
    .gte("incentive_date", startYmd)
    .lte("incentive_date", endYmd)
    .order("incentive_date", { ascending: false })
    .order("employee_name", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    incentive_date: r.incentive_date,
    total_qty: Number(r.total_qty) || 0,
    total_net_amount: Number(r.total_net_amount) || 0,
    is_eligible: !!r.is_eligible,
    incentive_amount: Number(r.incentive_amount) || 0,
    is_locked: !!r.is_locked,
    computed_at: r.computed_at,
  }));
}

async function computeDayFromSales(
  organizationId: string,
  incentiveDateYmd: string,
  qtyThreshold: number,
  brackets: DailyIncentiveBracket[],
): Promise<DailyIncentiveComputedRow[]> {
  const bounds = istDayBounds(incentiveDateYmd);
  if (!bounds) return [];

  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, salesman, net_amount, sale_date, deleted_at, is_cancelled")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .gte("sale_date", bounds.startIso)
    .lte("sale_date", bounds.endIso);
  if (salesError) throw salesError;

  const saleRows = (sales || []).map((s) => ({
    id: s.id,
    salesman: s.salesman,
    net_amount: s.net_amount,
    sale_date: s.sale_date,
    deleted_at: s.deleted_at,
    is_cancelled: s.is_cancelled,
  }));

  const saleIds = saleRows.map((s) => s.id);
  let items: { sale_id: string; quantity: number | null; line_total: number | null; net_after_discount: number | null }[] = [];
  if (saleIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, line_total, net_after_discount")
      .in("sale_id", saleIds)
      .is("deleted_at", null);
    if (itemsError) throw itemsError;
    items = (itemRows || []).map((i) => ({
      sale_id: i.sale_id,
      quantity: i.quantity,
      line_total: i.line_total,
      net_after_discount: i.net_after_discount,
    }));
  }

  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, employee_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (empError) throw empError;

  return aggregateDailySalesmanIncentive({
    incentiveDateYmd,
    sales: saleRows,
    items,
    employees: employees || [],
    qtyThreshold,
    brackets,
  });
}

async function upsertDayRows(
  organizationId: string,
  rows: DailyIncentiveComputedRow[],
  lock: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    organization_id: organizationId,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    incentive_date: r.incentive_date,
    total_qty: r.total_qty,
    total_net_amount: r.total_net_amount,
    is_eligible: r.is_eligible,
    incentive_amount: r.incentive_amount,
    is_locked: lock,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await (supabase as any)
    .from("daily_salesman_incentive_days")
    .upsert(payload, { onConflict: "organization_id,employee_name,incentive_date" });
  if (error) throw error;
}

/**
 * Load daily incentive rows for a date range.
 *
 * Timing:
 * - Past IST days: locked snapshots win (returns must not reverse earned ₹).
 *   Missing past days are computed once from sales and stored locked.
 * - Today (IST): recompute from live sales and upsert unlocked so late bills count.
 */
export async function loadOrComputeDailyIncentiveDays(params: {
  organizationId: string;
  startYmd: string;
  endYmd: string;
}): Promise<DailyIncentiveDayRow[]> {
  const config = await fetchDailyIncentiveConfig(params.organizationId);
  if (!config) return [];

  const today = istCalendarYmd();
  const days = ymdRange(params.startYmd, params.endYmd);
  const stored = await loadStoredDays(params.organizationId, params.startYmd, params.endYmd);
  const storedByDate = new Map<string, DailyIncentiveDayRow[]>();
  for (const row of stored) {
    const list = storedByDate.get(row.incentive_date) || [];
    list.push(row);
    storedByDate.set(row.incentive_date, list);
  }

  const out: DailyIncentiveDayRow[] = [];

  for (const ymd of days) {
    const existing = storedByDate.get(ymd) || [];
    const lockedByName = new Map(
      existing.filter((r) => r.is_locked).map((r) => [r.employee_name, r] as const),
    );
    const allLocked = existing.length > 0 && existing.every((r) => r.is_locked);
    const isPast = ymd < today;
    const isToday = ymd === today;

    if (isPast && allLocked) {
      out.push(...existing);
      continue;
    }

    if (isPast) {
      const computed = await computeDayFromSales(
        params.organizationId,
        ymd,
        config.qty_threshold,
        config.brackets,
      );
      const toLock = computed.filter((c) => !lockedByName.has(c.employee_name));
      await upsertDayRows(params.organizationId, toLock, true);
      const merged = new Map<string, DailyIncentiveDayRow>();
      for (const r of lockedByName.values()) merged.set(r.employee_name, r);
      for (const r of toLock) {
        merged.set(r.employee_name, {
          ...r,
          is_locked: true,
          computed_at: new Date().toISOString(),
        });
      }
      out.push(...merged.values());
      continue;
    }

    if (isToday) {
      const computed = await computeDayFromSales(
        params.organizationId,
        ymd,
        config.qty_threshold,
        config.brackets,
      );
      const unlocked = computed.filter((c) => !lockedByName.has(c.employee_name));
      await upsertDayRows(params.organizationId, unlocked, false);
      out.push(
        ...computed.map((r) => {
          const locked = lockedByName.get(r.employee_name);
          if (locked) return locked;
          return { ...r, is_locked: false, computed_at: new Date().toISOString() };
        }),
      );
    }
  }

  return out.sort((a, b) => {
    const d = b.incentive_date.localeCompare(a.incentive_date);
    if (d !== 0) return d;
    return a.employee_name.localeCompare(b.employee_name);
  });
}
