import type { QueryClient } from "@tanstack/react-query";
import { facetsFromInvoiceOutstanding } from "@/utils/customerAccountFacets";
import { fetchOrgLedgerCustomersReference } from "@/hooks/useOrgLedgerReferenceData";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllCustomerPartyBalances,
  type CustomerPartyBalanceRpcRow,
} from "@/utils/fetchAllRows";
import { isStatementTimeout } from "@/utils/statementTimeout";
import {
  alignPartyRowFromRpc,
  enrichPartyRowsWithCanonicalBalance,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";


export type CustomerLedgerListRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  unusedAdvanceTotal: number;
  totalCashPaid: number;
  totalAdvanceApplied: number;
  totalCnApplied: number;
  adjustmentTotal: number;
  gst_number?: string | null;
  points_balance?: number | null;
  discount_percent?: number | null;
};

/** Per-row money from party RPC / canonical enricher. Never copy window total_dr/total_cr. */
export function partyLedgerListMoneyFields(
  party: CustomerPartyBalanceRpcRow | CustomerPartyBalanceAlignedRow,
  phone: string,
): Pick<
  CustomerLedgerListRow,
  "totalSales" | "totalPaid" | "balance" | "unusedAdvanceTotal" | "totalCashPaid"
> {
  const aligned: CustomerPartyBalanceAlignedRow =
    "gross_outstanding" in party
      ? party
      : alignPartyRowFromRpc(party, phone);
  const totalSales = Math.round(Number(aligned.lifetime_total_sales) || 0);
  const totalPaid = Math.round(Number(aligned.lifetime_total_paid) || 0);
  return {
    totalSales,
    totalPaid,
    balance: aligned.gross_outstanding,
    unusedAdvanceTotal: aligned.advance_available,
    totalCashPaid: totalPaid,
  };
}

/** Ledger list money uses gross outstanding; recover signed net for the party enricher. */
export function ledgerListRowToAlignedParty(
  row: CustomerLedgerListRow,
): CustomerPartyBalanceAlignedRow {
  const unused = Number(row.unusedAdvanceTotal || 0);
  const signedNet = facetsFromInvoiceOutstanding(row.balance, unused).netPosition;
  return alignPartyRowFromRpc(
    {
      customer_id: row.id,
      customer_name: row.customer_name,
      signed_balance: signedNet,
      advance_available: unused,
      direction: "",
      net_position: signedNet,
      total_dr: 0,
      total_cr: 0,
      net_receivable: 0,
    },
    row.phone ?? "",
    { signedIsEconomicNet: true },
  );
}

export function applyAlignedPartyToLedgerListRow(
  row: CustomerLedgerListRow,
  aligned: CustomerPartyBalanceAlignedRow,
): CustomerLedgerListRow {
  return {
    ...row,
    ...partyLedgerListMoneyFields(aligned, aligned.phone ?? row.phone ?? ""),
  };
}

/**
 * Same canonical JS patch as Customer Balances. Caller must pass the visible
 * slice only (≤ PARTY_BALANCE_CANONICAL_ENRICH_MAX); the enricher no-ops above that.
 */
/**
 * Export rows match the visible enriched slice when filter narrows ≤ enrich cap;
 * otherwise post-fix aligned C-PARTY (same as list seed).
 */
export function customersForLedgerExport(
  filtered: CustomerLedgerListRow[],
  enrichedFiltered: CustomerLedgerListRow[] | undefined,
  enrichFilteredSubset: boolean,
): CustomerLedgerListRow[] {
  return enrichFilteredSubset ? (enrichedFiltered ?? filtered) : filtered;
}

export async function enrichLedgerListRowsWithCanonicalBalance(
  organizationId: string,
  rows: CustomerLedgerListRow[],
): Promise<CustomerLedgerListRow[]> {
  const aligned = await enrichPartyRowsWithCanonicalBalance(
    organizationId,
    rows.map(ledgerListRowToAlignedParty),
  );
  const byId = new Map(aligned.map((party) => [party.customer_id, party]));
  return rows.map((row) => {
    const next = byId.get(row.id);
    return next ? applyAlignedPartyToLedgerListRow(row, next) : row;
  });
}

export type BuildCustomerLedgerListOptions = {
  /** Server-side name/phone filter (party RPC p_search). Min 2 chars from UI. */
  search?: string | null;
  /** Reuse org-ledger-customers cache from Accounts / Outstanding tabs. */
  queryClient?: QueryClient;
};

async function fetchLedgerDirectoryCustomers(
  organizationId: string,
  search: string | null,
  queryClient?: QueryClient,
) {
  if (search) {
    const safe = search.replace(/[%_,()]/g, " ").trim();
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, customer_name, phone, email, gst_number, address, opening_balance, points_balance, discount_percent",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`customer_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .order("customer_name")
      .limit(500);
    if (error) throw error;
    return data || [];
  }
  return fetchOrgLedgerCustomersReference(organizationId, queryClient);
}

/**
 * Fast customer list for Customer Ledger — one party-balances RPC + customer directory.
 * Replaces per-customer JS recompute from full-org sales/voucher crawls on initial paint.
 */
export async function buildCustomerLedgerListFromPartyBalances(
  organizationId: string,
  options?: BuildCustomerLedgerListOptions,
): Promise<CustomerLedgerListRow[]> {
  const serverSearch = options?.search?.trim() || null;

  const [customers, partyRowsResult] = await Promise.all([
    fetchLedgerDirectoryCustomers(organizationId, serverSearch, options?.queryClient),
    fetchAllCustomerPartyBalances(organizationId, serverSearch).catch((error) => {
      if (isStatementTimeout(error)) return [] as CustomerPartyBalanceRpcRow[];
      throw error;
    }),
  ]);

  const partyRows = partyRowsResult;

  const partyByCustomer = new Map<string, CustomerPartyBalanceRpcRow>(
    partyRows.map((row) => [row.customer_id, row]),
  );

  return customers.map((customer) => {
    const openingBalance = Math.round(Number(customer.opening_balance) || 0);
    const party = partyByCustomer.get(customer.id);
    if (!party) {
      return {
        ...customer,
        opening_balance: openingBalance,
        totalSales: 0,
        totalPaid: 0,
        balance: openingBalance,
        unusedAdvanceTotal: 0,
        totalCashPaid: 0,
        totalAdvanceApplied: 0,
        totalCnApplied: 0,
        adjustmentTotal: 0,
      };
    }

    const money = partyLedgerListMoneyFields(party, customer.phone ?? "");

    return {
      ...customer,
      opening_balance: openingBalance,
      ...money,
      totalAdvanceApplied: 0,
      totalCnApplied: 0,
      adjustmentTotal: 0,
    };
  });
}
