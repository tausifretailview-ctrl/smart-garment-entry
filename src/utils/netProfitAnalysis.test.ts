import { describe, expect, it } from "vitest";
import {
  aggregateForTab,
  computeSaleLineRevenue,
  sumAggregates,
  type ProfitLine,
} from "./netProfitAnalysis";

function line(partial: Partial<ProfitLine> & Pick<ProfitLine, "netSales" | "totalCOGS">): ProfitLine {
  return {
    qty: 1,
    grossSales: partial.netSales,
    totalDiscounts: 0,
    zeroCostQty: 0,
    sign: 1,
    supplierId: null,
    supplierName: "Unknown Supplier",
    productId: "p1",
    productName: "Product A",
    brand: "BrandX",
    category: "CatY",
    style: "StyleZ",
    size: "M",
    color: "Red",
    hsn: "6109",
    productType: "goods",
    saleId: "s1",
    saleNumber: "POS/26-27/1",
    saleDate: "2026-07-19T10:00:00",
    customerId: "c1",
    customerName: "RAM",
    salesman: "Amit",
    paymentMethod: "cash",
    ...partial,
  };
}

describe("computeSaleLineRevenue", () => {
  it("includes round-off in net (matches save: line − flat + round-off)", () => {
    const { netLine, lineDiscount, flatShare } = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 450,
        unit_price: 450,
        mrp: 500,
        discount_percent: 10,
        discount_share: 50,
        round_off_share: 2,
        net_after_discount: 402,
        sale_id: "s1",
      },
      { gross_amount: 450, flat_discount_amount: 50 },
    );
    expect(netLine).toBe(402);
    expect(lineDiscount).toBe(50);
    expect(flatShare).toBe(50);
  });

  it("falls back to line − flat + round-off when net_after_discount missing", () => {
    const { netLine } = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 400,
        unit_price: 400,
        mrp: 400,
        discount_percent: 0,
        discount_share: 0,
        round_off_share: 1.5,
        sale_id: "s1",
      },
      { gross_amount: 400, flat_discount_amount: 0 },
    );
    expect(netLine).toBe(401.5);
  });
});

describe("aggregateForTab", () => {
  const lines: ProfitLine[] = [
    line({
      netSales: 400,
      totalCOGS: 350,
      grossSales: 450,
      totalDiscounts: 50,
      supplierName: "HASTI ART",
      supplierId: "sup1",
    }),
    line({
      netSales: -100,
      totalCOGS: -70,
      grossSales: -100,
      qty: -1,
      sign: -1,
      saleId: "s1",
      saleNumber: "POS/26-27/1",
      customerName: "RAM",
      brand: "BrandX",
    }),
  ];

  it("bill-wise groups by sale and applies returns", () => {
    const rows = aggregateForTab(lines, "bill-wise");
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("POS/26-27/1");
    expect(rows[0].netSales).toBe(300);
    expect(rows[0].totalCOGS).toBe(280);
    expect(rows[0].grossProfit).toBe(20);
  });

  it("customer-wise and salesman-wise group header dims", () => {
    const byCustomer = aggregateForTab(lines, "customer-wise");
    expect(byCustomer[0].label).toBe("RAM");
    expect(byCustomer[0].netSales).toBe(300);

    const bySalesman = aggregateForTab(lines, "salesman-wise");
    expect(bySalesman[0].label).toBe("Amit");
  });

  it("field-wise groups by selected dimension", () => {
    const byBrand = aggregateForTab(lines, "field-wise", "brand");
    expect(byBrand[0].label).toBe("BrandX");
    expect(byBrand[0].netSales).toBe(300);

    const byType = aggregateForTab(
      [
        ...lines,
        line({
          netSales: 50,
          totalCOGS: 0,
          productType: "service",
          brand: "Other",
          saleId: "s2",
          saleNumber: "INV/1",
        }),
      ],
      "field-wise",
      "product_type",
    );
    const service = byType.find((r) => r.label === "service");
    const goods = byType.find((r) => r.label === "goods");
    expect(service?.netSales).toBe(50);
    expect(goods?.netSales).toBe(300);
  });

  it("filtered tab totals stay consistent across dimensions", () => {
    const supplier = sumAggregates(aggregateForTab(lines, "supplier-wise"));
    const bill = sumAggregates(aggregateForTab(lines, "bill-wise"));
    const field = sumAggregates(aggregateForTab(lines, "field-wise", "brand"));
    expect(supplier.netSales).toBe(bill.netSales);
    expect(bill.netSales).toBe(field.netSales);
    expect(supplier.grossProfit).toBe(field.grossProfit);
  });
});
