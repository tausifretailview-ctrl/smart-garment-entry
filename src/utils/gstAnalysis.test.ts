import { describe, expect, it } from "vitest";
import {
  computeGstSetOff,
  docAtRate,
  gstr3bDueDate,
  netByRate,
  purchaseDocTaxes,
  round2,
  saleDocTaxes,
  saleReturnDocTaxes,
  sumByRate,
} from "./gstAnalysis";

const SHOP = "27ABCDE1234F1Z5"; // Maharashtra
const head = (over: Partial<{ gstin: string }> = {}) => ({
  id: "1",
  date: "2026-10-05",
  number: "B1",
  party: "Party",
  gstin: "",
  billValue: 0,
  ...over,
});

describe("saleDocTaxes", () => {
  it("takes the bill discount off before splitting inclusive GST", () => {
    const doc = saleDocTaxes(head(), [
      { line_total: 1100, discount_share: 50, gst_percent: 5 },
      { line_total: 1180, discount_share: 0, gst_percent: 18 },
    ], "inclusive", SHOP);
    expect(round2(doc.rates[0].taxable)).toBe(1000);
    expect(round2(doc.rates[0].cgst + doc.rates[0].sgst)).toBe(50);
    expect(round2(doc.rates[1].taxable)).toBe(1000);
    expect(round2(doc.igst)).toBe(0);
    expect(doc.registered).toBe(false);
  });

  it("charges IGST to an other-state GSTIN customer and adds GST on exclusive bills", () => {
    const doc = saleDocTaxes(head({ gstin: "24AAAAA0000A1Z5" }), [
      { line_total: 1000, gst_percent: 18 },
    ], "exclusive", SHOP);
    expect(doc.interState).toBe(true);
    expect(doc.registered).toBe(true);
    expect(round2(doc.igst)).toBe(180);
    expect(doc.cgst).toBe(0);
  });
});

describe("saleReturnDocTaxes", () => {
  it("scales lines to the GST saved on the credit note", () => {
    const doc = saleReturnDocTaxes({ ...head(), headerGst: 45 }, [{ line_total: 1050, gst_percent: 5 }], "inclusive", SHOP);
    expect(round2(doc.cgst + doc.sgst)).toBe(45);
    expect(round2(doc.taxable)).toBe(900);
  });
});

describe("purchaseDocTaxes", () => {
  it("spreads the bill discount over the lines, then charges GST per rate", () => {
    const doc = purchaseDocTaxes({ ...head(), headerTaxable: 1800 }, [
      { line_total: 1000, gst_per: 5 },
      { line_total: 1000, gst_per: 18 },
    ], SHOP);
    expect(round2(doc.taxable)).toBe(1800);
    expect(round2(doc.rates[0].cgst * 2)).toBe(45);
    expect(round2(doc.rates[1].cgst * 2)).toBe(162);
  });

  it("ignores a header taxable above the lines (old data)", () => {
    const doc = purchaseDocTaxes({ ...head(), headerTaxable: 5000 }, [{ line_total: 1000, gst_per: 5 }], SHOP);
    expect(round2(doc.taxable)).toBe(1000);
  });
});

describe("rate helpers", () => {
  it("nets returns off rate by rate and filters a document to one rate", () => {
    const sale = saleDocTaxes(head(), [
      { line_total: 1050, gst_percent: 5 },
      { line_total: 1180, gst_percent: 18 },
    ], "inclusive", SHOP);
    const ret = saleReturnDocTaxes({ ...head(), headerGst: 0 }, [{ line_total: 525, gst_percent: 5 }], "inclusive", SHOP);
    const net = netByRate(sumByRate([sale]), sumByRate([ret]));
    expect(round2(net[0].taxable)).toBe(500);
    expect(round2(net[1].taxable)).toBe(1000);
    expect(docAtRate(sale, 12)).toBeNull();
    expect(round2(docAtRate(sale, 18)!.taxable)).toBe(1000);
  });
});

describe("computeGstSetOff", () => {
  it("pays CGST and SGST from own credit and the rest in cash", () => {
    const s = computeGstSetOff({ igst: 0, cgst: 1000, sgst: 1000 }, { igst: 0, cgst: 600, sgst: 700 });
    expect(s.cash).toEqual({ igst: 0, cgst: 400, sgst: 300 });
    expect(s.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  });

  it("uses IGST credit first, where own CGST/SGST credit falls short", () => {
    const s = computeGstSetOff({ igst: 100, cgst: 500, sgst: 500 }, { igst: 400, cgst: 500, sgst: 200 });
    expect(s.usedIgst).toEqual({ igst: 100, cgst: 0, sgst: 300 });
    expect(s.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(s.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  });

  it("never lets CGST credit pay SGST", () => {
    const s = computeGstSetOff({ igst: 0, cgst: 100, sgst: 500 }, { igst: 0, cgst: 900, sgst: 0 });
    expect(s.cash.sgst).toBe(500);
    expect(s.carryForward.cgst).toBe(800);
  });

  it("lets CGST / SGST credit pay IGST after their own head", () => {
    const s = computeGstSetOff({ igst: 300, cgst: 100, sgst: 100 }, { igst: 0, cgst: 300, sgst: 100 });
    expect(s.usedCgst.igst).toBe(200);
    expect(s.cash).toEqual({ igst: 100, cgst: 0, sgst: 0 });
  });

  it("treats a negative liability as zero and carries the credit forward", () => {
    const s = computeGstSetOff({ igst: 0, cgst: -50, sgst: -50 }, { igst: 10, cgst: 20, sgst: 30 });
    expect(s.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(s.carryForward).toEqual({ igst: 10, cgst: 20, sgst: 30 });
  });
});

describe("computeGstSetOff reversal", () => {
  it("adds negative credit (returns above purchases) to the tax", () => {
    const s = computeGstSetOff({ igst: 0, cgst: 100, sgst: 100 }, { igst: 0, cgst: -40, sgst: 0 });
    expect(s.cash).toEqual({ igst: 0, cgst: 140, sgst: 100 });
  });
});

describe("gstr3bDueDate", () => {
  it("is the 20th of the next month", () => {
    expect(gstr3bDueDate("2026-10-31")?.toDateString()).toBe(new Date(2026, 10, 20).toDateString());
    expect(gstr3bDueDate("2026-12-31")?.toDateString()).toBe(new Date(2027, 0, 20).toDateString());
  });
});
