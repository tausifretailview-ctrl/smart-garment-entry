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

/** POS paper size from settings, adjusted when the invoice template requires A5 or full page. */
export function resolvePosBillFormat(
  invoiceTemplate: string | undefined,
  posBillFormat: PosBillFormat,
  invoicePaperFormat?: string,
): PosBillFormat {
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
  }
  if (
    invoiceTemplate &&
    FULL_PAGE_INVOICE_TEMPLATES.has(invoiceTemplate) &&
    posBillFormat === 'thermal'
  ) {
    return fallbackFormatForFullPageTemplate(invoicePaperFormat);
  }
  return posBillFormat;
}

/** Sales invoice dashboard paper size (same rules as POS). */
export function resolveSaleBillFormat(
  invoiceTemplate: string | undefined,
  salesBillFormat: PosBillFormat,
  invoicePaperFormat?: string,
): PosBillFormat {
  return resolvePosBillFormat(invoiceTemplate, salesBillFormat, invoicePaperFormat);
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
