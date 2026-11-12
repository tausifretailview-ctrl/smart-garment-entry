import { describe, expect, it } from "vitest";
import { lineTaxableAndGst, outwardTotalsFromBills, resolveReportTaxType } from "./gstOutwardTotals";

const SHOP = "27AAAAA0000A1Z5"; // Maharashtra
const SAME_STATE_BUYER = "27BBBBB1111B1Z5";
const OTHER_STATE_BUYER = "29CCCCC2222C1Z5"; // Karnataka

describe("lineTaxableAndGst", () => {
  it("splits inclusive, adds on exclusive, no tax on no_gst", () => {
    const inc = lineTaxableAndGst(1120, 12, "inclusive");
    expect(inc.taxable).toBeCloseTo(1000, 6);
    expect(inc.gst).toBeCloseTo(120, 6);
    expect(lineTaxableAndGst(1000, 12, "exclusive")).toEqual({ taxable: 1000, gst: 120 });
    expect(lineTaxableAndGst(1000, 12, "no_gst")).toEqual({ taxable: 1000, gst: 0 });
  });
});

describe("resolveReportTaxType", () => {
  it("uses the bill's own tax type before the shop default", () => {
    expect(resolveReportTaxType("exclusive", "pos", null)).toBe("exclusive");
  });
});

describe("outwardTotalsFromBills (GSTR-3B 3.1 = GSTR-1 rules)", () => {
  it("takes the bill discount off each line before the GST split", () => {
    const t = outwardTotalsFromBills(
      [{ id: "b1", tax_type: "inclusive", customerGstin: "" }],
      [{ sale_id: "b1", line_total: 1120, discount_share: 112, gst_percent: 12 }],
      { businessGstin: SHOP },
    );
    expect(t.taxable).toBeCloseTo(900, 6); // (1120 - 112) / 1.12
    expect(t.cgst + t.sgst).toBeCloseTo(108, 6);
    expect(t.igst).toBe(0);
  });

  it("puts a sale to another state, and an export bill, under IGST", () => {
    const t = outwardTotalsFromBills(
      [
        { id: "local", tax_type: "exclusive", customerGstin: SAME_STATE_BUYER },
        { id: "inter", tax_type: "exclusive", customerGstin: OTHER_STATE_BUYER },
        { id: "export", tax_type: "exclusive", customerGstin: "", zeroRated: true },
      ],
      [
        { sale_id: "local", line_total: 1000, gst_percent: 18 },
        { sale_id: "inter", line_total: 1000, gst_percent: 18 },
        { sale_id: "export", line_total: 500, gst_percent: 18 },
      ],
      { businessGstin: SHOP },
    );
    expect(t.taxable).toBe(2500);
    expect(t.cgst).toBeCloseTo(90, 6);
    expect(t.sgst).toBeCloseTo(90, 6);
    expect(t.igst).toBeCloseTo(270, 6);
  });

  it("counts only the bills passed in (held / debit-note bills are filtered by the caller)", () => {
    const t = outwardTotalsFromBills([], [{ sale_id: "held", line_total: 999, gst_percent: 5 }], { businessGstin: SHOP });
    expect(t).toEqual({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
  });
});
