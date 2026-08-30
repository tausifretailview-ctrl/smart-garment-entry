import { CREDIT_NOTE_DOCUMENT_PRINT_CSS } from '@/utils/creditNotePrintCss';

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
  | 'gurukrupa'
  | 'retail-erp-preprinted'
  | 'retail-tax-ezzy'
  | 'wholesale-a5'
  | 'kids-80mm'
  | 'retail-pos-80mm'
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
 * Real Tast Bill of Supply — full A4 portrait (210×297mm), zero page margin.
 * Each leaf fills one sheet; wrappers stay auto-height so page 2+ can print.
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
          height: auto !important;
          max-width: 210mm !important;
          max-height: none !important;
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
          min-height: 297mm !important;
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
          min-height: 297mm !important;
          max-height: 297mm !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        .retail-erp-all-pages .retail-erp-invoice-template:not(:last-child) {
          page-break-after: always;
          break-after: page;
        }
        .retail-erp-invoice-template[data-invoice-variant="real-tast"] > .retail-erp-page-border {
          flex: 1 1 auto !important;
          min-height: 0 !important;
        }
        .retail-erp-invoice-template[data-invoice-variant="real-tast"] .retail-erp-items-grow {
          flex: 1 1 auto !important;
          min-height: 0 !important;
        }
        .retail-erp-invoice-template[data-invoice-variant="real-tast"] .retail-erp-items-grow > table {
          height: 100% !important;
        }
        .retail-erp-invoice-template[data-invoice-variant="real-tast"] .retail-erp-footer {
          margin-top: auto !important;
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
  'gurukrupa',
]);

/** A5 portrait laser templates (Retail ERP family + Ezzy / Wholesale A5). */
export function isA5PortraitInvoiceTemplate(template?: string | null): boolean {
  return Boolean(template && A5_ONLY_INVOICE_TEMPLATES.has(template));
}

/**
 * Preprinted letterhead templates — follow POS/Sale paper size (A4 or A5),
 * but never thermal 80mm.
 */
export const PREPRINTED_LETTERHEAD_TEMPLATES = new Set(['retail-erp-preprinted']);

/** Thermal-only invoice templates — always route through 80mm receipt path. */
export const THERMAL_ONLY_INVOICE_TEMPLATES = new Set(['kids-80mm', 'retail-pos-80mm']);

export function isThermal80mmInvoiceTemplate(template?: string | null): boolean {
  return Boolean(template && THERMAL_ONLY_INVOICE_TEMPLATES.has(template));
}

/** Default 80mm design when POS Bill Format is Thermal. */
export const DEFAULT_THERMAL_80MM_INVOICE_TEMPLATE = 'kids-80mm';

/** POS Bill Format default is thermal when unset. */
export function isPosThermalBillFormat(format?: string | null): boolean {
  return !format || format === 'thermal';
}

/**
 * When POS thermal is on, keep only 80mm designs.
 * When leaving thermal, drop kids-80mm so A4/A5 format is not forced back.
 */
export function posInvoiceTemplateForBillFormat(
  nextFormat: string,
  currentTemplate: string,
): string | undefined {
  if (isPosThermalBillFormat(nextFormat)) {
    return THERMAL_ONLY_INVOICE_TEMPLATES.has(currentTemplate)
      ? undefined
      : DEFAULT_THERMAL_80MM_INVOICE_TEMPLATE;
  }
  if (THERMAL_ONLY_INVOICE_TEMPLATES.has(currentTemplate)) {
    return 'modern';
  }
  return undefined;
}

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
  'gurukrupa',
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

export type SaleSettingsBillFormatSlice = SaleSettingsTemplateSlice & {
  pos_bill_format?: string | null;
  sales_bill_format?: string | null;
  invoice_paper_format?: string | null;
};

/** Resolve effective POS paper from cached settings (matches POSSales / POSDashboard). */
export function resolvePosBillFormatFromSaleSettings(
  saleSettings?: SaleSettingsBillFormatSlice | null,
): PosBillFormat {
  const template = resolvePosInvoiceTemplate(saleSettings);
  const raw =
    saleSettings?.pos_bill_format || saleSettings?.sales_bill_format || 'thermal';
  return resolvePosBillFormat(template, raw, saleSettings?.invoice_paper_format ?? undefined);
}

/** Resolve sale-return / credit-note print format from settings (Sale Return dashboard). */
export function resolveSaleReturnPrintFormatFromSettings(
  saleSettings?: SaleSettingsBillFormatSlice | null,
): PosBillFormat {
  const template = resolveSaleInvoiceTemplate(saleSettings);
  const raw =
    saleSettings?.sales_bill_format || saleSettings?.pos_bill_format || 'a4';
  return resolveSaleBillFormat(template, raw, saleSettings?.invoice_paper_format ?? undefined);
}

/**
 * @page CSS for POS credit notes and sale-return prints — mirrors POS invoice paper routing.
 * Import `getThermalReceiptPageStyleFragment` at call site when bundling is preferred; inlined via dynamic import path below.
 */
export function getPosDocumentPrintPageStyle(
  posBillFormat: PosBillFormat,
  posThermalPaper: PosThermalPaper,
  thermalStyleFragment: string,
): string {
  const documentPrintCss = CREDIT_NOTE_DOCUMENT_PRINT_CSS;

  if (posBillFormat === 'thermal') {
    const thermalPage = posThermalPageCss(posThermalPaper);
    return `
      @page {
        size: ${thermalPage.pageSize};
        margin: 0;
      }
      ${thermalStyleFragment}
      @media print {
        html, body {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          overflow: visible !important;
        }
        .credit-note-print,
        .thermal-print-80mm,
        .thermal-receipt-container,
        .sale-return-thermal {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 auto !important;
          padding: 0 !important;
        }
      }
      ${documentPrintCss}
    `;
  }

  let size = 'A5 portrait';
  let margin = '5mm';
  switch (posBillFormat) {
    case 'a5-horizontal':
      size = 'A5 landscape';
      break;
    case 'a4':
      size = 'A4 portrait';
      margin = '10mm';
      break;
    default:
      break;
  }

  return `
    @page {
      size: ${size};
      margin: ${margin};
    }
    ${documentPrintCss}
  `;
}
