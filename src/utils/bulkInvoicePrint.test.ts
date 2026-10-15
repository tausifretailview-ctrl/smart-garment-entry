import { describe, expect, it } from "vitest";
import {
  BULK_INVOICE_PRINT_PAGE_CLASS,
  buildBulkInvoicePrintCss,
  injectCssIntoHtmlDocument,
} from "./bulkInvoicePrint";

describe("buildBulkInvoicePrintCss", () => {
  it("starts every A4/A5 bill on a new sheet", () => {
    const css = buildBulkInvoicePrintCss(false);
    expect(css).toContain(`.${BULK_INVOICE_PRINT_PAGE_CLASS}:not(:last-child)`);
    expect(css).toContain("page-break-after: always");
    expect(css).toContain("height: auto !important");
  });

  it("keeps thermal bills on one roll with a tear line, no forced page break", () => {
    const css = buildBulkInvoicePrintCss(true);
    expect(css).not.toContain("page-break-after");
    expect(css).toContain("border-bottom: 1px dashed");
  });
});

describe("injectCssIntoHtmlDocument", () => {
  it("adds the style block before </head>", () => {
    const out = injectCssIntoHtmlDocument("<html><head><title>x</title></head><body></body></html>", "p{}");
    expect(out).toContain('<style id="bulk-invoice-print">p{}</style></head>');
  });
});
