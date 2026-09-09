import type { CustomerAccountFacets } from "@/utils/customerAccountFacets";
import { facetsFromPartySignedBalance } from "@/utils/customerAccountFacets";
import {
  fetchAllCustomerPartyBalances,
  fetchAllCustomers,
  fetchCustomerPhoneMap,
  type CustomerPartyBalanceRpcRow,
} from "@/utils/fetchAllRows";
import {
  accountFacetsFromFinancialSnapshot,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { partyBalanceDirection } from "@/utils/customerPartyBalanceDisplay";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";
import { getCustomerAccountState } from "@/utils/customerBalanceCore";
import { supabase } from "@/integrations/supabase/client";
import { isStatementTimeout } from "@/utils/statementTimeout";

/** Party list row with headline numbers aligned to snapshot facet semantics. */
export type CustomerPartyBalanceAlignedRow = CustomerPartyBalanceRpcRow & {
  phone?: string;
  /** Invoice + OB outstanding (gross_outstanding_dr). */
  gross_outstanding: number;
  /** Signed net receivable (= snapshot net_position). */
  net_position: number;
  /** Unused advance pool. */
  advance_available: number;
  cn_available: number;
  /** Lifetime gross invoiced — from getCustomerAccountState when enriched. */
  lifetime_total_sales?: number;
  /** Lifetime settled receipts — from getCustomerAccountState when enriched. */
  lifetime_total_paid?: number;
};

export function partyBalanceRowFacets(
  row: Pick<
    CustomerPartyBalanceAlignedRow,
    "gross_outstanding" | "advance_available" | "net_position" | "cn_available"
  >,
): CustomerAccountFacets {
  return {
    outstanding: row.gross_outstanding,
    unusedAdvance: row.advance_available,
    netPosition: row.net_position,
    cnAvailable: Math.max(0, Math.round(Number(row.cn_available) || 0)),
  };
}

/** Fields from getCustomerAccountState needed to patch a party-list row. */
export type PartyRowCanonicalState = {
  netPosition: number;
  unusedAdvancePool: number;
  unclaimedSaleReturnCredit: number;
  totalInvoicedGross: number;
  totalRealPayments: number;
};

/**
 * Write Advance + CN from canonical state. Net stays signed (CN already inside).
 * When signed already matches SQL, still fill `cn_available` — RPC hardcodes 0.
 */
export function applyCanonicalStateToPartyRow(
  row: CustomerPartyBalanceAlignedRow,
  state: PartyRowCanonicalState,
): CustomerPartyBalanceAlignedRow {
  const signedNet = Math.round(state.netPosition);
  const unusedAdvance = Math.max(0, Math.round(state.unusedAdvancePool));
  const cnAvailable = Math.max(0, Math.round(state.unclaimedSaleReturnCredit || 0));
  const lifetime = {
    lifetime_total_sales: Math.round(state.totalInvoicedGross),
    lifetime_total_paid: Math.round(state.totalRealPayments),
  };
  const rowSigned = Math.round(Number(row.signed_balance) || 0);
  if (Math.abs(signedNet - rowSigned) <= 1) {
    const facets = facetsFromPartySignedBalance(rowSigned, unusedAdvance);
    return {
      ...row,
      advance_available: unusedAdvance,
      cn_available: cnAvailable,
      gross_outstanding: facets.outstanding,
      net_position: facets.netPosition,
      ...lifetime,
    };
  }
  return {
    ...alignPartyRowFromRpc(
      {
        ...row,
        signed_balance: signedNet,
        advance_available: unusedAdvance,
      },
      row.phone ?? "",
    ),
    cn_available: cnAvailable,
    ...lifetime,
  };
}

/**
 * Derive unified-balance facets from party RPC row (single RPC — no snapshot_all).
 * Uses signed_balance as canonical net; ignores legacy net_position = signed − advance.
 */
export function alignPartyRowFromRpc(
  row: CustomerPartyBalanceRpcRow,
  phone: string,
): CustomerPartyBalanceAlignedRow {
  const signedNet = Math.round(Number(row.signed_balance) || 0);
  const facets = facetsFromPartySignedBalance(signedNet, row.advance_available);

  return {
    ...row,
    phone,
    gross_outstanding: facets.outstanding,
    net_position: facets.netPosition,
    advance_available: facets.unusedAdvance,
    cn_available: 0,
    signed_balance: signedNet,
    direction: partyBalanceDirection({ signed_balance: signedNet }),
  };
}

/** Merge explicit snapshot facets onto a party row (detail views / parity checks). */
export function alignPartyRowWithSnapshot(
  row: CustomerPartyBalanceRpcRow,
  phone: string,
  snap: CustomerFinancialSnapshot,
): CustomerPartyBalanceAlignedRow {
  const facets = accountFacetsFromFinancialSnapshot(snap);
  const signedNet = facets.netPosition;

  return {
    ...row,
    phone,
    gross_outstanding: facets.outstanding,
    net_position: signedNet,
    advance_available: facets.unusedAdvance,
    cn_available: snap.cnAvailableTotal,
    signed_balance: signedNet,
    direction: partyBalanceDirection({ signed_balance: signedNet }),
  };
}

export type CustomerPartyBalancesPayload = {
  rows: CustomerPartyBalanceAlignedRow[];
  /** False when party RPC timed out — rows are searchable directory + opening balance. */
  partyBalancesComplete: boolean;
};

function alignedRowsFromPartyRpc(
  partyRows: CustomerPartyBalanceRpcRow[],
  phoneMap: Map<string, string>,
): CustomerPartyBalanceAlignedRow[] {
  return partyRows.map((row) => alignPartyRowFromRpc(row, phoneMap.get(row.customer_id) ?? ""));
}

function alignedRowsFromCustomerDirectory(
  customers: Awaited<ReturnType<typeof fetchAllCustomers>>,
  phoneMap: Map<string, string>,
): CustomerPartyBalanceAlignedRow[] {
  return customers.map((customer) => {
    const opening = Math.round(Number(customer.opening_balance) || 0);
    return alignPartyRowFromRpc(
      {
        customer_id: customer.id,
        customer_name: customer.customer_name,
        signed_balance: opening,
        advance_available: 0,
        direction: partyBalanceDirection({ signed_balance: opening }),
        net_position: opening,
        total_dr: 0,
        total_cr: 0,
        net_receivable: 0,
      },
      customer.phone ?? phoneMap.get(customer.id) ?? "",
    );
  });
}

export async function fetchCustomerPartyBalancesPayload(
  organizationId: string,
): Promise<CustomerPartyBalancesPayload> {
  const [phoneMap, customers] = await Promise.all([
    fetchCustomerPhoneMap(organizationId),
    fetchAllCustomers(organizationId),
  ]);

  try {
    const partyRows = await fetchAllCustomerPartyBalances(organizationId);
    return {
      rows: alignedRowsFromPartyRpc(partyRows, phoneMap),
      partyBalancesComplete: true,
    };
  } catch (error) {
    if (!isStatementTimeout(error)) throw error;
    return {
      rows: alignedRowsFromCustomerDirectory(customers, phoneMap),
      partyBalancesComplete: false,
    };
  }
}

/**
 * Customer Balances list — one set-based party RPC + customer directory.
 * On large orgs, falls back to searchable customer rows (opening balance) if party RPC times out.
 */
export async function fetchCustomerPartyBalancesAligned(
  organizationId: string,
): Promise<CustomerPartyBalanceAlignedRow[]> {
  const payload = await fetchCustomerPartyBalancesPayload(organizationId);
  return payload.rows;
}

export const CUSTOMER_PARTY_BALANCE_ORG_WINDOW_QUERY_KEY = "customer-party-balance-org-window";

export type CustomerPartyBalanceOrgWindow = {
  /** Σ signed_balance — same figure as Customer Balances Net Receivable. */
  netReceivable: number;
};

export function partyBalanceOrgWindowFromRpcRow(
  row: Pick<CustomerPartyBalanceRpcRow, "net_receivable"> | null | undefined,
): CustomerPartyBalanceOrgWindow {
  return { netReceivable: Math.round(Number(row?.net_receivable) || 0) };
}

/**
 * One party-RPC row (window totals). Avoids get_organization_receivables_summary
 * which diverges from Customer Balances on CN-heavy orgs.
 *
 * On large orgs the full party list RPC can hit statement timeout even when
 * PostgREST limits to one row — Postgres still computes every customer. Falls
 * back to org receivables summary, then zero, without surfacing a global toast.
 */
export async function fetchCustomerPartyBalanceOrgWindow(
  organizationId: string,
): Promise<CustomerPartyBalanceOrgWindow> {
  if (!organizationId) return { netReceivable: 0 };

  const { data, error } = await supabase
    .rpc("get_customer_party_balances", {
      p_organization_id: organizationId,
    })
    .range(0, 0);

  if (!error) {
    const row = ((data ?? []) as CustomerPartyBalanceRpcRow[])[0];
    return partyBalanceOrgWindowFromRpcRow(row);
  }

  if (!isStatementTimeout(error)) throw error;

  const { data: summaryData, error: summaryError } = await supabase.rpc(
    "get_organization_receivables_summary",
    { p_organization_id: organizationId },
  );
  if (!summaryError) {
    const row = (Array.isArray(summaryData) ? summaryData[0] : summaryData) as
      | { net_receivable?: number | string | null }
      | null
      | undefined;
    return { netReceivable: Math.round(Number(row?.net_receivable) || 0) };
  }

  if (isStatementTimeout(summaryError)) {
    return { netReceivable: 0 };
  }
  throw summaryError;
}

/** Max rows to recompute via audit bundle when SQL party RPC drifts (partial CN). */
export const PARTY_BALANCE_CANONICAL_ENRICH_MAX = 100;

/** Concurrent enrich requests per batch when `allowBeyondCap` is set (exports). */
export const PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE = 20;

export type EnrichPartyRowsOptions = {
  /**
   * Browse/list callers must omit this — slices above the cap silently return
   * unpatched SQL. Exports pass true so a 759-party org is not left uncorrected.
   */
  allowBeyondCap?: boolean;
};

/**
 * Patch party list rows with canonical JS balance when SQL signed_balance drifts.
 * Used for the visible Customer Balances page slice and the Customer Ledger list
 * slice until party RPC CN-handling matches `_is_settlement_memo_receipt`.
 *
 * Default: no-ops when `rows.length > PARTY_BALANCE_CANONICAL_ENRICH_MAX` (no
 * error) so browsing a large org does not fire hundreds of audit-bundle fetches.
 * Pass `{ allowBeyondCap: true }` for Excel/PDF; those runs are chunked by
 * `PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE` instead of one giant Promise.all.
 */
export async function enrichPartyRowsWithCanonicalBalance(
  organizationId: string,
  rows: CustomerPartyBalanceAlignedRow[],
  options?: EnrichPartyRowsOptions,
): Promise<CustomerPartyBalanceAlignedRow[]> {
  if (!organizationId || rows.length === 0) {
    return rows;
  }
  if (rows.length > PARTY_BALANCE_CANONICAL_ENRICH_MAX && !options?.allowBeyondCap) {
    return rows;
  }

  const enrichOne = async (row: CustomerPartyBalanceAlignedRow) => {
    try {
      const bundle = await fetchCustomerAuditBundle(
        supabase,
        organizationId,
        row.customer_id,
      );
      const adjustmentTotal = (bundle.balanceAdjustments || []).reduce(
        (sum: number, a: { outstanding_difference?: number | null }) =>
          sum + Number(a.outstanding_difference || 0),
        0,
      );
      const state = getCustomerAccountState({
        openingBalance: Number(bundle.customer.opening_balance || 0),
        customerId: row.customer_id,
        sales: bundle.allSales,
        voucherEntries: bundle.vouchersMerged,
        customerAdvances: bundle.advances,
        advanceRefunds: bundle.refunds,
        adjustmentTotal,
        saleReturns: bundle.saleReturns,
        options: { ledgerAlignedApplicationReceipts: true },
      });
      return applyCanonicalStateToPartyRow(row, state);
    } catch {
      return row;
    }
  };

  if (rows.length <= PARTY_BALANCE_CANONICAL_ENRICH_MAX) {
    return Promise.all(rows.map(enrichOne));
  }

  const results: CustomerPartyBalanceAlignedRow[] = [];
  for (let i = 0; i < rows.length; i += PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE) {
    const batch = rows.slice(i, i + PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(enrichOne));
    results.push(...batchResults);
  }
  return results;
}
