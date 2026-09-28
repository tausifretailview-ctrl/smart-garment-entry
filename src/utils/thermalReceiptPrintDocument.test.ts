import { describe, expect, it } from "vitest";
import {
  appendInvoicePrintVisibilityCss,
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
  wrapReceiptHtmlForElectron,
} from "./thermalReceiptPrintDocument";
import { CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS } from "./creditNotePrintCss";

describe("wrapReceiptHtmlForElectron", () => {
  it("injects roll CSS and print visibility override so InvoicePrint.css cannot hide the receipt", () => {
    const html = wrapReceiptHtmlForElectron(
      `<!DOCTYPE html><html><head></head><body><div class="thermal-print-80mm">BILL</div></body></html>`,
      "80mm",
    );
    expect(html).toContain('id="thermal-electron-print"');
    expect(html).toContain("80mm 5000mm");
    expect(html).toContain("visibility: visible !important");
    expect(INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS).toContain(
      "body .thermal-print-80mm",
    );
  });
});

describe("appendInvoicePrintVisibilityCss", () => {
  it("unhides the invoice root so an A4 sale-dashboard print is not a blank sheet", () => {
    const pageStyle = `
      @page { size: A4 portrait; margin: 6mm; }
      @media print { html, body { height: auto; } }
    `;
    const withVisibility = appendInvoicePrintVisibilityCss(pageStyle);
    expect(withVisibility).toContain("body .invoice-print-root");
    expect(withVisibility).toContain("visibility: visible !important");
  });

  it("does not append the override twice when thermal CSS already includes it", () => {
    const once = appendInvoicePrintVisibilityCss("@page { size: 80mm auto; }");
    expect(appendInvoicePrintVisibilityCss(once)).toBe(once);
  });
});

describe("credit note print CSS", () => {
  it("restores table layout and hides inline style tags during print", () => {
    expect(INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS).toContain("body .credit-note-print");
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("display: table !important");
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("display: table-cell !important");
    expect(CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS).toContain("body .credit-note-print style");
  });
});
