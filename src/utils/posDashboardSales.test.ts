import { describe, expect, it } from "vitest";
import {
  POS_DASHBOARD_UNPAID_STATUS_FILTER,
  buildPosDashboardPaymentMethodOrFilter,
  buildPosDashboardSummaryScopeFilters,
  posDashboardSummaryLooksValid,
  reconcilePosDashboardUnpaidCounts,
  type PosDashboardFilters,
  type PosDashboardSummaryStats,
} from "./posDashboardSales";

const baseFilters = (): PosDashboardFilters => ({
  organizationId: "org-1",
  search: "",
  startDate: "2026-07-30",
  endDate: "2026-07-30",
  paymentMethodFilter: "cash",
  paymentStatusFilter: ["completed"],
  saleTypeFilter: "all",
  refundFilter: "all",
  creditNoteFilter: "all",
  userFilter: "all",
  cancelFilter: "active",
});

describe("POS dashboard mix / unpaid filters", () => {
  it("Pending KPI filter includes partial (mix + credit) bills", () => {
    expect([...POS_DASHBOARD_UNPAID_STATUS_FILTER]).toEqual(["pending", "partial"]);
  });

  it("Cash/Card/UPI method filters include mix bills with that tender", () => {
    expect(buildPosDashboardPaymentMethodOrFilter("cash")).toContain(
      "payment_method.eq.multiple",
    );
    expect(buildPosDashboardPaymentMethodOrFilter("cash")).toContain("cash_amount.gt.0");
    expect(buildPosDashboardPaymentMethodOrFilter("upi")).toContain("upi_amount.gt.0");
    expect(buildPosDashboardPaymentMethodOrFilter("card")).toContain("card_amount.gt.0");
    expect(buildPosDashboardPaymentMethodOrFilter("multiple")).toBeNull();
    expect(buildPosDashboardPaymentMethodOrFilter("pay_later")).toBeNull();
  });

  it("summary scope clears status and method so KPI totals include mix+credit bills", () => {
    const scoped = buildPosDashboardSummaryScopeFilters(baseFilters());
    expect(scoped.paymentMethodFilter).toBe("all");
    expect(scoped.paymentStatusFilter).toEqual([]);
    expect(scoped.startDate).toBe("2026-07-30");
    expect(scoped.cancelFilter).toBe("active");
  });

  it("summary stays valid when Paid filter empties the list but KPIs still have bills", () => {
    const stats: PosDashboardSummaryStats = {
      totalBills: 3,
      totalQty: 20,
      totalAmount: 49800,
      totalDiscount: 0,
      netSale: 49800,
      completedCount: 2,
      completedAmount: 27800,
      pendingCount: 1,
      pendingAmount: 10000,
      holdCount: 0,
      holdAmount: 0,
      refundCount: 0,
      refundAmount: 0,
      creditNoteCount: 0,
      creditNoteAmount: 0,
      totalCash: 19800,
      totalCard: 0,
      totalUpi: 20000,
      totalBalance: 10000,
      totalSaleReturnAdjust: 0,
      totalRoundOff: 0,
      cashBillCount: 2,
      cardBillCount: 0,
      upiBillCount: 1,
    };
    // Filtered list count under Status=Paid (mix+credit excluded)
    expect(posDashboardSummaryLooksValid(stats, 2)).toBe(true);
    expect(posDashboardSummaryLooksValid(stats, 0)).toBe(true);
  });

  it("reconciles Pending count when RPC omits payment_status=partial", () => {
    const reconciled = reconcilePosDashboardUnpaidCounts({
      totalBills: 3,
      totalQty: 20,
      totalAmount: 49800,
      totalDiscount: 0,
      netSale: 49800,
      completedCount: 2,
      completedAmount: 27800,
      pendingCount: 0,
      pendingAmount: 0,
      holdCount: 0,
      holdAmount: 0,
      refundCount: 0,
      refundAmount: 0,
      creditNoteCount: 0,
      creditNoteAmount: 0,
      totalCash: 19800,
      totalCard: 0,
      totalUpi: 20000,
      totalBalance: 10000,
      totalSaleReturnAdjust: 0,
      totalRoundOff: 0,
      cashBillCount: 2,
      cardBillCount: 0,
      upiBillCount: 1,
    });
    expect(reconciled.pendingCount).toBe(1);
  });
});
