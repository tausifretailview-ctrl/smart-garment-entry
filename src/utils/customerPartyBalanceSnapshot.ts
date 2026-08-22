import type { CustomerAccountFacets } from "@/utils/customerAccountFacets";
import {
  fetchAllCustomerPartyBalances,
  fetchCustomerPhoneMap,
  type CustomerPartyBalanceRpcRow,
} from "@/utils/fetchAllRows";
import {
  accountFacetsFromFinancialSnapshot,
  fetchCustomerFinancialSnapshotMap,
  fetchOrganizationFinancialSnapshotMap,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { partyBalanceDirection } from "@/utils/customerPartyBalanceDisplay";

const EMPTY_SNAPSHOT: CustomerFinancialSnapshot = {
  outstandingDr: 0,
  advanceAvailable: 0,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
  grossOutstandingDr: 0,
  netPosition: 0,
};

/** Party list row with headline numbers from `get_customer_financial_snapshot` (_all / _batch). */
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
 * Customer Balances list — party names from `get_customer_party_balances`,
 * headline Outstanding / Advance / Net from financial snapshot RPC (same as Ledger / POS).
 */
export async function fetchCustomerPartyBalancesAligned(
  organizationId: string,
): Promise<CustomerPartyBalanceAlignedRow[]> {
  const [partyRows, phoneMap, snapshotAll] = await Promise.all([
    fetchAllCustomerPartyBalances(organizationId),
    fetchCustomerPhoneMap(organizationId),
    fetchOrganizationFinancialSnapshotMap(organizationId),
  ]);

  let snapshotById = snapshotAll;
  if (snapshotAll.size === 0 && partyRows.length > 0) {
    const ids = partyRows.map((r) => r.customer_id);
    snapshotById = await fetchCustomerFinancialSnapshotMap(organizationId, ids);
  }

  return partyRows.map((row) => {
    const snap = snapshotById.get(row.customer_id) ?? { ...EMPTY_SNAPSHOT };
    return alignPartyRowWithSnapshot(row, phoneMap.get(row.customer_id) ?? "", snap);
  });
}
