import { describe, expect, it } from "vitest";
import {
  pivotSaleItemsBySize,
  resolveInvoiceSizeColumns,
} from "@/utils/invoiceSizePivot";

/** SKU-per-line stand-in for "1868 CAML" sold across sizes 7/8/9/10. */
const camel1868 = [
  { particulars: "1868 CAML", hsn: "64051000", gstPercent: 18, mrp: 4295, discountPercent: 28, rate: 3092.4, size: "7", qty: 1, total: 3092.4 },
  { particulars: "1868 CAML", hsn: "64051000", gstPercent: 18, mrp: 4295, discountPercent: 28, rate: 3092.4, size: "8", qty: 2, total: 6184.8 },
  { particulars: "1868 CAML", hsn: "64051000", gstPercent: 18, mrp: 4295, discountPercent: 28, rate: 3092.4, size: "9", qty: 2, total: 6184.8 },
  { particulars: "1868 CAML", hsn: "64051000", gstPercent: 18, mrp: 4295, discountPercent: 28, rate: 3092.4, size: "10", qty: 1, total: 3092.4 },
];

const mixedBill = [
  ...camel1868,
  { particulars: "1037 CAMEL", hsn: "64039990", gstPercent: 5, mrp: 3295, discountPercent: 28, rate: 2372.4, size: "7", qty: 1, total: 2372.4 },
  { particulars: "1037 CAMEL", hsn: "64039990", gstPercent: 5, mrp: 3295, discountPercent: 28, rate: 2372.4, size: "8", qty: 1, total: 2372.4 },
  { particulars: "1037 CAMEL", hsn: "64039990", gstPercent: 5, mrp: 3295, discountPercent: 28, rate: 2372.4, size: "9", qty: 1, total: 2372.4 },
  { particulars: "1037 CAMEL", hsn: "64039990", gstPercent: 5, mrp: 3295, discountPercent: 28, rate: 2372.4, size: "10", qty: 1, total: 2372.4 },
];

describe("resolveInvoiceSizeColumns", () => {
  it("uses the org size group when every sold size belongs to it (blanks for unsold)", () => {
    const cols = resolveInvoiceSizeColumns(camel1868, ["5", "6", "7", "8", "9", "10", "11", "12", "13"]);
    expect(cols).toEqual(["5", "6", "7", "8", "9", "10", "11", "12", "13"]);
  });

  it("does not force one size group when the bill mixes unrelated sizes", () => {
    const mixed = [
      { particulars: "UK shoe", size: "7", qty: 1, total: 100, rate: 100 },
      { particulars: "EU shoe", size: "40", qty: 1, total: 100, rate: 100 },
    ];
    expect(resolveInvoiceSizeColumns(mixed, ["5", "6", "7", "8", "9"])).toEqual(["7", "40"]);
  });

  it("fills integer gaps between sold numeric sizes when no hint group applies", () => {
    expect(resolveInvoiceSizeColumns(camel1868)).toEqual(["7", "8", "9", "10"]);
    const gapped = [
      { particulars: "A", size: "7", qty: 1, total: 10, rate: 10 },
      { particulars: "A", size: "10", qty: 1, total: 10, rate: 10 },
    ];
    expect(resolveInvoiceSizeColumns(gapped)).toEqual(["7", "8", "9", "10"]);
  });
});

describe("pivotSaleItemsBySize", () => {
  it("collapses four SKU rows of the same product into one row with per-size qty", () => {
    const cols = resolveInvoiceSizeColumns(camel1868, ["7", "8", "9", "10"]);
    const pivot = pivotSaleItemsBySize(camel1868, cols);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0].productName).toBe("1868 CAML");
    expect(pivot.rows[0].qtyBySize).toEqual({ "7": 1, "8": 2, "9": 2, "10": 1 });
    expect(pivot.rows[0].totalPairs).toBe(6);
    expect(pivot.rows[0].amount).toBe(18554.4);
    expect(pivot.rows[0].netRate).toBe(3092.4);
    expect(pivot.rows[0].gstPercent).toBe(18);
    expect(pivot.totalPairs).toBe(6);
  });

  it("keeps separate product rows and totals pairs both by row and by size column", () => {
    const cols = ["7", "8", "9", "10"];
    const pivot = pivotSaleItemsBySize(mixedBill, cols);
    expect(pivot.rows).toHaveLength(2);
    expect(pivot.totalPairs).toBe(10);
    expect(pivot.columnQtyTotals).toEqual({ "7": 2, "8": 3, "9": 3, "10": 2 });
    expect(pivot.rows.reduce((s, r) => s + r.totalPairs, 0)).toBe(
      Object.values(pivot.columnQtyTotals).reduce((s, n) => s + n, 0),
    );
  });

  it("SPL DISCOUNT from MRP×qty − Net×qty is the merchandise gap, not the GST total", () => {
    const cols = resolveInvoiceSizeColumns(camel1868);
    const pivot = pivotSaleItemsBySize(camel1868, cols);
    // (4295 − 3092.40) × 6 = 7215.60
    expect(pivot.merchandiseDiscount).toBe(7215.6);
    expect(pivot.merchandiseDiscount).not.toBe(8465.38);
  });
});
