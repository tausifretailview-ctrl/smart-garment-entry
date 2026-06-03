/** Templates that must print on A5 — not thermal 80mm. */
export const A5_ONLY_INVOICE_TEMPLATES = new Set(['retail-tax-ezzy', 'wholesale-a5']);

export type PosBillFormat = 'a4' | 'a5' | 'a5-horizontal' | 'thermal';

/** POS paper size from settings, adjusted when the invoice template requires A5. */
export function resolvePosBillFormat(
  invoiceTemplate: string | undefined,
  posBillFormat: PosBillFormat,
): PosBillFormat {
  if (invoiceTemplate && A5_ONLY_INVOICE_TEMPLATES.has(invoiceTemplate)) {
    return 'a5';
  }
  return posBillFormat;
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
