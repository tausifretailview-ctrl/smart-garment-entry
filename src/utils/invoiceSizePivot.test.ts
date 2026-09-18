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

  it("SANJAY bill 74: 7 products pivot to 32 pairs with column totals 4/10/11/7", () => {
    const line = (
      name: string,
      hsn: string,
      gst: number,
      mrp: number,
      disc: number,
      rate: number,
      size: string,
      qty: number,
    ) => ({
      particulars: name,
      hsn,
      gstPercent: gst,
      mrp,
      discountPercent: disc,
      rate,
      size,
      qty,
      total: Math.round(rate * qty * 100) / 100,
    });
    const bill74 = [
      line("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "7", 1),
      line("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "8", 1),
      line("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "9", 1),
      line("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "10", 1),
      line("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "7", 1),
      line("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "8", 2),
      line("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "9", 2),
      line("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "10", 1),
      line("2667 CAML", "64039990", 5, 2080, 28, 1497.6, "7", 1),
      line("2667 CAML", "64039990", 5, 2080, 28, 1497.6, "8", 1),
      line("2667 CAML", "64039990", 5, 2080, 28, 1497.6, "9", 2),
      line("2667 CAML", "64039990", 5, 2080, 28, 1497.6, "10", 1),
      line("4024 CAMEL", "64051000", 5, 3495, 28.5, 2498.92, "7", 1),
      line("4024 CAMEL", "64051000", 5, 3495, 28.5, 2498.92, "8", 2),
      line("4024 CAMEL", "64051000", 5, 3495, 28.5, 2498.92, "9", 2),
      line("4024 CAMEL", "64051000", 5, 3495, 28.5, 2498.92, "10", 1),
      line("40777 CAMEL", "64051000", 18, 4495, 28, 3236.4, "8", 2),
      line("40777 CAMEL", "64051000", 18, 4495, 28, 3236.4, "9", 2),
      line("40777 CAMEL", "64051000", 18, 4495, 28, 3236.4, "10", 2),
      line("6193 CML", "64039990", 5, 3295, 28, 2372.4, "8", 1),
      line("6193 CML", "64039990", 5, 3295, 28, 2372.4, "9", 1),
      line("6193 CML", "64039990", 5, 3295, 28, 2372.4, "10", 1),
      line("777 CAMEL", "64051000", 18, 3695, 28, 2660.4, "8", 1),
      line("777 CAMEL", "64051000", 18, 3695, 28, 2660.4, "9", 1),
    ];
    const cols = resolveInvoiceSizeColumns(bill74, ["5", "6", "7", "8", "9", "10", "11", "12", "13"]);
    const pivot = pivotSaleItemsBySize(bill74, cols);
    expect(bill74).toHaveLength(24);
    expect(pivot.rows).toHaveLength(7);
    expect(pivot.totalPairs).toBe(32);
    expect(pivot.columnQtyTotals).toEqual({
      "5": 0,
      "6": 0,
      "7": 4,
      "8": 10,
      "9": 11,
      "10": 7,
      "11": 0,
      "12": 0,
      "13": 0,
    });
    expect(pivot.totalAmount).toBe(82381.92);
    expect(pivot.merchandiseDiscount).toBe(32183.08);
    expect(pivot.merchandiseDiscount).not.toBe(8465.38);
  });
});
