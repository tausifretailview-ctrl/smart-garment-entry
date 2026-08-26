import { describe, expect, it } from "vitest";
import {
  POS_DASHBOARD_UNPAID_STATUS_FILTER,
  buildPosDashboardPaymentMethodOrFilter,
  buildPosDashboardSummaryScopeFilters,
  patchPosDashboardSalePayment,
  posDashboardModeTotalsNeedCorrection,
  posDashboardSummaryLooksValid,
  reconcilePosDashboardUnpaidCounts,
  resolvePosDashboardVoucherLookbackFrom,
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

  it("detects when RPC mode totals need background correction", () => {
    expect(
      posDashboardModeTotalsNeedCorrection({
        totalBills: 1,
        totalQty: 1,
        totalAmount: 1000,
        totalDiscount: 0,
        netSale: 1000,
        completedCount: 1,
        completedAmount: 1000,
        pendingCount: 0,
        pendingAmount: 0,
        holdCount: 0,
        holdAmount: 0,
        refundCount: 0,
        refundAmount: 0,
        creditNoteCount: 0,
        creditNoteAmount: 0,
        totalCash: 800,
        totalCard: 500,
        totalUpi: 0,
        totalBalance: 0,
        totalSaleReturnAdjust: 0,
        totalRoundOff: 0,
        cashBillCount: 1,
        cardBillCount: 1,
        upiBillCount: 0,
      }),
    ).toBe(true);
  });
});

describe("POS dashboard voucher lookback", () => {
  it("uses 45-day lookback for a single-day (daily) range", () => {
    expect(resolvePosDashboardVoucherLookbackFrom("2026-08-05", "2026-08-05")).toBe(
      "2026-06-21",
    );
  });

  it("uses 3-month lookback for ranges up to 31 days", () => {
    expect(resolvePosDashboardVoucherLookbackFrom("2026-08-01", "2026-08-31")).toBe(
      "2026-05-01",
    );
  });

  it("keeps 12-month lookback for wide ranges", () => {
    expect(resolvePosDashboardVoucherLookbackFrom("2026-01-01", "2026-08-05")).toBe(
      "2025-01-01",
    );
  });
});

describe("patchPosDashboardSalePayment", () => {
  it("marks cached list and reconcile rows Paid without waiting on refetch", () => {
    const pageKey = ["pos-dashboard-sales", "org-1", "", "daily"];
    const reconcileKey = [...pageKey, "reconcile", "sale-1"];
    const summaryKey = ["pos-dashboard-sales", "org-1", "summary", "", "daily"];
    const store = new Map<string, unknown>();
    const pendingSale = {
      id: "sale-1",
      net_amount: 1000,
      paid_amount: 0,
      payment_status: "pending",
      payment_method: "pay_later",
      sale_return_adjust: 0,
      gross_amount: 1000,
      discount_amount: 0,
      cash_amount: 0,
      card_amount: 0,
      upi_amount: 0,
    };
    const summary: PosDashboardSummaryStats = {
      totalBills: 1,
      totalQty: 1,
      totalAmount: 1000,
      totalDiscount: 0,
      netSale: 1000,
      completedCount: 0,
      completedAmount: 0,
      pendingCount: 1,
      pendingAmount: 1000,
      holdCount: 0,
      holdAmount: 0,
      refundCount: 0,
      refundAmount: 0,
      creditNoteCount: 0,
      creditNoteAmount: 0,
      totalCash: 0,
      totalCard: 0,
      totalUpi: 0,
      totalBalance: 1000,
      totalSaleReturnAdjust: 0,
      totalRoundOff: 0,
      cashBillCount: 0,
      cardBillCount: 0,
      upiBillCount: 0,
    };
    store.set(JSON.stringify(pageKey), {
      sales: [{ ...pendingSale }],
      sourceRows: [{ ...pendingSale }],
      creditNoteUsage: {},
      totalCount: 1,
    });
    store.set(JSON.stringify(reconcileKey), [{ ...pendingSale }]);
    store.set(JSON.stringify(summaryKey), { ...summary });

    const queryClient = {
      getQueryCache: () => ({
        findAll: () => [
          { queryKey: pageKey, state: { data: store.get(JSON.stringify(pageKey)) } },
          { queryKey: reconcileKey, state: { data: store.get(JSON.stringify(reconcileKey)) } },
          { queryKey: summaryKey, state: { data: store.get(JSON.stringify(summaryKey)) } },
        ],
      }),
      setQueryData: (key: unknown[], data: unknown) => {
        store.set(JSON.stringify(key), data);
      },
    };

    patchPosDashboardSalePayment(queryClient as never, "org-1", "sale-1", {
      paid_amount: 1000,
      payment_status: "completed",
      payment_method: "cash",
      prevPaymentStatus: "pending",
      netAmount: 1000,
      outstandingCleared: 1000,
    });

    const page = store.get(JSON.stringify(pageKey)) as {
      sales: Array<{ payment_status: string; pos_outstanding: number }>;
      sourceRows: Array<{ payment_status: string }>;
    };
    const reconciled = store.get(JSON.stringify(reconcileKey)) as Array<{
      payment_status: string;
    }>;
    const tiles = store.get(JSON.stringify(summaryKey)) as PosDashboardSummaryStats;

    expect(page.sales[0].payment_status).toBe("completed");
    expect(page.sales[0].pos_outstanding).toBe(0);
    expect(page.sourceRows[0].payment_status).toBe("completed");
    expect(reconciled[0].payment_status).toBe("completed");
    expect(tiles.completedCount).toBe(1);
    expect(tiles.pendingCount).toBe(0);
    expect(tiles.totalBalance).toBe(0);
  });
});
