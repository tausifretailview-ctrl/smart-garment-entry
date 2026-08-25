import { supabase } from "@/integrations/supabase/client";
import { fetchSupplierDirectory, fetchSupplierPhoneMap } from "@/utils/fetchAllRows";
import { supplierPartyBalanceDirection } from "@/utils/supplierPartyBalanceDisplay";
import {
  loadSupplierBalanceMapForOrg,
  summarizeSupplierOrgWindowFromSnapshots,
  type SupplierBalanceSnapshot,
  type SupplierOrgBalanceWindow,
} from "@/utils/supplierBalanceUtils";

/** Supplier Balances list row — S-JS balance with party-RPC-shaped window fields. */
export type SupplierPartyBalanceAlignedRow = {
  supplier_id: string;
  supplier_name: string;
  phone?: string;
  signed_balance: number;
  direction: string;
  total_cr: number;
  total_dr: number;
  net_payable: number;
};

export const SUPPLIER_ORG_BALANCE_WINDOW_QUERY_KEY = "supplier-org-balance-window";

const EMPTY_SNAP = (supplierId: string): SupplierBalanceSnapshot => ({
  supplierId,
  openingBalance: 0,
  totalPurchases: 0,
  totalPaid: 0,
  totalCreditNotesGross: 0,
  creditNotesAppliedToBills: 0,
  creditNotesAppliedToOutstanding: 0,
  creditNotesRefunded: 0,
  totalCreditNotesNet: 0,
  unappliedCreditNotes: 0,
  unreflectedReturns: 0,
  refundsReceived: 0,
  balance: 0,
});

function partyRowFromSnapshot(
  supplierId: string,
  supplierName: string,
  phone: string,
  snap: SupplierBalanceSnapshot,
  orgWindow: SupplierOrgBalanceWindow,
): SupplierPartyBalanceAlignedRow {
  const signed = Math.round(Number(snap.balance) || 0);
  const base = {
    supplier_id: supplierId,
    supplier_name: supplierName,
    phone,
    signed_balance: signed,
    direction: "",
    total_cr: orgWindow.totalPayableCr,
    total_dr: orgWindow.totalAdvanceDr,
    net_payable: orgWindow.netPayable,
  };
  return {
    ...base,
    direction: supplierPartyBalanceDirection(base),
  };
}

/**
 * Supplier Balances page — one S-JS org map + directory + phone map.
 * Replaces raw `get_supplier_party_balances` (S-PARTY) on this screen.
 */
export async function fetchSupplierPartyBalancesAligned(
  organizationId: string,
): Promise<SupplierPartyBalanceAlignedRow[]> {
  const [suppliers, phoneMap, { balanceMap }] = await Promise.all([
    fetchSupplierDirectory(organizationId),
    fetchSupplierPhoneMap(organizationId),
    loadSupplierBalanceMapForOrg(supabase, organizationId),
  ]);

  const orgWindow = summarizeSupplierOrgWindowFromSnapshots(balanceMap);

  return suppliers.map((supplier) => {
    const id = String(supplier.id);
    const snap = balanceMap.get(id) ?? EMPTY_SNAP(id);
    return partyRowFromSnapshot(
      id,
      supplier.supplier_name ?? "",
      phoneMap.get(id) ?? supplier.phone ?? "",
      snap,
      orgWindow,
    );
  });
}

/** Window totals for dashboards — same figure as Supplier Balances org cards. */
export async function fetchSupplierOrgBalanceWindow(
  organizationId: string,
): Promise<SupplierOrgBalanceWindow> {
  if (!organizationId) {
    return {
      totalPayableCr: 0,
      totalAdvanceDr: 0,
      netPayable: 0,
      activeSupplierCount: 0,
      payableSupplierCount: 0,
    };
  }
  const { balanceMap } = await loadSupplierBalanceMapForOrg(supabase, organizationId);
  return summarizeSupplierOrgWindowFromSnapshots(balanceMap);
}
