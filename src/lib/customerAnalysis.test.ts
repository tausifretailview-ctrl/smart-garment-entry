import { describe, expect, it } from "vitest";
import { analyzeCustomer, paymentMethodLabel, periodStart, type AnalysisItem, type AnalysisSale } from "./customerAnalysis";

const now = new Date(2026, 10, 19); // 19 Nov 2026

const sales: AnalysisSale[] = [
  { id: "s1", sale_date: "2026-06-10", sale_type: "invoice", net_amount: 2000, payment_method: "cash", payment_status: "completed" },
  { id: "s2", sale_date: "2026-07-10", sale_type: "pos", net_amount: 1000, payment_method: "upi", payment_status: "completed" },
  { id: "s3", sale_date: "2026-08-09T10:00:00Z", sale_type: "invoice", net_amount: 3000, payment_method: "pay_later", payment_status: "pending" },
  // Not counted: a delivery challan.
  { id: "dc", sale_date: "2026-08-20", sale_type: "delivery_challan", net_amount: 9999, payment_method: "cash", payment_status: "completed" },
];
const items: AnalysisItem[] = [
  { sale_id: "s1", product_id: "p1", product_name: "COTTON SHIRT", size: "M", color: "BLUE", quantity: 2, mrp: 1000, line_total: 2000 },
  { sale_id: "s2", product_id: "p2", product_name: "JEANS", size: "32", color: "BLACK", quantity: 1, mrp: 1200, line_total: 1000 },
  { sale_id: "s3", product_id: "p1", product_name: "COTTON SHIRT", size: "L", color: "BLUE", quantity: 3, mrp: 1000, line_total: 2400 },
  { sale_id: "s3", product_id: "p3", product_name: "SOCKS", size: "M", color: "WHITE", quantity: 2, mrp: 300, line_total: 600 },
  { sale_id: "dc", product_id: "p9", product_name: "IGNORED", quantity: 5, line_total: 9999 },
];
const products = [
  { id: "p1", brand: "ACME", category: "SHIRTS" },
  { id: "p2", brand: "DENIMCO", category: "JEANS" },
  { id: "p3", brand: "ACME", category: "ACCESSORIES" },
];

describe("analyzeCustomer", () => {
  const a = analyzeCustomer({ sales, items, products, returns: [{ id: "r1", return_date: "2026-08-15", net_amount: 600 }], now });

  it("summarises bills, spend, visits and returns (challans excluded)", () => {
    expect(a.summary).toMatchObject({
      bills: 3,
      totalSpent: 6000,
      avgBill: 2000,
      biggestBill: 3000,
      itemsQty: 8,
      avgItemPrice: 750,
      firstDate: "2026-06-10",
      lastDate: "2026-08-09",
      daysSinceLast: 102,
      avgGapDays: 30,
      returnsCount: 1,
      returnsAmount: 600,
      returnRatePct: 10,
    });
  });

  it("ranks products by spend with price paid, last price, discount and sizes", () => {
    expect(a.topProducts.map((p) => p.name)).toEqual(["COTTON SHIRT", "JEANS", "SOCKS"]);
    expect(a.topProducts[0]).toMatchObject({ bills: 2, qty: 5, amount: 4400, avgPrice: 880, lastPrice: 800, lastDate: "2026-08-09", mrp: 1000, avgDiscountPct: 12, sizes: ["L", "M"] });
  });

  it("splits brands, categories, sizes and colours by pieces", () => {
    expect(a.brands[0]).toMatchObject({ name: "ACME", qty: 7, sharePct: 87.5 });
    expect(a.categories.map((c) => c.name)).toEqual(["SHIRTS", "ACCESSORIES", "JEANS"]);
    expect(a.sizes[0]).toMatchObject({ name: "M", qty: 4, sharePct: 50 });
    expect(a.colors[0]).toMatchObject({ name: "BLUE", qty: 5 });
  });

  it("works out price bands and discount behaviour", () => {
    const bands = Object.fromEntries(a.priceBands.map((b) => [b.label, b.qty]));
    expect(bands["Under ₹300"]).toBe(0);
    expect(bands["₹300–499"]).toBe(2); // socks at 300
    expect(bands["₹500–999"]).toBe(3); // shirts at 800 ×3
    expect(bands["₹1,000–1,999"]).toBe(3); // shirts 1000 ×2 + jeans 1000
    expect(a.pricing.maxItemPrice).toBe(1000);
    expect(a.pricing.median).toBe(800);
    // MRP value 2000+1200+3000+600 = 6800, paid 6000 → 11.8% off.
    expect(a.pricing.avgDiscountPct).toBe(11.8);
    // Below MRP: jeans 1 + shirts 3 = 4 of 8 pieces.
    expect(a.pricing.discountedQtyPct).toBe(50);
  });

  it("records how bills were paid", () => {
    expect(a.payments.methods.map((m) => [m.label, m.bills, m.amount, m.sharePct])).toEqual([
      ["Credit (pay later)", 1, 3000, 50],
      ["Cash", 1, 2000, 33.3],
      ["UPI", 1, 1000, 16.7],
    ]);
    expect(a.payments).toMatchObject({ paid: 2, partial: 0, pending: 1 });
  });

  it("builds the 12-month trend and weekday pattern", () => {
    expect(a.monthly).toHaveLength(12);
    expect(a.monthly[11]).toMatchObject({ month: "2026-11", label: "Nov 26", amount: 0 });
    expect(a.monthly.find((m) => m.month === "2026-08")).toMatchObject({ amount: 3000, bills: 1 });
    expect(a.weekdays.reduce((s, d) => s + d.bills, 0)).toBe(3);
  });

  it("writes plain insights", () => {
    expect(a.insights.join(" ")).toContain("Favourite brand: ACME");
    expect(a.insights.join(" ")).toContain("due for a follow-up");
  });

  it("filters by period", () => {
    // 90 days back from 19 Nov is 22 Aug: the 9 Aug bill is outside.
    const last90 = analyzeCustomer({ sales, items, products, now, period: "90" });
    expect(last90.summary.bills).toBe(0);
    expect(last90.monthly.length).toBe(3);
    const last180 = analyzeCustomer({ sales, items, products, now, period: "180" });
    expect(last180.summary.bills).toBe(3);
    expect(last180.summary.totalSpent).toBe(6000);
    expect(periodStart("30", now)).toEqual(new Date(2026, 9, 21));
  });

  it("handles a customer with no bills", () => {
    const empty = analyzeCustomer({ sales: [], items: [], now });
    expect(empty.summary.bills).toBe(0);
    expect(empty.topProducts).toEqual([]);
    expect(empty.insights).toEqual([]);
  });

  it("labels payment methods", () => {
    expect(paymentMethodLabel("multiple").label).toBe("Mixed");
    expect(paymentMethodLabel(null).key).toBe("credit");
    expect(paymentMethodLabel("credit_note_adjustment").label).toBe("Advance / CN adjusted");
  });
});
