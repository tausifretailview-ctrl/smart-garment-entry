import { describe, expect, it } from "vitest";
import {
  CREDIT_NOTE_DOCUMENT_PRINT_CSS,
  CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS,
} from "@/utils/creditNotePrintCss";
import { getPosDocumentPrintPageStyle } from "@/utils/invoicePrintFormat";
import { getThermalReceiptPageStyleFragment } from "@/utils/thermalReceiptPrintDocument";

describe("sale return A4 print page style", () => {
  it("does not force display:block on all credit-note descendants", () => {
    const pageStyle = getPosDocumentPrintPageStyle("a4", "80mm", getThermalReceiptPageStyleFragment("80mm"));
    expect(pageStyle).not.toMatch(/\.credit-note-print \*[\s\S]*display:\s*block !important/);
    expect(pageStyle).toContain("display: table !important");
    expect(CREDIT_NOTE_DOCUMENT_PRINT_CSS).toContain("display: table-cell !important");
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("display: none !important");
  });
});
