import { describe, expect, it } from "vitest";
import {
  aggregateForTab,
  computeSaleLineRevenue,
  rowsHaveReturns,
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
  it("does not invent discounts from MRP vs line_total when POS header Disc is 0", () => {
    const { lineDiscount, flatShare, netLine, grossLine } = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 500,
        unit_price: 500,
        mrp: 600,
        discount_percent: 0,
        discount_share: 0,
        round_off_share: 0,
        net_after_discount: 500,
        sale_id: "s1",
      },
      {
        gross_amount: 600,
        discount_amount: 0,
        flat_discount_amount: 0,
        points_redeemed_amount: 0,
        sale_return_adjust: 0,
      },
    );
    expect(grossLine).toBe(600);
    expect(lineDiscount).toBe(0);
    expect(flatShare).toBe(0);
    expect(netLine).toBe(500);
  });

  it("allocates POS header discount_amount + flat like POS Disc", () => {
    const { lineDiscount, flatShare, netLine } = computeSaleLineRevenue(
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
      {
        // POS gross_amount = Σ(MRP×qty)
        gross_amount: 500,
        mrp_allocation_base: 500,
        discount_amount: 50,
        flat_discount_amount: 50,
        points_redeemed_amount: 0,
        sale_return_adjust: 0,
      },
    );
    expect(lineDiscount).toBe(50);
    expect(flatShare).toBe(50);
    expect(netLine).toBe(402);
  });

  it("allocates header Disc by Σ line MRP even when Exclusive gross includes GST", () => {
    // Two equal MRP lines; Exclusive sales.gross_amount = MRP+GST would skew weights.
    const meta = {
      gross_amount: 1050, // mrp 1000 + gst 50
      mrp_allocation_base: 1000,
      discount_amount: 100,
      flat_discount_amount: 0,
      points_redeemed_amount: 0,
      sale_return_adjust: 0,
    };
    const a = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 450,
        unit_price: 450,
        mrp: 500,
        discount_percent: 0,
        sale_id: "s1",
      },
      meta,
    );
    const b = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 450,
        unit_price: 450,
        mrp: 500,
        discount_percent: 0,
        sale_id: "s1",
      },
      meta,
    );
    expect(a.lineDiscount).toBe(50);
    expect(b.lineDiscount).toBe(50);
    expect(a.lineDiscount + b.lineDiscount).toBe(100);
  });

  it("includes round-off in net via net_after_discount; never as discount", () => {
    const { netLine, lineDiscount, flatShare } = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 400,
        unit_price: 400,
        mrp: 400,
        discount_percent: 0,
        discount_share: 0,
        round_off_share: 1.5,
        net_after_discount: 401.5,
        sale_id: "s1",
      },
      {
        gross_amount: 400,
        discount_amount: 0,
        flat_discount_amount: 0,
        points_redeemed_amount: 0,
        sale_return_adjust: 0,
      },
    );
    expect(netLine).toBe(401.5);
    expect(lineDiscount + flatShare).toBe(0);
  });

  it("ignores negative discount_share so S/R cannot appear as negative Disc", () => {
    const { flatShare, lineDiscount } = computeSaleLineRevenue(
      {
        quantity: 1,
        line_total: 1000,
        unit_price: 1000,
        mrp: 1000,
        discount_percent: 0,
        discount_share: -9950,
        round_off_share: 0,
        net_after_discount: 1000,
        sale_id: "s1",
      },
      {
        gross_amount: 1000,
        discount_amount: 0,
        flat_discount_amount: 0,
        points_redeemed_amount: 0,
        sale_return_adjust: 9950,
      },
    );
    expect(flatShare).toBe(0);
    expect(lineDiscount).toBe(0);
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

  it("date-wise groups by day × product with brand detail", () => {
    const rows = aggregateForTab(
      [
        line({
          netSales: 400,
          totalCOGS: 200,
          grossSales: 450,
          qty: 2,
          productId: "shirt-1",
          productName: "SHIRT-H/S",
          brand: "StyleWear",
          saleDate: "2026-08-08T10:00:00",
          saleId: "s-a",
          saleNumber: "POS/1",
        }),
        line({
          netSales: 100,
          totalCOGS: 40,
          grossSales: 120,
          qty: 1,
          productId: "shirt-1",
          productName: "SHIRT-H/S",
          brand: "StyleWear",
          saleDate: "2026-08-08T15:00:00",
          saleId: "s-b",
          saleNumber: "POS/2",
        }),
        line({
          netSales: 80,
          totalCOGS: 30,
          productId: "pant-1",
          productName: "PANT",
          brand: "DenimCo",
          saleDate: "2026-08-07T12:00:00",
          saleId: "s-c",
          saleNumber: "POS/3",
        }),
      ],
      "date-wise",
    );

    expect(rows).toHaveLength(2);
    // Newer date first
    expect(rows[0].secondary).toBe("2026-08-08");
    expect(rows[0].label).toBe("SHIRT-H/S");
    expect(rows[0].tertiary).toBe("StyleWear");
    expect(rows[0].itemsSold).toBe(3);
    expect(rows[0].netSales).toBe(500);
    expect(rows[1].secondary).toBe("2026-08-07");
    expect(rows[1].label).toBe("PANT");
  });

  it("filtered tab totals stay consistent across dimensions", () => {
    const supplier = sumAggregates(aggregateForTab(lines, "supplier-wise"));
    const bill = sumAggregates(aggregateForTab(lines, "bill-wise"));
    const field = sumAggregates(aggregateForTab(lines, "field-wise", "brand"));
    const dateWise = sumAggregates(aggregateForTab(lines, "date-wise"));
    expect(supplier.netSales).toBe(bill.netSales);
    expect(bill.netSales).toBe(field.netSales);
    expect(field.netSales).toBe(dateWise.netSales);
    expect(supplier.grossProfit).toBe(dateWise.grossProfit);
  });

  it("keeps net qty/sales/profit byte-identical while surfacing return qty and amount", () => {
    const product = aggregateForTab(lines, "product-wise")[0];
    const dateWise = aggregateForTab(lines, "date-wise")[0];
    expect(product.itemsSold).toBe(0);
    expect(product.netSales).toBe(300);
    expect(product.grossProfit).toBe(20);
    expect(product.marginPercent).toBeCloseTo((20 / 300) * 100);
    expect(product.qtyReturned).toBe(1);
    expect(product.returnAmount).toBe(100);
    expect(dateWise.itemsSold).toBe(product.itemsSold);
    expect(dateWise.netSales).toBe(product.netSales);
    expect(dateWise.grossProfit).toBe(product.grossProfit);
    expect(dateWise.qtyReturned).toBe(1);
  });

  it("shows 5 returned / 0 sold as net -5 plus Qty Returned 5", () => {
    const rows = aggregateForTab(
      [
        line({
          qty: -5,
          sign: -1,
          netSales: -650,
          grossSales: -650,
          totalCOGS: 0,
          productName: "TSHIRT",
          brand: "HOSERIY",
          productId: "tshirt-1",
        }),
      ],
      "product-wise",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].itemsSold).toBe(-5);
    expect(rows[0].netSales).toBe(-650);
    expect(rows[0].grossProfit).toBe(-650);
    expect(rows[0].marginPercent).toBe(100);
    expect(rows[0].qtyReturned).toBe(5);
    expect(rows[0].returnAmount).toBe(650);
    expect(rowsHaveReturns(rows)).toBe(true);
  });

  it("does not flag returns when every line is a sale", () => {
    const rows = aggregateForTab(
      [line({ netSales: 100, totalCOGS: 40, qty: 2, sign: 1 })],
      "product-wise",
    );
    expect(rows[0].qtyReturned).toBe(0);
    expect(rows[0].returnAmount).toBe(0);
    expect(rowsHaveReturns(rows)).toBe(false);
  });
});
