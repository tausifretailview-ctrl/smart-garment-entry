import { beforeEach, describe, expect, it } from "vitest";
import {
  QUOTATION_PRINT_TEMPLATE_KEY,
  mergeQuotationTerms,
  persistQuotationPrintTemplate,
  quotationPrintTemplateStorageKey,
  resolveQuotationPrintTemplate,
} from "./quotationPrintTemplate";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";

describe("quotationPrintTemplate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to existing retail layout", () => {
    expect(resolveQuotationPrintTemplate({})).toBe("retail");
  });

  it("prefers sale settings over localStorage once settings are loaded", () => {
    persistQuotationPrintTemplate("it-company", ORG_A);
    expect(
      resolveQuotationPrintTemplate({ quotation_print_template: "retail" }, ORG_A),
    ).toBe("retail");
  });

  it("uses org-scoped localStorage only before settings are available", () => {
    persistQuotationPrintTemplate("it-company", ORG_A);
    persistQuotationPrintTemplate("retail", ORG_B);
    expect(resolveQuotationPrintTemplate(undefined, ORG_A)).toBe("it-company");
    expect(resolveQuotationPrintTemplate(undefined, ORG_B)).toBe("retail");
  });

  it("scopes storage keys per organization", () => {
    expect(quotationPrintTemplateStorageKey(ORG_A)).toBe(
      `${QUOTATION_PRINT_TEMPLATE_KEY}_${ORG_A}`,
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
