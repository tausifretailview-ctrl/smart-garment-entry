import { describe, expect, it } from "vitest";
import { describeLines, duplicableSaleItems, isDuplicateInvoiceEnabled, linesWithNoStock } from "./saleDuplicateInvoice";

describe("Duplicate invoice", () => {
  it("is off until Settings → Sale → Duplicate invoice is turned on", () => {
    expect(isDuplicateInvoiceEnabled(undefined)).toBe(false);
    expect(isDuplicateInvoiceEnabled({})).toBe(false);
    expect(isDuplicateInvoiceEnabled({ duplicate_invoice: "yes" })).toBe(false);
    expect(isDuplicateInvoiceEnabled({ duplicate_invoice: true })).toBe(true);
  });

  it("copies only live lines with a product and a quantity", () => {
    const items = [
      { id: "a", product_id: "p1", quantity: 2, deleted_at: null },
      { id: "b", product_id: "p2", quantity: 1, deleted_at: "2026-11-20T10:00:00Z" },
      { id: "c", product_id: null, quantity: 1 },
      { id: "d", product_id: "p3", quantity: 0 },
    ];
    expect(duplicableSaleItems(items).map((i) => i.id)).toEqual(["a"]);
    expect(duplicableSaleItems(null)).toEqual([]);
  });

  it("finds lines with no stock; services, no barcode and unknown stock are kept", () => {
    const lines = [
      { id: "1", variantId: "v1", productName: "SHIRT", size: "M" },
      { id: "2", variantId: "v2", productName: "JEANS", size: "32" },
      { id: "3", variantId: "v3", productName: "ALTERATION", productType: "service" },
      { id: "4", variantId: null, productName: "CUSTOM" },
      { id: "5", variantId: "v5", productName: "CAP" },
      { id: "6", variantId: "v6", productName: "BELT" },
    ];
    const stock = { v1: 0, v2: 4, v3: 0, v6: -2 };
    expect(linesWithNoStock(lines, stock).map((l) => l.id)).toEqual(["1", "6"]);
  });

  it("names the lines for the notice", () => {
    const lines = [{ id: "1", productName: "SHIRT", size: "M" }, { id: "2", productName: "JEANS" }, { id: "3" }, { id: "4" }, { id: "5" }];
    expect(describeLines(lines.slice(0, 2))).toBe("SHIRT M, JEANS");
    expect(describeLines(lines)).toBe("SHIRT M, JEANS, item and 2 more");
  });
});
