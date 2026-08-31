import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_NOTE_DOCUMENT_PRINT_CSS, CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS } from "./creditNotePrintCss";
import { getPosDocumentPrintPageStyle } from "./invoicePrintFormat";
import {
  PRINT_DOCUMENT_ROOT_SELECTORS,
  PRINT_NESTED_STYLE_TAG_HIDE_CSS,
  printCssForcesDisplayBlockOnUniversal,
} from "./printNestedStyleTagSafety";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "./thermalReceiptPrintDocument";

const HISTORICAL_CREDIT_NOTE_LEAK_CSS = `
  @media print {
    .credit-note-print-source,
    .credit-note-print-source *,
    .credit-note-print,
    .credit-note-print * {
      visibility: visible !important;
      opacity: 1 !important;
      display: block !important;
    }
  }
`;

describe("printCssForcesDisplayBlockOnUniversal", () => {
  it("detects the historical credit-note leak (display:block on *)", () => {
    expect(printCssForcesDisplayBlockOnUniversal(HISTORICAL_CREDIT_NOTE_LEAK_CSS)).toBe(true);
  });

  it("allows display:block on named print containers", () => {
    expect(
      printCssForcesDisplayBlockOnUniversal(`
        .invoice-print-root, .print-dialog {
          display: block !important;
        }
      `),
    ).toBe(false);
  });

  it("allows visibility-only universal overrides", () => {
    expect(printCssForcesDisplayBlockOnUniversal(INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS)).toBe(false);
    expect(printCssForcesDisplayBlockOnUniversal(CREDIT_NOTE_DOCUMENT_PRINT_CSS)).toBe(false);
  });
});

describe("live print pageStyle builders", () => {
  it("do not reintroduce display:block on universal descendants", () => {
    const a4 = getPosDocumentPrintPageStyle("a4", "80mm", "");
    const a5 = getPosDocumentPrintPageStyle("a5", "80mm", "");
    const thermal = getPosDocumentPrintPageStyle("thermal", "80mm", "");
    for (const css of [a4, a5, thermal, INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS]) {
      expect(printCssForcesDisplayBlockOnUniversal(css)).toBe(false);
    }
  });

  it("hides nested style tags on every visibility-unhidden print root", () => {
    for (const root of PRINT_DOCUMENT_ROOT_SELECTORS) {
      expect(PRINT_NESTED_STYLE_TAG_HIDE_CSS).toContain(`body ${root} style`);
    }
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("body .credit-note-print style");
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("body .sale-return-thermal style");
    expect(INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS).toContain("body .invoice-print style");
    expect(INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS).toContain("body .gift-tally-invoice-root style");
  });
});

describe("credit-note print sources", () => {
  it("do not nest a <style> tag inside the cloned print root", () => {
    const saleReturn = readFileSync(resolve(__dirname, "../components/SaleReturnPrint.tsx"), "utf8");
    const creditNote = readFileSync(resolve(__dirname, "../components/CreditNotePrint.tsx"), "utf8");
    expect(saleReturn).not.toMatch(/<style[\s>]/);
    expect(creditNote).not.toMatch(/<style[\s>]/);
    expect(saleReturn).toContain('className="credit-note-print print-document"');
    expect(creditNote).toContain('className="credit-note-print print-document"');
  });
});
