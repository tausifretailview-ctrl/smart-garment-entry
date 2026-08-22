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
