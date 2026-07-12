/** A4-only invoice templates — always print on A4 portrait. */
export const A4_ONLY_INVOICE_TEMPLATES = new Set(['real-tast', 'gift_tally']);

/** Templates that must print on A5 — not thermal 80mm. */
export const A5_ONLY_INVOICE_TEMPLATES = new Set(['retail-tax-ezzy', 'wholesale-a5', 'retail-erp']);

/** Thermal-only invoice templates — always route through 80mm receipt path. */
export const THERMAL_ONLY_INVOICE_TEMPLATES = new Set(['kids-80mm']);

/** Full-page invoice templates — never route through 80mm thermal. */
export const FULL_PAGE_INVOICE_TEMPLATES = new Set([
  'modern-wholesale',
  'retail-tax-ezzy',
  'wholesale-a5',
  'professional',
  'modern',
  'classic',
  'minimal',
  'compact',
  'detailed',
  'tax-invoice',
  'tally-tax-invoice',
  'a4-electronic',
  'retail',
  'retail-erp',
  'real-tast',
]);

export type PosBillFormat = 'a4' | 'a5' | 'a5-horizontal' | 'thermal';

function fallbackFormatForFullPageTemplate(
  invoicePaperFormat?: string,
): PosBillFormat {
  if (invoicePaperFormat === 'a5-horizontal') return 'a5-horizontal';
  if (invoicePaperFormat === 'a5' || invoicePaperFormat === 'a5-vertical') return 'a5';
  return 'a4';
}

/** POS paper size — named templates (Retail ERP, etc.) override generic thermal/A5 setting. */
export function resolvePosBillFormat(
  invoiceTemplate: string | undefined,
  posBillFormat: PosBillFormat,
  _invoicePaperFormat?: string,
): PosBillFormat {
  if (invoiceTemplate && THERMAL_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'thermal';
  }
  if (invoiceTemplate && A4_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a4';
  }
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
  }
  if (posBillFormat === 'thermal') {
    return 'thermal';
  }
  return posBillFormat;
}

/** Sales invoice dashboard paper size — full-page templates cannot use 80mm thermal. */
export function resolveSaleBillFormat(
  invoiceTemplate: string | undefined,
  salesBillFormat: PosBillFormat,
  invoicePaperFormat?: string,
): PosBillFormat {
  if (invoiceTemplate && THERMAL_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'thermal';
  }
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
  }
  if (invoiceTemplate && A4_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a4';
  }
  if (
    invoiceTemplate &&
    FULL_PAGE_INVOICE_TEMPLATES.has(invoiceTemplate) &&
    salesBillFormat === 'thermal'
  ) {
    return fallbackFormatForFullPageTemplate(invoicePaperFormat);
  }
  return salesBillFormat;
}

export type PosThermalPaper = '58mm' | '80mm';

/** Tall roll height for Electron silent print (one continuous roll; avoids mid-receipt cuts). */
export const THERMAL_RECEIPT_ROLL_HEIGHT_MM = 5000;

/**
 * Legacy driver default (80×210mm). Do not use for @page — causes mid-receipt cuts on long bills.
 * @deprecated Use thermalReceiptRollPageSize / thermalReceiptBrowserPageSize (both use roll height).
 */
export const THERMAL_RECEIPT_BROWSER_PAGE_HEIGHT_MM = 210;

/** @page size for thermal roll — tall continuous page (Electron / QZ silent print only). */
export function thermalReceiptRollPageSize(paper: PosThermalPaper): string {
  const width = paper === '58mm' ? '58mm' : '80mm';
  return `${width} ${THERMAL_RECEIPT_ROLL_HEIGHT_MM}mm`;
}

/**
 * @page size for browser print (react-to-print / Ctrl+P).
 * Use `auto` height so preview fits receipt content — 5000mm roll height shows as a blank strip on Windows thermal drivers.
 */
export function thermalReceiptBrowserPageSize(paper: PosThermalPaper): string {
  const width = paper === '58mm' ? '58mm' : '80mm';
  return `${width} auto`;
}

/** Thermal roll width for POS (Settings → Direct print POS paper, default 80mm). */
export function resolvePosThermalPaper(directPrintPosPaper?: string | null): PosThermalPaper {
  return directPrintPosPaper === '58mm' ? '58mm' : '80mm';
}

export function posThermalPageCss(paper: PosThermalPaper): { pageSize: string; sourceWidth: string } {
  if (paper === '58mm') {
    return { pageSize: thermalReceiptBrowserPageSize('58mm'), sourceWidth: '58mm' };
  }
  return { pageSize: thermalReceiptBrowserPageSize('80mm'), sourceWidth: '80mm' };
}

/** Paper size passed to direct print / QZ for a POS bill. */
export function resolvePosDirectPrintPaper(
  posBillFormat: PosBillFormat,
  directPrintPosPaper?: string | null,
): PosThermalPaper | 'A4' | 'A5' {
  if (posBillFormat === 'thermal') {
    return resolvePosThermalPaper(directPrintPosPaper);
  }
  if (posBillFormat === 'a5' || posBillFormat === 'a5-horizontal') {
    return 'A5';
  }
  return 'A4';
}

/** Map POS bill format to InvoiceWrapper `format` prop. */
export function toInvoiceWrapperFormat(posBillFormat: PosBillFormat): string {
  switch (posBillFormat) {
    case 'a5':
      return 'a5-vertical';
    case 'a5-horizontal':
      return 'a5-horizontal';
    case 'thermal':
      return 'thermal';
    default:
      return 'a4';
  }
}
