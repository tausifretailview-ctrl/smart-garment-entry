/**
 * Bulk invoice print: many rendered invoices stacked in one print job, so the
 * user confirms one dialog (browser) or nothing at all (desktop app), instead
 * of one dialog per bill.
 */

export const BULK_INVOICE_PRINT_ROOT_CLASS = "bulk-invoice-print-root";
export const BULK_INVOICE_PRINT_PAGE_CLASS = "bulk-invoice-print-page";

/**
 * Extra print CSS appended after the single-invoice page style.
 * - Single-bill styles pin html/body to one sheet (preprinted / Krishna A5);
 *   undo that so later bills are not clipped.
 * - `.invoice-print` is absolutely positioned for single print; with many bills
 *   that stacks them all on page 1, so put them back in normal flow.
 * - A4/A5: each bill starts on a new sheet. Thermal roll: bills follow each
 *   other with a tear line (a forced page break would feed blank roll paper).
 */
export function buildBulkInvoicePrintCss(thermal: boolean): string {
  const root = `.${BULK_INVOICE_PRINT_ROOT_CLASS}`;
  const page = `.${BULK_INVOICE_PRINT_PAGE_CLASS}`;
  const separation = thermal
    ? `
    ${page}:not(:last-child) {
      border-bottom: 1px dashed #000 !important;
      padding-bottom: 4mm !important;
      margin-bottom: 4mm !important;
    }`
    : `
    ${page}:not(:last-child) {
      break-after: page !important;
      page-break-after: always !important;
    }`;
  return `
  @media print {
    html, body {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    ${root},
    ${page} {
      display: block !important;
      position: static !important;
      visibility: visible !important;
      overflow: visible !important;
      margin: 0;
      padding: 0;
    }
    ${page} .invoice-print,
    ${page} .invoice-print-root {
      position: static !important;
    }
    ${separation}
  }
`;
}

/** Insert extra CSS into a full HTML document (before </head>). */
export function injectCssIntoHtmlDocument(html: string, css: string): string {
  const styleBlock = `<style id="bulk-invoice-print">${css}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${styleBlock}</head>`);
  return `${styleBlock}${html}`;
}
