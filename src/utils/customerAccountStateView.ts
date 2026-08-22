import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";
import {
  accountFacetsFromFinancialSnapshot,
  fetchCustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";

/** One unused advance booking line for hover/expand decomposition. */
export type CustomerAdvanceLegView = {
  id: string;
  advanceNumber: string;
  remaining: number;
  amount: number;
  usedAmount: number;
};

/**
 * Pure Outstanding facets for UI — sourced from `get_customer_financial_snapshot`.
 * Outstanding includes opening balance; unused advance is NOT folded into Outstanding.
 */
export type CustomerAccountStateView = {
  customerId: string;
  customerName: string;
  /** Invoice + OB outstanding (Dr). Unused advance is separate. */
  outstanding: number;
  unusedAdvance: number;
  unclaimedSaleReturn: number;
  /** Signed net receivable: matches snapshot `outstanding_dr`. */
  netPosition: number;
  openingBalance: number;
  advanceLegs: CustomerAdvanceLegView[];
};

function roundRupee(n: number): number {
  return Math.round(Number(n) || 0);
}

/**
 * Load canonical customer account facets from the SQL snapshot RPC.
 * Advance legs still come from the audit bundle (display-only decomposition).
 */
export async function fetchCustomerAccountStateView(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
): Promise<CustomerAccountStateView> {
  const [snap, bundle] = await Promise.all([
    fetchCustomerFinancialSnapshot(client, organizationId, customerId),
    fetchCustomerAuditBundle(client, organizationId, customerId),
  ]);

  const facets = accountFacetsFromFinancialSnapshot(snap);

  const advanceLegs: CustomerAdvanceLegView[] = (bundle.advances || [])
    .map((a: {
      id?: string;
      advance_number?: string | null;
      amount?: number | null;
      used_amount?: number | null;
    }) => {
      const amount = Number(a.amount || 0);
      const usedAmount = Number(a.used_amount || 0);
      const remaining = Math.max(0, amount - usedAmount);
      return {
        id: String(a.id || ""),
        advanceNumber: String(a.advance_number || "").trim() || "ADV",
        remaining: roundRupee(remaining),
        amount: roundRupee(amount),
        usedAmount: roundRupee(usedAmount),
      };
    })
    .filter((leg) => leg.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  return {
    customerId,
    customerName: String(
      (bundle.customer as { customer_name?: string }).customer_name || "",
    ).trim(),
    outstanding: facets.outstanding,
    unusedAdvance: facets.unusedAdvance,
    unclaimedSaleReturn: roundRupee(snap.cnAvailableTotal),
    netPosition: facets.netPosition,
    openingBalance: roundRupee(Number(bundle.customer.opening_balance || 0)),
    advanceLegs,
  };
}

export function formatAccountInr(n: number): string {
  return `₹${Math.abs(roundRupee(n)).toLocaleString("en-IN")}`;
}

/** Net label: Dr when customer owes, Cr when credit. */
export function formatNetPositionLabel(netPosition: number): string {
  const abs = formatAccountInr(netPosition);
  if (Math.abs(netPosition) <= 0) return `${abs}`;
  return netPosition > 0 ? `${abs} Dr` : `${abs} Cr`;
}

/**
 * Plain one-line arithmetic for PDF / copy-paste.
 * Unclaimed SR is listed separately (already reflected inside Outstanding) — not a third minus.
 */
export function formatCustomerAccountArithmeticLine(view: CustomerAccountStateView): string {
  let line = `Customer owes ${formatAccountInr(view.outstanding)}  −  Advance held ${formatAccountInr(view.unusedAdvance)}  =  Net ${formatNetPositionLabel(view.netPosition)}`;
  if (view.unclaimedSaleReturn > 0) {
    line += `  ·  Unclaimed returns ${formatAccountInr(view.unclaimedSaleReturn)}`;
  }
  return line;
}
