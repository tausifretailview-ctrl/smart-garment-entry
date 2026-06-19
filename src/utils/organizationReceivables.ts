import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for ORG-LEVEL customer receivables.
 *
 * Wraps the `reconcile_customer_balances` RPC. Per-customer `calculated_balance` is
 * aligned with `get_customer_true_outstanding` (same components as Customer Ledger /
 * `computeCustomerBalanceCore`: gated gross invoicing, advance used, pending returns, unused advance).
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
  /** Lifetime net invoiced (gated gross) from reconcile RPC. */
  totalInvoices: number;
  /** Lifetime cash receipts from reconcile RPC. */
  totalCashPayments: number;
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
  total_invoices: number | null;
  total_cash_payments: number | null;
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
      totalInvoices: Math.round(Number(row.total_invoices ?? 0)),
      totalCashPayments: Math.round(Number(row.total_cash_payments ?? 0)),
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
  // Fast set-based RPC — does not touch the per-customer plpgsql function so it
  // does not time out on large orgs (e.g. ELLA NOOR with 2,000+ active customers).
  const { data, error } = await (client.rpc as any)(
    "get_organization_receivables_summary",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        customer_count: number | null;
        customers_owing: number | null;
        customers_in_credit: number | null;
        gross_receivable_dr: number | null;
        customer_credit_pool_cr: number | null;
        net_receivable: number | null;
        advance_available: number | null;
      }
    | undefined;
  if (!row) return { ...EMPTY_SUMMARY };
  return {
    customerCount: Number(row.customer_count ?? 0),
    customersOwing: Number(row.customers_owing ?? 0),
    customersInCredit: Number(row.customers_in_credit ?? 0),
    grossReceivableDr: Math.round(Number(row.gross_receivable_dr ?? 0)),
    customerCreditPoolCr: Math.round(Number(row.customer_credit_pool_cr ?? 0)),
    netReceivable: Math.round(Number(row.net_receivable ?? 0)),
    advanceAvailable: Math.round(Number(row.advance_available ?? 0) * 100) / 100,
  };
}

export const ORGANIZATION_RECEIVABLES_QUERY_KEY = "organization-receivables";

export type OrganizationSupplierPayableSummary = {
  supplierCount: number;
  openBills: number;
  paidViaBill: number;
  paidViaVouchers: number;
  creditNotes: number;
  netOutstanding: number;
};

const EMPTY_SUPPLIER_SUMMARY: OrganizationSupplierPayableSummary = {
  supplierCount: 0,
  openBills: 0,
  paidViaBill: 0,
  paidViaVouchers: 0,
  creditNotes: 0,
  netOutstanding: 0,
};

/** Net supplier payable: open bills − paid (inline + vouchers) − credit notes. */
export async function fetchOrganizationSupplierPayableSummary(
  organizationId: string,
  client: SupabaseClient = supabase,
): Promise<OrganizationSupplierPayableSummary> {
  if (!organizationId) return { ...EMPTY_SUPPLIER_SUMMARY };
  const { data, error } = await (client.rpc as any)(
    "get_organization_supplier_payable_summary",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        supplier_count: number | null;
        open_bills: number | null;
        paid_via_bill: number | null;
        paid_via_vouchers: number | null;
        credit_notes: number | null;
        net_outstanding: number | null;
      }
    | undefined;
  if (!row) return { ...EMPTY_SUPPLIER_SUMMARY };
  return {
    supplierCount: Number(row.supplier_count ?? 0),
    openBills: Math.round(Number(row.open_bills ?? 0)),
    paidViaBill: Math.round(Number(row.paid_via_bill ?? 0)),
    paidViaVouchers: Math.round(Number(row.paid_via_vouchers ?? 0)),
    creditNotes: Math.round(Number(row.credit_notes ?? 0)),
    netOutstanding: Math.round(Number(row.net_outstanding ?? 0)),
  };
}

export const ORGANIZATION_SUPPLIER_PAYABLE_QUERY_KEY = "organization-supplier-payable";
