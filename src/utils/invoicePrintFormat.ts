/** Templates that must print on A5 — not thermal 80mm. */
export const A5_ONLY_INVOICE_TEMPLATES = new Set(['retail-tax-ezzy', 'wholesale-a5']);

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
]);

export type PosBillFormat = 'a4' | 'a5' | 'a5-horizontal' | 'thermal';

function fallbackFormatForFullPageTemplate(
  invoicePaperFormat?: string,
): PosBillFormat {
  if (invoicePaperFormat === 'a5-horizontal') return 'a5-horizontal';
  if (invoicePaperFormat === 'a5' || invoicePaperFormat === 'a5-vertical') return 'a5';
  return 'a4';
}

/** POS paper size — honor thermal receipt setting (template name does not force A4 on POS). */
export function resolvePosBillFormat(
  invoiceTemplate: string | undefined,
  posBillFormat: PosBillFormat,
  _invoicePaperFormat?: string,
): PosBillFormat {
  if (posBillFormat === 'thermal') {
    return 'thermal';
  }
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
  }
  return posBillFormat;
}

/** Sales invoice dashboard paper size — full-page templates cannot use 80mm thermal. */
export function resolveSaleBillFormat(
  invoiceTemplate: string | undefined,
  salesBillFormat: PosBillFormat,
  invoicePaperFormat?: string,
): PosBillFormat {
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
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

/** Tall roll height — Chromium paginates badly with `auto` (splits receipt into strips). */
export const THERMAL_RECEIPT_ROLL_HEIGHT_MM = 5000;

/** @page size for browser/Electron thermal print (one continuous roll page). */
export function thermalReceiptRollPageSize(paper: PosThermalPaper): string {
  const width = paper === '58mm' ? '58mm' : '80mm';
  return `${width} ${THERMAL_RECEIPT_ROLL_HEIGHT_MM}mm`;
}

/** Thermal roll width for POS (Settings → Direct print POS paper, default 80mm). */
export function resolvePosThermalPaper(directPrintPosPaper?: string | null): PosThermalPaper {
  return directPrintPosPaper === '58mm' ? '58mm' : '80mm';
}

export function posThermalPageCss(paper: PosThermalPaper): { pageSize: string; sourceWidth: string } {
  if (paper === '58mm') {
    return { pageSize: thermalReceiptRollPageSize('58mm'), sourceWidth: '58mm' };
  }
  return { pageSize: thermalReceiptRollPageSize('80mm'), sourceWidth: '80mm' };
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
