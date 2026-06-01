import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for ORG-LEVEL customer receivables.
 *
 * Wraps the `reconcile_customer_balances` RPC (the Master Reconciliation formula:
 * opening + Σ(net + sale_return_adjust) − cash receipts − Σ advances − Σ sale_returns
 * + refunds + balance adjustments). That signed per-customer `calculated_balance`
 * is the authoritative figure used by the Customer Reconciliation page; this util
 * lets every receivables surface (Customer Ledger card, Accounts Mgmt, Main
 * Dashboard, Balance Sheet) read the same numbers instead of four divergent ones.
 *
 * Positive balance  = customer owes us  (Accounts Receivable / Dr).
 * Negative balance  = we owe customer   (advance / overpayment — Customer Credit Pool / Cr).
 */

export type OrganizationReceivableRow = {
  customerId: string;
  /** Signed master balance: > 0 owes us, < 0 in credit. */
  balance: number;
  /** Unused advance still available to the customer. */
  advanceAvailable: number;
};

export type OrganizationReceivablesSummary = {
  /** Customers with reconciliation activity (rows returned by the RPC). */
  customerCount: number;
  customersOwing: number;
  customersInCredit: number;
  /** Σ max(0, balance) — what customers owe us (AR asset). */
  grossReceivableDr: number;
  /** Σ max(0, −balance) — what we owe customers (advances / overpayments). */
  customerCreditPoolCr: number;
  /** Σ balance — true net economic receivable. */
  netReceivable: number;
  /** Σ advance_available — unused advances on file. */
  advanceAvailable: number;
};

type ReconcileRpcRow = {
  customer_id: string | null;
  calculated_balance: number | null;
  advance_available: number | null;
};

const EMPTY_SUMMARY: OrganizationReceivablesSummary = {
  customerCount: 0,
  customersOwing: 0,
  customersInCredit: 0,
  grossReceivableDr: 0,
  customerCreditPoolCr: 0,
  netReceivable: 0,
  advanceAvailable: 0,
};

/** Per-customer signed master balances for the whole org (one RPC call). */
export async function fetchOrganizationReceivableRows(
  organizationId: string,
  client: SupabaseClient = supabase,
): Promise<OrganizationReceivableRow[]> {
  if (!organizationId) return [];

  const { data, error } = await (client.rpc as any)("reconcile_customer_balances", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  return ((data || []) as ReconcileRpcRow[])
    .filter((row) => !!row?.customer_id)
    .map((row) => ({
      customerId: row.customer_id as string,
      balance: Math.round(Number(row.calculated_balance ?? 0)),
      advanceAvailable: Math.round(Number(row.advance_available ?? 0) * 100) / 100,
    }));
}

/** Map customerId → signed master balance (for list/detail overrides). */
export function receivableRowsToBalanceMap(
  rows: OrganizationReceivableRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.customerId] = row.balance;
  return out;
}

export function summarizeReceivableRows(
  rows: OrganizationReceivableRow[],
): OrganizationReceivablesSummary {
  const totals = { ...EMPTY_SUMMARY, customerCount: rows.length };
  for (const row of rows) {
    if (row.balance > 0) {
      totals.customersOwing += 1;
      totals.grossReceivableDr += row.balance;
    } else if (row.balance < 0) {
      totals.customersInCredit += 1;
      totals.customerCreditPoolCr += -row.balance;
    }
    totals.netReceivable += row.balance;
    totals.advanceAvailable += row.advanceAvailable;
  }
  totals.grossReceivableDr = Math.round(totals.grossReceivableDr);
  totals.customerCreditPoolCr = Math.round(totals.customerCreditPoolCr);
  totals.netReceivable = Math.round(totals.netReceivable);
  totals.advanceAvailable = Math.round(totals.advanceAvailable * 100) / 100;
  return totals;
}

/** Org-level receivables summary (AR asset, credit pool, net) from the master RPC. */
export async function fetchOrganizationReceivablesSummary(
  organizationId: string,
  client: SupabaseClient = supabase,
): Promise<OrganizationReceivablesSummary> {
  if (!organizationId) return { ...EMPTY_SUMMARY };
  const rows = await fetchOrganizationReceivableRows(organizationId, client);
  return summarizeReceivableRows(rows);
}

export const ORGANIZATION_RECEIVABLES_QUERY_KEY = "organization-receivables";
