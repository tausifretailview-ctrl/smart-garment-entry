/**
 * CSS + HTML wrapper for thermal receipts (Electron / QZ / browser print).
 * Keeps content on one continuous roll page — avoids mid-receipt page breaks.
 */

import {
  type PosThermalPaper,
  thermalReceiptBrowserPageSize,
} from '@/utils/invoicePrintFormat';

/** Microns: tall roll height so Electron/Chromium do not paginate at A4 (~297mm). */
const RECEIPT_ROLL_HEIGHT_MICRONS = 5_000_000;

/**
 * Beat InvoicePrint.css `body * { visibility: hidden }` in react-to-print iframe.
 * `body` prefix on descendants exceeds `body *` specificity — root-only rules leave A4/laser blank.
 */
export const INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS = `
  @media print {
    body .invoice-print-source-screen,
    body .invoice-print-source,
    body .invoice-print-source *,
    body .invoice-print-root,
    body .invoice-print-root *,
    body .invoice-print,
    body .invoice-print *,
    body .print-invoice-container,
    body .print-invoice-container *,
    body .retail-tax-ezzy-print-root,
    body .retail-tax-ezzy-print-root *,
    body .wholesale-a5-invoice,
    body .wholesale-a5-invoice *,
    body .professional-invoice-template,
    body .professional-invoice-template *,
    body .sale-order-print-container,
    body .sale-order-print-container *,
    body .sale-order-print,
    body .sale-order-print *,
    body .sale-order-page,
    body .sale-order-page *,
    body .thermal-print-80mm,
    body .thermal-print-80mm *,
    body .thermal-receipt-container,
    body .thermal-receipt-container *,
    body .modern-thermal-receipt,
    body .modern-thermal-receipt * {
      visibility: visible !important;
      opacity: 1 !important;
    }
  }
`;

/** @deprecated Use INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS */
export const THERMAL_RECEIPT_PRINT_VISIBILITY_OVERRIDE_CSS = INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS;

/** Override global index.css / InvoicePrint.css page-break rules on thermal receipts. */
export const THERMAL_RECEIPT_PAGE_BREAK_OVERRIDE_CSS = `
  @media print {
    .invoice-print-root:has(.thermal-print-80mm, .thermal-receipt-container, .modern-thermal-receipt),
    .invoice-print-root:has(.thermal-print-80mm, .thermal-receipt-container, .modern-thermal-receipt) *,
    .print-thermal,
    .thermal-print-80mm,
    .thermal-receipt-container,
    .invoice-format-thermal-receipt,
    .invoice-print.invoice-format-thermal-receipt,
    .modern-thermal-receipt,
    .thermal-print-80mm *,
    .thermal-receipt-container *,
    .modern-thermal-receipt *,
    .invoice-print.invoice-format-thermal-receipt * {
      page-break-inside: auto !important;
      break-inside: auto !important;
      page-break-before: auto !important;
      break-before: auto !important;
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .thermal-print-80mm .thermal-row {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
`;

export function buildThermalReceiptPrintCss(paper: PosThermalPaper = '80mm'): string {
  const bodyWidth = paper === '58mm' ? '58mm' : '80mm';
  const contentWidth = paper === '58mm' ? '48mm' : '72mm';
  const browserPageSize = thermalReceiptBrowserPageSize(paper);

  return `
  @page {
    size: ${browserPageSize};
    margin: 0 !important;
  }
  html, body {
    width: ${bodyWidth} !important;
    max-width: ${bodyWidth} !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .invoice-print-source-screen,
  .invoice-print-source,
  .invoice-print-root {
    width: ${bodyWidth} !important;
    max-width: ${bodyWidth} !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    zoom: 1 !important;
  }
  .thermal-print-80mm,
  .thermal-receipt-container,
  .modern-thermal-receipt {
    width: ${contentWidth} !important;
    max-width: ${contentWidth} !important;
    margin: 0 auto !important;
    padding: 1.5mm 2mm !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
    box-sizing: border-box !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  .thermal-print-80mm * {
    box-sizing: border-box !important;
  }
  .thermal-print-80mm table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
  }
  .thermal-print-80mm img {
    max-width: 100% !important;
    height: auto !important;
  }
  ${THERMAL_RECEIPT_PAGE_BREAK_OVERRIDE_CSS}
`;
}

/** Default 80mm thermal print CSS (QZ / legacy imports). */
export const THERMAL_RECEIPT_PRINT_CSS = buildThermalReceiptPrintCss('80mm');

/** Fragment for react-to-print `pageStyle` when printing thermal receipts. */
export function getThermalReceiptPageStyleFragment(paper: PosThermalPaper = '80mm'): string {
  const pageSize = thermalReceiptBrowserPageSize(paper);
  return `
    @page { size: ${pageSize}; margin: 0; }
    ${buildThermalReceiptPrintCss(paper)}
    ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
  `;
}

export function receiptElectronPageSizeMicrons(
  paper: PosThermalPaper = '80mm',
): { width: number; height: number } {
  return {
    width: paper === '58mm' ? 58_000 : 80_000,
    height: RECEIPT_ROLL_HEIGHT_MICRONS,
  };
}

export function isThermalReceiptHtml(html: string): boolean {
  return /thermal-print-80mm|thermal-receipt-container|modern-thermal-receipt/i.test(html);
}

export function detectThermalPaperFromHtml(html: string): PosThermalPaper {
  if (/thermal-paper-58|58mm\s+auto|width:\s*58mm/i.test(html)) {
    return '58mm';
  }
  return '80mm';
}

/** Inject thermal print CSS and constrain document width for desktop silent print. */
export function wrapReceiptHtmlForElectron(html: string): string {
  if (!html?.trim() || !isThermalReceiptHtml(html)) return html;

  const marker = 'data-thermal-print-wrap="1"';
  if (html.includes(marker)) return html;

  const paper = detectThermalPaperFromHtml(html);
  const styleBlock = `<style id="thermal-electron-print">${buildThermalReceiptPrintCss(paper)}</style>`;

  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1 ${marker}>${styleBlock}`);
    }
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1 ${marker}><head>${styleBlock}</head>`,
    );
  }

  return `<!DOCTYPE html>
<html ${marker}>
<head>
  <meta charset="UTF-8">
  ${styleBlock}
</head>
<body>${html}</body>
</html>`;
}
