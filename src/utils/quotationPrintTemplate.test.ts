import { beforeEach, describe, expect, it } from "vitest";
import {
  QUOTATION_PRINT_TEMPLATE_KEY,
  mergeQuotationTerms,
  persistQuotationPrintTemplate,
  resolveQuotationPrintTemplate,
} from "./quotationPrintTemplate";

describe("quotationPrintTemplate", () => {
  beforeEach(() => {
    localStorage.removeItem(QUOTATION_PRINT_TEMPLATE_KEY);
  });

  it("defaults to existing retail layout", () => {
    expect(resolveQuotationPrintTemplate({})).toBe("retail");
  });

  it("uses sale settings when localStorage is empty", () => {
    expect(resolveQuotationPrintTemplate({ quotation_print_template: "it-company" })).toBe(
      "it-company",
    );
  });

  it("prefers the last preview choice stored locally", () => {
    persistQuotationPrintTemplate("it-company");
    expect(resolveQuotationPrintTemplate({ quotation_print_template: "retail" })).toBe(
      "it-company",
    );
  });

  it("merges Settings → Sale terms with quotation terms", () => {
    const text = mergeQuotationTerms("Project-specific: 50% advance.", {
      terms_list: ["Payment within 7 days.", "GST extra as applicable."],
    });
    expect(text).toContain("1. Payment within 7 days.");
    expect(text).toContain("2. GST extra as applicable.");
    expect(text).toContain("Project-specific: 50% advance.");
  });
});
