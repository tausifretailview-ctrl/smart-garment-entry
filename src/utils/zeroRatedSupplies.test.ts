import { describe, expect, it } from "vitest";
import { gstr1SupplyOf, zeroRatedOutward } from "./zeroRatedSupplies";

describe("gstr1SupplyOf", () => {
  it("is null for a regular bill and maps export / SEZ details", () => {
    expect(gstr1SupplyOf(null)).toBeNull();
    expect(gstr1SupplyOf({ po_number: "PO-1" })).toBeNull();
    expect(gstr1SupplyOf({ supply_type: "SEZWOP" })).toEqual({ supplyType: "SEZWOP", exportDetails: null });
    expect(
      gstr1SupplyOf({ supply_type: "EXPWP", ship_bill_no: "1234567", ship_bill_date: "2026-10-07", port_code: "INNSA1" }),
    ).toEqual({
      supplyType: "EXPWP",
      exportDetails: { shipBillNo: "1234567", shipBillDate: "2026-10-07", portCode: "INNSA1" },
    });
    expect(gstr1SupplyOf({ supply_type: "EXPWOP" })).toEqual({
      supplyType: "EXPWOP",
      exportDetails: { shipBillNo: null, shipBillDate: null, portCode: null },
    });
  });
});

describe("zeroRatedOutward", () => {
  it("splits lines the way get_gst_summary does", () => {
    const r = zeroRatedOutward([
      { tax_type: "exclusive", lines: [{ line_total: 10000, gst_percent: 18 }] },
      { tax_type: "inclusive", lines: [{ line_total: 1180, gst_percent: 18 }, { line_total: 500, gst_percent: 0 }] },
      { tax_type: null, lines: [{ line_total: 1050, gst_percent: 5 }] },
      { tax_type: "no_gst", lines: [{ line_total: 700, gst_percent: 12 }] },
    ]);
    expect(Math.round(r.taxable * 100) / 100).toBe(10000 + 1000 + 500 + 1000 + 700);
    expect(Math.round(r.igst * 100) / 100).toBe(1800 + 180 + 50);
    expect(r.count).toBe(4);
  });
});
