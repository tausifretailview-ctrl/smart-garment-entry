import { describe, expect, it } from "vitest";
import {
  POS_DASHBOARD_SEARCH_HINT,
  POS_DASHBOARD_SEARCH_PLACEHOLDER,
  buildPosSaleHeaderSearchFilter,
  looksLikeInvoiceSequence,
  rankPosDashboardSearchResults,
  shouldUnionSaleItemsForPosSearch,
} from "./posDashboardSearch";

describe("POS dashboard restore find copy", () => {
  it("tells cashiers not to search the rupee amount", () => {
    expect(POS_DASHBOARD_SEARCH_PLACEHOLDER).toContain("not ₹ amount");
    expect(POS_DASHBOARD_SEARCH_HINT).toContain("serial");
    expect(POS_DASHBOARD_SEARCH_HINT).toContain("today");
  });
});

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

  it("skips union for short field serials under the ≥8 digit barcode gate", () => {
    // Realistic POS serials are POS/YY-YY/N — users type the trailing N (often 1–4 digits).
    expect(shouldUnionSaleItemsForPosSearch("205")).toBe(false);
    expect(shouldUnionSaleItemsForPosSearch("1")).toBe(false);
    expect(shouldUnionSaleItemsForPosSearch("999999")).toBe(false); // still invoice-serial length
  });

  it("allows line-item union for long numeric barcodes", () => {
    expect(shouldUnionSaleItemsForPosSearch("10001220")).toBe(true);
  });

  it("skips short numeric stubs that are not invoice serials", () => {
    // 7 digits is past invoice-serial length but still below barcode min.
    expect(shouldUnionSaleItemsForPosSearch("1234567")).toBe(false);
  });

  it("allows line-item union for product text of 4+ chars", () => {
    expect(shouldUnionSaleItemsForPosSearch("silk")).toBe(true);
  });

  it("skips short product text that would burn sale_items ILIKE per keystroke", () => {
    expect(shouldUnionSaleItemsForPosSearch("ab")).toBe(false);
    expect(shouldUnionSaleItemsForPosSearch("abc")).toBe(false);
  });
});

describe("buildPosSaleHeaderSearchFilter", () => {
  it("adds suffix match for invoice serials", () => {
    expect(buildPosSaleHeaderSearchFilter("1029")).toContain("sale_number.ilike.%/1029");
  });

  it("resolves short serial 205 via header suffix path (not sale_items union)", () => {
    expect(looksLikeInvoiceSequence("205")).toBe(true);
    expect(shouldUnionSaleItemsForPosSearch("205")).toBe(false);
    const filter = buildPosSaleHeaderSearchFilter("205");
    expect(filter).toContain("sale_number.ilike.%/205");
    expect(filter).toContain("sale_number.ilike.%205%");
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

  it("ranks short serial 205 to POS/26-27/205 ahead of substring noise", () => {
    const fieldRows = [
      { id: "a", sale_number: "POS/26-27/1205", sale_date: "2026-06-01T10:00:00Z" },
      { id: "b", sale_number: "POS/26-27/205", sale_date: "2026-06-12T15:00:00Z" },
      { id: "c", sale_number: "POS/25-26/205", sale_date: "2026-03-16T10:00:00Z" },
    ];
    const ranked = rankPosDashboardSearchResults(fieldRows, "205");
    expect(ranked[0].sale_number).toBe("POS/26-27/205");
    expect(ranked[1].sale_number).toBe("POS/25-26/205");
    // Substring hit on /1205 ranks below exact /205 suffix.
    expect(ranked[2].sale_number).toBe("POS/26-27/1205");
  });
});
