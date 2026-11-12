import { describe, expect, it } from "vitest";
import { buildSaleNumberRequest, minSequenceFromSeriesStart, trailingSaleSequence } from "./saleNumber";

describe("trailingSaleSequence", () => {
  it("reads only the trailing invoice sequence", () => {
    expect(trailingSaleSequence("INV/26-27/18")).toBe(18);
    expect(trailingSaleSequence("INV/26-27/262")).toBe(262);
    expect(trailingSaleSequence("POS/26-27/4")).toBe(4);
  });

  it("does not concatenate FY digits (legacy bug: 262718)", () => {
    expect(trailingSaleSequence("INV/26-27/18")).not.toBe(262718);
  });
});

describe("minSequenceFromSeriesStart", () => {
  it("treats series start as last issued number", () => {
    expect(minSequenceFromSeriesStart("INV/26-27/18")).toBe(19);
    expect(minSequenceFromSeriesStart("261")).toBe(262);
  });
});

describe("buildSaleNumberRequest", () => {
  const now = new Date(2026, 10, 12); // 12 Nov 2026

  it("uses the default series when no format or series start is set", () => {
    expect(buildSaleNumberRequest(null, "pos", now)).toEqual({
      kind: "pos", format: null, year: "2026", month: "11", min_sequence: 1,
    });
    expect(buildSaleNumberRequest({ pos_numbering_format: "" }, "sale", now).format).toBeNull();
  });

  it("keeps a custom format and reads the minimum from Series Start From", () => {
    const r = buildSaleNumberRequest(
      { pos_numbering_format: "BILL/{YYYY}/{####}", pos_series_start: "BILL/2026/0041" },
      "pos",
      now,
    );
    expect(r.format).toBe("BILL/{YYYY}/{####}");
    expect(r.min_sequence).toBe(42);
  });

  it("turns a bare Series Start From into a format with a number placeholder", () => {
    const r = buildSaleNumberRequest({ invoice_series_start: "GST7" }, "sale", now);
    expect(r.format).toBe("GST{###}");
    expect(r.min_sequence).toBe(8);
    expect(buildSaleNumberRequest({ invoice_series_start: "SHOP-" }, "sale", now).format).toBe("SHOP-{###}");
  });

  it("reads the POS keys for POS and the invoice keys for invoices", () => {
    const settings = { pos_numbering_format: "P/{###}", invoice_numbering_format: "I/{###}" };
    expect(buildSaleNumberRequest(settings, "pos", now).format).toBe("P/{###}");
    expect(buildSaleNumberRequest(settings, "sale", now).format).toBe("I/{###}");
  });
});
