import { describe, expect, it } from "vitest";
import {
  buildPosSaleHeaderSearchFilter,
  looksLikeInvoiceSequence,
  rankPosDashboardSearchResults,
  shouldUnionSaleItemsForPosSearch,
} from "./posDashboardSearch";

describe("looksLikeInvoiceSequence", () => {
  it("matches short numeric invoice serials", () => {
    expect(looksLikeInvoiceSequence("1029")).toBe(true);
    expect(looksLikeInvoiceSequence("1")).toBe(true);
  });

  it("rejects mixed or long inputs", () => {
    expect(looksLikeInvoiceSequence("POS/26-27/1029")).toBe(false);
    expect(looksLikeInvoiceSequence("1234567")).toBe(false);
    expect(looksLikeInvoiceSequence("abc")).toBe(false);
  });
});

describe("shouldUnionSaleItemsForPosSearch", () => {
  it("skips line-item union for invoice serial searches", () => {
    expect(shouldUnionSaleItemsForPosSearch("1029")).toBe(false);
  });

  it("allows line-item union for long numeric barcodes", () => {
    expect(shouldUnionSaleItemsForPosSearch("10001220")).toBe(true);
  });

  it("allows line-item union for product text", () => {
    expect(shouldUnionSaleItemsForPosSearch("silk")).toBe(true);
  });
});

describe("buildPosSaleHeaderSearchFilter", () => {
  it("adds suffix match for invoice serials", () => {
    expect(buildPosSaleHeaderSearchFilter("1029")).toContain("sale_number.ilike.%/1029");
  });
});

describe("rankPosDashboardSearchResults", () => {
  const rows = [
    { id: "1", sale_number: "POS/25-26/1029", sale_date: "2026-03-16T10:00:00Z" },
    { id: "2", sale_number: "POS/26-27/1029", sale_date: "2026-06-12T15:00:00Z" },
    { id: "3", sale_number: "POS/26-27/772", sale_date: "2026-05-25T10:00:00Z" },
  ];

  it("ranks exact serial suffix matches first", () => {
    const ranked = rankPosDashboardSearchResults(rows, "1029");
    expect(ranked[0].sale_number).toBe("POS/26-27/1029");
    expect(ranked[1].sale_number).toBe("POS/25-26/1029");
  });
});
