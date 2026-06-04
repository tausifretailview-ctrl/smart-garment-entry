/**
 * CSS + HTML wrapper for 80mm thermal receipts (Electron / QZ / browser print).
 * Keeps content inside the printable area so the right edge is not clipped.
 */

export const THERMAL_RECEIPT_PRINT_CSS = `
  @page {
    size: 80mm auto;
    margin: 0 !important;
  }
  html, body {
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 auto !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .thermal-print-80mm,
  .thermal-receipt-container {
    width: 72mm !important;
    max-width: 72mm !important;
    margin: 0 auto !important;
    padding: 1.5mm 2mm !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
    box-sizing: border-box !important;
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
`;

export function isThermalReceiptHtml(html: string): boolean {
  return /thermal-print-80mm|thermal-receipt-container/i.test(html);
}

/** Inject thermal print CSS and constrain document width for desktop silent print. */
export function wrapReceiptHtmlForElectron(html: string): string {
  if (!html?.trim() || !isThermalReceiptHtml(html)) return html;

  const marker = 'data-thermal-print-wrap="1"';
  if (html.includes(marker)) return html;

  const styleBlock = `<style id="thermal-electron-print">${THERMAL_RECEIPT_PRINT_CSS}</style>`;

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
