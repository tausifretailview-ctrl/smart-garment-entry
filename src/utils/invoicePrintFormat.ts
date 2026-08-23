/** Shared invoice template ids used in Settings → Sale. */
export type InvoiceTemplateId =
  | 'professional'
  | 'modern'
  | 'modern-wholesale'
  | 'classic'
  | 'minimal'
  | 'compact'
  | 'detailed'
  | 'tax-invoice'
  | 'tally-tax-invoice'
  | 'gift_tally'
  | 'a4-gst-classic'
  | 'a4-electronic'
  | 'retail'
  | 'retail-erp'
  | 'retail-erp-dc'
  | 'zaika'
  | 'retail-erp-preprinted'
  | 'retail-tax-ezzy'
  | 'wholesale-a5'
  | 'kids-80mm'
  | 'real-tast';

export type SaleSettingsTemplateSlice = {
  invoice_template?: string | null;
  pos_invoice_template?: string | null;
};

/** Sale Invoice template (Sales Invoice / Sale bill print). */
export function resolveSaleInvoiceTemplate(
  saleSettings?: SaleSettingsTemplateSlice | null,
): string {
  const t = String(saleSettings?.invoice_template || '').trim();
  return t || 'professional';
}

/**
 * POS Invoice template. Falls back to Sale `invoice_template` when unset
 * so existing orgs keep one shared look until they pick a separate POS style.
 */
export function resolvePosInvoiceTemplate(
  saleSettings?: SaleSettingsTemplateSlice | null,
): string {
  const pos = String(saleSettings?.pos_invoice_template || '').trim();
  if (pos) return pos;
  return resolveSaleInvoiceTemplate(saleSettings);
}

/** A4-only invoice templates — always print on A4 portrait. */
export const A4_ONLY_INVOICE_TEMPLATES = new Set(['real-tast', 'gift_tally', 'a4-gst-classic']);

/**
 * Real Tast Bill of Supply is a single 210×297mm leaf.
 * POS used to wrap it in another 297mm print-source box and add 10mm @page
 * margins — Chrome printed a blank first page and clipped the bill on page 2.
 */
export function getRealTastA4PrintPageStyle(): string {
  return `
      @page {
        size: 210mm 297mm;
        margin: 0;
      }
      @media print {
        html, body {
          width: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: visible !important;
        }
        .invoice-print-source,
        .invoice-print-source-screen,
        .invoice-print-root,
        .retail-erp-all-pages {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          overflow: visible !important;
        }
        .retail-erp-invoice-template[data-invoice-variant="real-tast"] {
          width: 210mm !important;
          max-width: 210mm !important;
          height: 297mm !important;
          max-height: 297mm !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
      }
  `;
}

/** Templates that must print on A5 — not thermal 80mm. */
export const A5_ONLY_INVOICE_TEMPLATES = new Set([
  'retail-tax-ezzy',
  'wholesale-a5',
  'retail-erp',
  'retail-erp-dc',
  'zaika',
]);

/**
 * Preprinted letterhead templates — follow POS/Sale paper size (A4 or A5),
 * but never thermal 80mm.
 */
export const PREPRINTED_LETTERHEAD_TEMPLATES = new Set(['retail-erp-preprinted']);

/** Thermal-only invoice templates — always route through 80mm receipt path. */
export const THERMAL_ONLY_INVOICE_TEMPLATES = new Set(['kids-80mm']);

/** Paper-size patches when an A4 / A5 / thermal-only template is chosen. */
export function paperPatchesForInvoiceTemplate(
  template: string,
  scope: 'sale' | 'pos',
): Record<string, string> {
  if (THERMAL_ONLY_INVOICE_TEMPLATES.has(template)) {
    if (scope === 'sale') {
      return {
        invoice_paper_format: 'thermal',
        sales_bill_format: 'thermal',
      };
    }
    return { pos_bill_format: 'thermal' };
  }
  if (A4_ONLY_INVOICE_TEMPLATES.has(template)) {
    if (scope === 'sale') {
      return {
        invoice_paper_format: 'a4',
        sales_bill_format: 'a4',
      };
    }
    return { pos_bill_format: 'a4' };
  }
  if (A5_ONLY_INVOICE_TEMPLATES.has(template)) {
    if (scope === 'sale') {
      return {
        invoice_paper_format: 'a5-vertical',
        sales_bill_format: 'a5',
      };
    }
    // Settings POS select uses `a5-vertical` (not bare `a5`).
    return { pos_bill_format: 'a5-vertical' };
  }
  return {};
}

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
  'a4-gst-classic',
  'a4-electronic',
  'retail',
  'retail-erp',
  'retail-erp-dc',
  'zaika',
  'retail-erp-preprinted',
  'real-tast',
]);

export type PosBillFormat = 'a4' | 'a5' | 'a5-horizontal' | 'thermal';

function fallbackFormatForFullPageTemplate(
  invoicePaperFormat?: string,
): Exclude<PosBillFormat, 'thermal'> {
  if (invoicePaperFormat === 'a5-horizontal') return 'a5-horizontal';
  if (invoicePaperFormat === 'a5' || invoicePaperFormat === 'a5-vertical') return 'a5';
  return 'a4';
}

function normalizeBillFormat(raw: string | undefined | null): PosBillFormat {
  if (raw === 'a5' || raw === 'a5-vertical') return 'a5';
  if (raw === 'a5-horizontal') return 'a5-horizontal';
  if (raw === 'thermal') return 'thermal';
  return 'a4';
}

/** Resolve A4/A5 for preprinted letterhead templates from bill-format setting. */
export function resolvePreprintedPaperFormat(
  billFormat: PosBillFormat | string,
  invoicePaperFormat?: string,
): Exclude<PosBillFormat, 'thermal'> {
  const normalized = normalizeBillFormat(billFormat);
  if (normalized === 'a5' || normalized === 'a5-horizontal') return normalized;
  if (normalized === 'a4') return 'a4';
  // thermal (or unknown) — use invoice paper / A4 fallback
  return fallbackFormatForFullPageTemplate(invoicePaperFormat);
}

/** POS paper size — named templates (Retail ERP, etc.) override generic thermal/A5 setting. */
export function resolvePosBillFormat(
  invoiceTemplate: string | undefined,
  posBillFormat: PosBillFormat | string,
  invoicePaperFormat?: string,
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
  if (invoiceTemplate && PREPRINTED_LETTERHEAD_TEMPLATES.has(invoiceTemplate)) {
    return resolvePreprintedPaperFormat(posBillFormat, invoicePaperFormat);
  }
  const normalized = normalizeBillFormat(posBillFormat);
  if (normalized === 'thermal') {
    return 'thermal';
  }
  return normalized;
}

/** Sales invoice dashboard paper size — full-page templates cannot use 80mm thermal. */
export function resolveSaleBillFormat(
  invoiceTemplate: string | undefined,
  salesBillFormat: PosBillFormat | string,
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
  if (invoiceTemplate && PREPRINTED_LETTERHEAD_TEMPLATES.has(invoiceTemplate)) {
    return resolvePreprintedPaperFormat(salesBillFormat, invoicePaperFormat);
  }
  const normalized = normalizeBillFormat(salesBillFormat);
  if (
    invoiceTemplate &&
    FULL_PAGE_INVOICE_TEMPLATES.has(invoiceTemplate) &&
    normalized === 'thermal'
  ) {
    return fallbackFormatForFullPageTemplate(invoicePaperFormat);
  }
  return normalized;
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
export function toInvoiceWrapperFormat(posBillFormat: PosBillFormat | string): string {
  switch (posBillFormat) {
    case 'a5':
    case 'a5-vertical':
      return 'a5-vertical';
    case 'a5-horizontal':
      return 'a5-horizontal';
    case 'thermal':
      return 'thermal';
    default:
      return 'a4';
  }
}
