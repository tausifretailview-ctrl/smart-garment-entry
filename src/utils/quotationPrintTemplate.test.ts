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

  it("merges Sale terms only when org opts in", () => {
    const saleSettings = {
      terms_list: ["Payment within 7 days.", "GST extra as applicable."],
    };
    expect(mergeQuotationTerms("Project-specific: 50% advance.", saleSettings)).toBe(
      "Project-specific: 50% advance.",
    );
    const merged = mergeQuotationTerms("Project-specific: 50% advance.", {
      ...saleSettings,
      merge_sale_terms_on_quotation: true,
    });
    expect(merged).toContain("1. Payment within 7 days.");
    expect(merged).toContain("Project-specific: 50% advance.");
  });
});
