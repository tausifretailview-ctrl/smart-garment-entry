import { describe, expect, it } from "vitest";
import { shouldUnionSaleItemsForInvoiceSearch } from "@/utils/invoiceDashboardData";

describe("shouldUnionSaleItemsForInvoiceSearch", () => {
  it("runs line-item path for customer-like names ≥4 letters (item 1 NOT gating)", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("ANUSHA PATHAN")).toBe(true);
    expect(shouldUnionSaleItemsForInvoiceSearch("ABC")).toBe(false);
  });

  it("requires ≥8 digits for numeric barcode-like terms", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("1234567")).toBe(false);
    expect(shouldUnionSaleItemsForInvoiceSearch("12345678")).toBe(true);
  });

  it("skips empty search", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("")).toBe(false);
    expect(shouldUnionSaleItemsForInvoiceSearch("   ")).toBe(false);
  });
});
