import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  fetchCustomerFinancialSnapshot,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";
import {
  getCustomerAccountState,
  warnCustomerBalanceMismatch,
} from "@/utils/customerBalanceCore";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";

interface CustomerBalanceResult {
  /** Signed net receivable — same as snapshot `outstanding_dr` / POS picker. */
  balance: number;
  /** Invoice + OB outstanding before netting unused advance. */
  grossOutstanding: number;
  /** Economic net — alias of `balance`. */
  netPosition: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  adjustmentTotal: number;
  unusedAdvanceTotal: number;
  saleReturnTotal: number;
  totalSalesGross: number;
  totalSaleReturnAdjustOnSales: number;
  totalCashPaid: number;
  totalAdvanceApplied: number;
  totalCnApplied: number;
  cnAvailableTotal: number;
  snapshot: CustomerFinancialSnapshot;
  isLoading: boolean;
  refetch: () => void;
}

const EMPTY_SNAPSHOT: CustomerFinancialSnapshot = {
  outstandingDr: 0,
  advanceAvailable: 0,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
  grossOutstandingDr: 0,
  netPosition: 0,
};

/**
 * Headline customer balance — canonical JS from audit bundle (`getCustomerAccountState`).
 * SQL snapshot is fetched for parity warnings only until RPCs match on all partial-CN rows.
 */
export function useCustomerBalance(
  customerId: string | null,
  organizationId: string | null,
): CustomerBalanceResult {
  const { data, isLoading, refetch } = useQuery({
    queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, "balance-hook", organizationId, customerId],
    queryFn: async () => {
      if (!customerId || !organizationId) {
        return {
          balance: 0,
          grossOutstanding: 0,
          netPosition: 0,
          openingBalance: 0,
          totalSales: 0,
          totalPaid: 0,
          adjustmentTotal: 0,
          unusedAdvanceTotal: 0,
          saleReturnTotal: 0,
          totalSalesGross: 0,
          totalSaleReturnAdjustOnSales: 0,
          totalCashPaid: 0,
          totalAdvanceApplied: 0,
          totalCnApplied: 0,
          cnAvailableTotal: 0,
          snapshot: { ...EMPTY_SNAPSHOT },
        };
      }

      const [snap, bundle] = await Promise.all([
        fetchCustomerFinancialSnapshot(supabase, organizationId, customerId),
        fetchCustomerAuditBundle(supabase, organizationId, customerId),
      ]);

      const adjustmentTotal = (bundle.balanceAdjustments || []).reduce(
        (sum: number, a: { outstanding_difference?: number | null }) =>
          sum + Number(a.outstanding_difference || 0),
        0,
      );

      const state = getCustomerAccountState({
        openingBalance: Number(bundle.customer.opening_balance || 0),
        customerId,
        sales: bundle.allSales,
        voucherEntries: bundle.vouchersMerged,
        customerAdvances: bundle.advances,
        advanceRefunds: bundle.refunds,
        adjustmentTotal,
        saleReturns: bundle.saleReturns,
        options: { ledgerAlignedApplicationReceipts: true },
      });

      warnCustomerBalanceMismatch(
        "useCustomerBalance",
        snap.netPosition,
        state.netPosition,
        { customerId, sqlCnAvailable: snap.cnAvailableTotal },
      );

      const totalCashPaid = Math.round(state.receiptCredits + state.paidAmountDrift);
      const totalPaid = Math.round(
        totalCashPaid + state.creditNoteCredits + state.totalAdvanceUsed,
      );

      return {
        balance: state.netPosition,
        grossOutstanding: state.outstanding,
        netPosition: state.netPosition,
        openingBalance: state.openingBalance,
        totalSales: state.totalSalesNet,
        totalPaid,
        adjustmentTotal: state.adjustmentTotal,
        unusedAdvanceTotal: state.unusedAdvancePool,
        saleReturnTotal: state.unclaimedSaleReturnCredit,
        totalSalesGross: state.totalInvoicedGross,
        totalSaleReturnAdjustOnSales: state.totalSaleReturnAdjustOnInvoices,
        totalCashPaid,
        totalAdvanceApplied: state.totalAdvanceUsed,
        totalCnApplied: state.creditNoteCredits,
        cnAvailableTotal: state.unclaimedSaleReturnCredit,
        snapshot: snap,
      };
    },
    enabled: !!customerId && !!organizationId,
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  const empty = {
    balance: 0,
    grossOutstanding: 0,
    netPosition: 0,
    openingBalance: 0,
    totalSales: 0,
    totalPaid: 0,
    adjustmentTotal: 0,
    unusedAdvanceTotal: 0,
    saleReturnTotal: 0,
    totalSalesGross: 0,
    totalSaleReturnAdjustOnSales: 0,
    totalCashPaid: 0,
    totalAdvanceApplied: 0,
    totalCnApplied: 0,
    cnAvailableTotal: 0,
    snapshot: { ...EMPTY_SNAPSHOT },
  };

  const resolved = data ?? empty;

  return {
    ...resolved,
    isLoading,
    refetch,
  };
}
