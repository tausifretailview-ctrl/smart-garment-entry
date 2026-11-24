import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { seedPosDashboardCacheWithSale } from "./posDashboardSales";

/**
 * A held bill completed in POS keeps its row id. The dashboard cache already lists it (tagged
 * Hold, Hold/ number); the post-save seed used to skip a row it already had, so the completed
 * bill kept showing Hold until the deferred refetch ran.
 */
const ORG = "org-1";
const today = new Date().toISOString().slice(0, 10);
const listKey = ["pos-dashboard-sales", ORG, "", "daily", today, today, "all", [], "all", "all", "all", "all", "active", 1, 50];
const summaryKey = ["pos-dashboard-sales", ORG, "summary", "", "daily", today, today];

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(listKey, {
    sales: [
      { id: "s-held", sale_number: "Hold/26-27/7", payment_status: "hold", net_amount: 500, sale_date: today, customers: { id: "c1" } },
      { id: "s-other", sale_number: "POS/26-27/40", payment_status: "completed", net_amount: 100, sale_date: today },
    ],
    totalCount: 2,
    creditNoteUsage: {},
  });
  qc.setQueryData(summaryKey, {
    totalBills: 2, totalQty: 3, totalAmount: 600, netSale: 600, completedCount: 1, completedAmount: 100,
    pendingCount: 1, pendingAmount: 500, totalCash: 100, totalCard: 0, totalUpi: 0,
    cashBillCount: 1, cardBillCount: 0, upiBillCount: 0,
  });
  return qc;
}

const completed = {
  id: "s-held",
  sale_number: "POS/26-27/41",
  sale_date: today,
  sale_type: "pos",
  payment_status: "completed",
  payment_method: "cash",
  net_amount: 500,
  paid_amount: 500,
  cash_amount: 500,
} as unknown as Parameters<typeof seedPosDashboardCacheWithSale>[2];

describe("seedPosDashboardCacheWithSale: a bill already listed", () => {
  it("replaces the cached Hold row with the completed bill, same place, no extra row", () => {
    const qc = setup();
    seedPosDashboardCacheWithSale(qc, ORG, completed, { isNewBill: false });
    const data = qc.getQueryData(listKey) as { sales: Array<Record<string, unknown>>; totalCount: number };
    expect(data.sales).toHaveLength(2);
    expect(data.totalCount).toBe(2);
    expect(data.sales[0]).toMatchObject({ id: "s-held", sale_number: "POS/26-27/41", payment_status: "completed" });
    expect(data.sales[0].customers).toEqual({ id: "c1" });
    expect(data.sales[1].id).toBe("s-other");
  });

  it("does not count an existing bill again in the summary tiles", () => {
    const qc = setup();
    seedPosDashboardCacheWithSale(qc, ORG, completed, { isNewBill: false });
    expect((qc.getQueryData(summaryKey) as { totalBills: number }).totalBills).toBe(2);
  });

  it("a new bill is still added on top and counted", () => {
    const qc = setup();
    seedPosDashboardCacheWithSale(qc, ORG, { ...completed, id: "s-new", sale_number: "POS/26-27/42" });
    const data = qc.getQueryData(listKey) as { sales: Array<{ id: string }>; totalCount: number };
    expect(data.sales.map((s) => s.id)).toEqual(["s-new", "s-held", "s-other"]);
    expect(data.totalCount).toBe(3);
    expect((qc.getQueryData(summaryKey) as { totalBills: number }).totalBills).toBe(3);
  });
});
