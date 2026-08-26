import type { CustomerAccountFacets } from "@/utils/customerAccountFacets";
import { facetsFromPartySignedBalance } from "@/utils/customerAccountFacets";
import {
  fetchAllCustomerPartyBalances,
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
};

export function partyBalanceRowFacets(
  row: Pick<
    CustomerPartyBalanceAlignedRow,
    "gross_outstanding" | "advance_available" | "net_position"
  >,
): CustomerAccountFacets {
  return {
    outstanding: row.gross_outstanding,
    unusedAdvance: row.advance_available,
    netPosition: row.net_position,
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

/**
 * Customer Balances list — one set-based party RPC + phone map.
 * Facets match get_customer_financial_snapshot after migration 20260822183000
 * (gross = signed + advance; net = signed). Avoids snapshot_all timeout on large orgs.
 */
export async function fetchCustomerPartyBalancesAligned(
  organizationId: string,
): Promise<CustomerPartyBalanceAlignedRow[]> {
  const [partyRows, phoneMap] = await Promise.all([
    fetchAllCustomerPartyBalances(organizationId),
    fetchCustomerPhoneMap(organizationId),
  ]);

  return partyRows.map((row) =>
    alignPartyRowFromRpc(row, phoneMap.get(row.customer_id) ?? ""),
  );
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

/**
 * Patch party list rows with canonical JS balance when SQL signed_balance drifts.
 * Used for the visible Customer Balances page slice and the Customer Ledger list
 * slice until party RPC CN-handling matches `_is_settlement_memo_receipt`.
 */
export async function enrichPartyRowsWithCanonicalBalance(
  organizationId: string,
  rows: CustomerPartyBalanceAlignedRow[],
): Promise<CustomerPartyBalanceAlignedRow[]> {
  if (!organizationId || rows.length === 0 || rows.length > PARTY_BALANCE_CANONICAL_ENRICH_MAX) {
    return rows;
  }

  return Promise.all(
    rows.map(async (row) => {
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
        const signedNet = Math.round(state.netPosition);
        if (Math.abs(signedNet - Math.round(Number(row.signed_balance) || 0)) <= 1) {
          return row;
        }
        return alignPartyRowFromRpc(
          {
            ...row,
            signed_balance: signedNet,
            advance_available: state.unusedAdvancePool,
          },
          row.phone ?? "",
        );
      } catch {
        return row;
      }
    }),
  );
}
