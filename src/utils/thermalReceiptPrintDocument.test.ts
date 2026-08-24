import { describe, expect, it } from "vitest";
import {
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
  wrapReceiptHtmlForElectron,
} from "./thermalReceiptPrintDocument";

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
