import { describe, expect, it } from "vitest";
import { addGstHsnReportLine, type GstHsnReportRow } from "./gstHsnReport";

const base = { hsn: "85171300", description: "PHONE A", uom: "NOS", qty: 1, rate: 18, taxable: 1000, gst: 180, interState: false };

describe("HSN product-detail report", () => {
  it("separates actual products sharing the same HSN", () => {
    const rows = new Map<string, GstHsnReportRow>();
    addGstHsnReportLine(rows, base);
    addGstHsnReportLine(rows, { ...base, description: "PHONE B" });
    addGstHsnReportLine(rows, base);
    expect([...rows.values()].map(r => [r.description, r.totalQty, r.totalValue])).toEqual([
      ["PHONE A", 2, 2360], ["PHONE B", 1, 1180],
    ]);
  });
  it("separates different rates and units without rounding decimal quantities", () => {
    const rows = new Map<string, GstHsnReportRow>();
    addGstHsnReportLine(rows, base);
    addGstHsnReportLine(rows, { ...base, rate: 5, gst: 50 });
    addGstHsnReportLine(rows, { ...base, uom: "MTR", qty: 1.125 });
    expect([...rows.values()].map(r => [r.rate, r.uqc, r.totalQty])).toEqual([[18, "NOS", 1], [5, "NOS", 1], [18, "MTR", 1.125]]);
  });
  it("does not fabricate an HSN or change the M17 zero-rate sale of 24500", () => {
    const rows = new Map<string, GstHsnReportRow>();
    addGstHsnReportLine(rows, { ...base, hsn: null, description: "M17 5G", rate: 0, taxable: 24500, gst: 0 });
    expect([...rows.values()][0]).toMatchObject({ hsnCode: "", rate: 0, totalValue: 24500, taxableValue: 24500, cgst: 0, sgst: 0 });
  });
  it("keeps interstate GST in IGST and zero quantities at zero", () => {
    const rows = new Map<string, GstHsnReportRow>();
    addGstHsnReportLine(rows, { ...base, qty: 0, interState: true });
    expect([...rows.values()][0]).toMatchObject({ totalQty: 0, igst: 180, cgst: 0, sgst: 0 });
  });
});