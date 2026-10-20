import { describe, expect, it } from "vitest";
import { buildHsnTaxSummary } from "@/utils/hsnTaxSummary";

describe("buildHsnTaxSummary", () => {
  it("matches the DEMO INV/26-27/53 bill (500 incl. 5%, no HSN)", () => {
    const s = buildHsnTaxSummary({
      items: [{ total: 500, gstPercent: 5, qty: 1, hsn: "" }],
      taxType: "inclusive",
      grandTotal: 500,
      isInterState: false,
      targetTax: 23.8,
    });
    expect(s.rows).toEqual([
      { hsn: "-", gstPercent: 5, taxable: 476.19, cgst: 11.9, sgst: 11.9, igst: 0, tax: 23.8 },
    ]);
  });

  it("groups by HSN and rate, skips 0% lines", () => {
    const s = buildHsnTaxSummary({
      items: [
        { total: 1050, gstPercent: 5, qty: 1, hsn: "6405" },
        { total: 2100, gstPercent: 5, qty: 2, hsn: "6405" },
        { total: 1180, gstPercent: 18, qty: 1, hsn: "6405" },
        { total: 100, gstPercent: 0, qty: 1, hsn: "4901" },
      ],
      taxType: "inclusive",
      grandTotal: 4430,
      isInterState: false,
    });
    expect(s.rows.map((r) => [r.hsn, r.gstPercent, r.taxable, r.tax])).toEqual([
      ["6405", 5, 3000, 150],
      ["6405", 18, 1000, 180],
    ]);
    expect(s.total.taxable).toBe(4000);
    expect(s.total.cgst).toBe(165);
    expect(s.total.tax).toBe(330);
  });

  it("scales rows to the bill's tax after a bill discount", () => {
    const s = buildHsnTaxSummary({
      items: [{ total: 1050, gstPercent: 5, qty: 1, hsn: "6109" }],
      taxType: "inclusive",
      grandTotal: 945,
      isInterState: false,
      targetTax: 45,
    });
    expect(s.rows[0].taxable).toBe(900);
    expect(s.rows[0].tax).toBe(45);
  });

  it("puts tax in IGST for inter-state bills", () => {
    const s = buildHsnTaxSummary({
      items: [{ total: 1180, gstPercent: 18, qty: 1, hsn: "6403" }],
      taxType: "inclusive",
      grandTotal: 1180,
      isInterState: true,
    });
    expect(s.rows[0]).toMatchObject({ igst: 180, cgst: 0, sgst: 0, tax: 180 });
  });
});
