import { describe, expect, it } from "vitest";
import { resolveWappConnectPdfInvoiceTemplate } from "./resolveWappConnectPdfInvoiceTemplate";

describe("resolveWappConnectPdfInvoiceTemplate", () => {
  it("returns print template when override is null", () => {
    expect(resolveWappConnectPdfInvoiceTemplate("retail-erp-preprinted", null)).toBe(
      "retail-erp-preprinted",
    );
  });

  it("returns print template when override is empty or whitespace", () => {
    expect(resolveWappConnectPdfInvoiceTemplate("retail-erp-preprinted", "")).toBe(
      "retail-erp-preprinted",
    );
    expect(resolveWappConnectPdfInvoiceTemplate("retail-erp-preprinted", "   ")).toBe(
      "retail-erp-preprinted",
    );
  });

  it("returns override when set", () => {
    expect(resolveWappConnectPdfInvoiceTemplate("retail-erp-preprinted", "retail-erp")).toBe(
      "retail-erp",
    );
  });
});
