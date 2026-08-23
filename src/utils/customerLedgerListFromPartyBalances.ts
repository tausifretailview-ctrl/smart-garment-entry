import {
  fetchAllCustomerPartyBalances,
  fetchAllCustomers,
  type CustomerPartyBalanceRpcRow,
} from "@/utils/fetchAllRows";
import { alignPartyRowFromRpc } from "@/utils/customerPartyBalanceSnapshot";

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

/** Per-row money from party RPC. Never copy window total_dr/total_cr (org totals). */
export function partyLedgerListMoneyFields(
  party: CustomerPartyBalanceRpcRow,
  phone: string,
): Pick<
  CustomerLedgerListRow,
  "totalSales" | "totalPaid" | "balance" | "unusedAdvanceTotal" | "totalCashPaid"
> {
  const aligned = alignPartyRowFromRpc(party, phone);
  return {
    totalSales: 0,
    totalPaid: 0,
    balance: aligned.gross_outstanding,
    unusedAdvanceTotal: aligned.advance_available,
    totalCashPaid: 0,
  };
}

/**
 * Fast customer list for Customer Ledger — one party-balances RPC + customer directory.
 * Replaces per-customer JS recompute from full-org sales/voucher crawls on initial paint.
 */
export async function buildCustomerLedgerListFromPartyBalances(
  organizationId: string,
): Promise<CustomerLedgerListRow[]> {
  const [customers, partyRows] = await Promise.all([
    fetchAllCustomers(organizationId),
    fetchAllCustomerPartyBalances(organizationId),
  ]);

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
