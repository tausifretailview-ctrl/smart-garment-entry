import { describe, expect, it } from "vitest";
import {
  computeSaleRevenueBreakdown,
  counterTenderInSaleJournal,
  isOnOrAfterReturnCreditCutover,
  saleOrphanHeaderDiscount,
  saleReturnGstBreakdown,
  splitMixCounterTender,
} from "@/utils/accounting/saleJournalMath";

describe("computeSaleRevenueBreakdown", () => {
  it("POS exclusive: line_total is pre-tax, GST is added on top", () => {
    const r = computeSaleRevenueBreakdown([{ line_total: 1000, gst_percent: 18 }], {
      taxType: "exclusive",
      saleType: "pos",
    });
    expect(r.grossTaxable).toBe(1000);
    expect(r.flatDiscountTaxable).toBe(0);
    expect(r.gst.totalGst).toBe(180);
    expect(r.gst.cgst + r.gst.sgst).toBe(180);
  });

  it("POS inclusive with flat discount: GST on the discounted value", () => {
    const r = computeSaleRevenueBreakdown([{ line_total: 1180, gst_percent: 18 }], {
      taxType: "inclusive",
      saleType: "pos",
      flatDiscount: 118,
    });
    expect(r.grossTaxable).toBe(1000);
    expect(r.flatDiscountTaxable).toBe(100);
    expect(r.gst.totalGst).toBe(162);
    expect(r.gst.taxableAmount).toBe(900);
    // Sales - Trade Discount + GST = bill after flat discount
    expect(r.grossTaxable - r.flatDiscountTaxable + r.gst.totalGst).toBe(1180 - 118);
  });

  it("Sales Invoice exclusive: line_total includes GST, flat discount is pre-tax", () => {
    const r = computeSaleRevenueBreakdown([{ line_total: 1180, gst_percent: 18 }], {
      taxType: "exclusive",
      saleType: "invoice",
      flatDiscount: 100,
    });
    expect(r.grossTaxable).toBe(1000);
    expect(r.flatDiscountTaxable).toBe(100);
    expect(r.gst.totalGst).toBe(162);
    expect(r.grossTaxable - r.flatDiscountTaxable + r.gst.totalGst).toBe(1062);
  });

  it("shares the flat discount across lines by value", () => {
    const r = computeSaleRevenueBreakdown(
      [
        { line_total: 1000, gst_percent: 18 },
        { line_total: 500, gst_percent: 5 },
      ],
      { taxType: "exclusive", saleType: "pos", flatDiscount: 150 },
    );
    expect(r.grossTaxable).toBe(1500);
    expect(r.flatDiscountTaxable).toBe(150);
    expect(r.gst.totalGst).toBe(184.5);
  });

  it("no_gst bills book the whole line as revenue", () => {
    const r = computeSaleRevenueBreakdown([{ line_total: 500, gst_percent: 12 }], {
      taxType: "no_gst",
      saleType: "pos",
    });
    expect(r.grossTaxable).toBe(500);
    expect(r.gst.totalGst).toBe(0);
  });

  it("caps the flat discount at the line value", () => {
    const r = computeSaleRevenueBreakdown([{ line_total: 100, gst_percent: 0 }], {
      taxType: "inclusive",
      saleType: "pos",
      flatDiscount: 250,
    });
    expect(r.flatDiscountTaxable).toBe(100);
    expect(r.gst.taxableAmount).toBe(0);
  });
});

describe("counterTenderInSaleJournal", () => {
  it("removes journaled receipts and credit notes beyond the S/R adjust", () => {
    expect(
      counterTenderInSaleJournal({
        paidAmount: 1000,
        journaledReceiptTotal: 400,
        creditNoteVoucherTotal: 300,
        saleReturnAdjust: 200,
      }),
    ).toBe(500);
  });

  it("keeps the full tender when nothing else settled the bill", () => {
    expect(
      counterTenderInSaleJournal({
        paidAmount: 750,
        journaledReceiptTotal: 0,
        creditNoteVoucherTotal: 0,
        saleReturnAdjust: 0,
      }),
    ).toBe(750);
  });

  it("never goes below zero", () => {
    expect(
      counterTenderInSaleJournal({
        paidAmount: 300,
        journaledReceiptTotal: 500,
        creditNoteVoucherTotal: 0,
        saleReturnAdjust: 0,
      }),
    ).toBe(0);
  });
});

describe("isOnOrAfterReturnCreditCutover", () => {
  it("splits at midnight 10 Oct 2026 India time", () => {
    expect(isOnOrAfterReturnCreditCutover("2026-10-09T18:29:59Z")).toBe(false);
    expect(isOnOrAfterReturnCreditCutover("2026-10-09T18:30:00Z")).toBe(true);
    expect(isOnOrAfterReturnCreditCutover("2026-10-12T10:00:00+05:30")).toBe(true);
  });

  it("treats a missing or unreadable date as new", () => {
    expect(isOnOrAfterReturnCreditCutover(null)).toBe(true);
    expect(isOnOrAfterReturnCreditCutover("not a date")).toBe(true);
  });
});

describe("splitMixCounterTender", () => {
  it("Mix bill: applied cash to Cash in Hand, rest to bank", () => {
    expect(splitMixCounterTender({ paymentMethod: "multiple", counterPaid: 1000, cashAmount: 400 })).toEqual({
      cash: 400,
      other: 600,
    });
  });

  it("Mix bill: cash never exceeds the counter tender", () => {
    expect(splitMixCounterTender({ paymentMethod: "multiple", counterPaid: 300, cashAmount: 500 })).toEqual({
      cash: 300,
      other: 0,
    });
  });

  it("single-mode bills are not split", () => {
    expect(splitMixCounterTender({ paymentMethod: "upi", counterPaid: 800, cashAmount: 800 })).toEqual({
      cash: 0,
      other: 800,
    });
  });
});

describe("saleOrphanHeaderDiscount", () => {
  it("POS: selling below MRP is already in the line total, nothing left for Trade Discount", () => {
    // MRP 1000, sold at 850, 10% off MRP → line 750; POS header discount = 100 + 150.
    const items = [{ unit_price: 850, mrp: 1000, quantity: 1, line_total: 750 }];
    expect(saleOrphanHeaderDiscount(items, 250, 0)).toBe(0);
  });

  it("Sales Invoice: header discount measured against the selling rate", () => {
    const items = [{ unit_price: 500, mrp: 600, quantity: 2, line_total: 900 }];
    expect(saleOrphanHeaderDiscount(items, 100, 50)).toBe(0);
  });

  it("POS Delivery Challan: header discount is the flat discount", () => {
    const items = [{ unit_price: 400, mrp: 400, quantity: 1, line_total: 400 }];
    expect(saleOrphanHeaderDiscount(items, 40, 40)).toBe(0);
  });

  it("keeps a header-only discount that no line or flat discount carries", () => {
    const items = [{ unit_price: 500, mrp: 500, quantity: 1, line_total: 500 }];
    expect(saleOrphanHeaderDiscount(items, 30, 0)).toBe(30);
  });

  it("GST-exclusive invoice: line total has GST on top, the line discount is still found", () => {
    // Rate 1000 pre-tax, 10% off → 900, + 18% GST → line 1062; header discount = 100.
    const items = [{ unit_price: 1000, mrp: 1000, quantity: 1, line_total: 1062, gst_percent: 18 }];
    expect(saleOrphanHeaderDiscount(items, 100, 0, { taxType: "exclusive", saleType: "invoice" })).toBe(0);
    // Without the tax type the GST hides the discount and all 100 would go to Trade Discount.
    expect(saleOrphanHeaderDiscount(items, 100, 0)).toBe(100);
  });

  it("GST-exclusive POS: line total is pre-tax already", () => {
    const items = [{ unit_price: 1000, mrp: 1000, quantity: 1, line_total: 900, gst_percent: 18 }];
    expect(saleOrphanHeaderDiscount(items, 100, 0, { taxType: "exclusive", saleType: "pos" })).toBe(0);
  });
});

describe("saleReturnGstBreakdown", () => {
  it("GST-exclusive return: pre-tax lines, header GST is reversed in full", () => {
    const r = saleReturnGstBreakdown({
      netAmount: 1180,
      headerGst: 180,
      items: [{ line_total: 1000, gst_percent: 18 }],
    });
    expect(r.taxableAmount).toBe(1000);
    expect(r.totalGst).toBe(180);
    expect(r.cgst + r.sgst).toBe(180);
  });

  it("GST-inclusive return: GST extracted from each line", () => {
    const r = saleReturnGstBreakdown({
      netAmount: 1180,
      headerGst: 180,
      items: [{ line_total: 1180, gst_percent: 18 }],
    });
    expect(r.taxableAmount).toBe(1000);
    expect(r.totalGst).toBe(180);
  });

  it("header without GST falls back to the lines", () => {
    const r = saleReturnGstBreakdown({
      netAmount: 1050,
      headerGst: 0,
      items: [{ line_total: 1050, gst_percent: 5 }],
    });
    expect(r.taxableAmount).toBe(1000);
    expect(r.totalGst).toBe(50);
  });
});
