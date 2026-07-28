import { describe, expect, it } from "vitest";
import {
  formatRetailErpInvoiceSize,
  retailErpWhatsAppProductLabel,
} from "./retailErpWhatsAppProductLabel";

describe("retailErpWhatsAppProductLabel", () => {
  it("prefers explicit productNameOnly", () => {
    expect(
      retailErpWhatsAppProductLabel("LONG-NAME-BRAND-CAT", "SHORT"),
    ).toBe("SHORT");
  });

  it("takes the first hyphen segment when no explicit name", () => {
    expect(
      retailErpWhatsAppProductLabel("31 PINK DUCHESS-COSMETICS-REVLON-PINK"),
    ).toBe("31 PINK DUCHESS");
  });

  it("returns empty for blank input", () => {
    expect(retailErpWhatsAppProductLabel("")).toBe("");
  });
});

describe("formatRetailErpInvoiceSize", () => {
  it("hides None / Standard placeholders", () => {
    expect(formatRetailErpInvoiceSize("None")).toBe("");
    expect(formatRetailErpInvoiceSize("none")).toBe("");
    expect(formatRetailErpInvoiceSize("Standard")).toBe("");
    expect(formatRetailErpInvoiceSize("N/A")).toBe("");
    expect(formatRetailErpInvoiceSize("-")).toBe("");
  });

  it("prints real sizes and IMEI-style labels", () => {
    expect(formatRetailErpInvoiceSize("M")).toBe("M");
    expect(formatRetailErpInvoiceSize("42")).toBe("42");
    expect(formatRetailErpInvoiceSize("IMEI-2")).toBe("IMEI-2");
  });

  it("returns empty for blank", () => {
    expect(formatRetailErpInvoiceSize("")).toBe("");
    expect(formatRetailErpInvoiceSize(null)).toBe("");
  });
});
