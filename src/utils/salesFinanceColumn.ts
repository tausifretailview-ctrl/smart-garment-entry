/**
 * sales.finance_amount (migration 20261231160000) is applied by hand, separately from the
 * frontend deploy. Writing an unknown column would fail every POS save, so the app checks once
 * whether the column exists and only then includes it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

let probe: Promise<boolean> | null = null;

export function salesHasFinanceColumn(client: SupabaseClient): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const { error } = await client.from("sales").select("finance_amount").limit(1);
        return !error;
      } catch {
        return false;
      }
    })();
  }
  return probe;
}

/** Fields to spread into a sales insert/update. Empty when the column is not there yet. */
export async function salesFinanceFields(
  client: SupabaseClient,
  financeAmount: number,
): Promise<{ finance_amount?: number }> {
  if (!(await salesHasFinanceColumn(client))) return {};
  return { finance_amount: Math.round(Math.max(0, Number(financeAmount) || 0) * 100) / 100 };
}

/** For tests only. */
export function resetSalesFinanceColumnProbe() {
  probe = null;
}

/** Card part of a stored bill once the finance part is split out. */
export function splitCardAndFinance(
  cardAmount: number | null | undefined,
  financeAmount: number | null | undefined,
): { card: number; finance: number } {
  const total = Math.max(0, Number(cardAmount) || 0);
  const finance = Math.min(total, Math.max(0, Number(financeAmount) || 0));
  return { card: Math.round((total - finance) * 100) / 100, finance };
}
