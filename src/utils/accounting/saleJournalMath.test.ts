import { describe, expect, it } from "vitest";
import {
  computeSaleRevenueBreakdown,
  counterTenderInSaleJournal,
  isOnOrAfterReturnCreditCutover,
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
