import { describe, expect, it } from 'vitest';
import {
  getRealTastA4PrintPageStyle,
  isPosSaleDocument,
  isPosThermalBillFormat,
  isThermal80mmInvoiceTemplate,
  posInvoiceTemplateForBillFormat,
  resolvePosBillFormat,
  resolvePosBillFormatFromSaleSettings,
  resolvePosInvoiceTemplate,
  resolveSaleBillFormat,
  resolveSaleInvoiceTemplate,
  resolveSalePreviewPrintConfig,
  resolveSaleReturnPrintFormatFromSettings,
  resolvePrintLogoOnPreprintedLetterhead,
  shouldPrintPreprintedLetterheadLogo,
  toInvoiceWrapperFormat,
  isA5PortraitInvoiceTemplate,
} from '@/utils/invoicePrintFormat';

describe('resolveSaleInvoiceTemplate / resolvePosInvoiceTemplate', () => {
  it('defaults sale template to professional', () => {
    expect(resolveSaleInvoiceTemplate({})).toBe('professional');
  });

  it('POS falls back to sale template when pos_invoice_template is unset', () => {
    expect(
      resolvePosInvoiceTemplate({ invoice_template: 'a4-gst-classic' }),
    ).toBe('a4-gst-classic');
  });

  it('POS uses its own template when set', () => {
    expect(
      resolvePosInvoiceTemplate({
        invoice_template: 'a4-gst-classic',
        pos_invoice_template: 'wholesale-a5',
      }),
    ).toBe('wholesale-a5');
  });
});

describe('toInvoiceWrapperFormat', () => {
  it('maps a5-vertical settings value to a5-vertical wrapper format', () => {
    expect(toInvoiceWrapperFormat('a5-vertical')).toBe('a5-vertical');
    expect(toInvoiceWrapperFormat('a5')).toBe('a5-vertical');
  });
});

describe('resolvePosBillFormat', () => {
  it('uses A5 Retail ERP when template is retail-erp even if POS format is thermal', () => {
    expect(resolvePosBillFormat('retail-erp', 'thermal', 'thermal')).toBe('a5');
  });

  it('uses A5 for Gurukrupa even if POS format is thermal', () => {
    expect(resolvePosBillFormat('gurukrupa', 'thermal', 'thermal')).toBe('a5');
    expect(resolveSaleBillFormat('gurukrupa', 'thermal', 'thermal')).toBe('a5');
    expect(isA5PortraitInvoiceTemplate('gurukrupa')).toBe(true);
    expect(isA5PortraitInvoiceTemplate('retail-erp')).toBe(true);
    expect(isA5PortraitInvoiceTemplate('kids-80mm')).toBe(false);
  });

  it('honors POS thermal for generic tax-invoice template', () => {
    expect(resolvePosBillFormat('tax-invoice', 'thermal', 'a4')).toBe('thermal');
  });

  it('uses A5 when POS format is A5 and template is retail-erp', () => {
    expect(resolvePosBillFormat('retail-erp', 'a5', 'a4')).toBe('a5');
  });

  it('forces A4 for real-tast even when POS thermal is selected', () => {
    expect(resolvePosBillFormat('real-tast', 'thermal', 'thermal')).toBe('a4');
  });

  it('forces thermal for kids-80mm template', () => {
    expect(resolvePosBillFormat('kids-80mm', 'a4', 'a4')).toBe('thermal');
  });

  it('forces thermal for Retail POS 80mm template', () => {
    expect(resolvePosBillFormat('retail-pos-80mm', 'a4', 'a4')).toBe('thermal');
    expect(isThermal80mmInvoiceTemplate('retail-pos-80mm')).toBe(true);
    expect(posInvoiceTemplateForBillFormat('thermal', 'retail-pos-80mm')).toBeUndefined();
  });

  it('forces thermal for Trendzo POS 80mm template', () => {
    expect(resolvePosBillFormat('trendzo-pos-80mm', 'a4', 'a4')).toBe('thermal');
    expect(isThermal80mmInvoiceTemplate('trendzo-pos-80mm')).toBe(true);
    expect(posInvoiceTemplateForBillFormat('thermal', 'trendzo-pos-80mm')).toBeUndefined();
  });

  it('follows POS A5 for preprinted letterhead template', () => {
    expect(resolvePosBillFormat('retail-erp-preprinted', 'a5', 'a4')).toBe('a5');
  });

  it('follows POS A4 for preprinted letterhead template', () => {
    expect(resolvePosBillFormat('retail-erp-preprinted', 'a4', 'a5')).toBe('a4');
  });

  it('falls back to A4 when POS thermal is selected with preprinted template', () => {
    expect(resolvePosBillFormat('retail-erp-preprinted', 'thermal', 'a4')).toBe('a4');
  });
});

describe('isPosThermalBillFormat / posInvoiceTemplateForBillFormat', () => {
  it('treats unset POS bill format as thermal', () => {
    expect(isPosThermalBillFormat(undefined)).toBe(true);
    expect(isPosThermalBillFormat('thermal')).toBe(true);
    expect(isPosThermalBillFormat('a4')).toBe(false);
  });

  it('forces kids-80mm when enabling thermal on a laser template', () => {
    expect(posInvoiceTemplateForBillFormat('thermal', 'modern')).toBe('kids-80mm');
    expect(posInvoiceTemplateForBillFormat('thermal', 'kids-80mm')).toBeUndefined();
  });

  it('drops kids-80mm when leaving thermal so A4/A5 can stick', () => {
    expect(posInvoiceTemplateForBillFormat('a4', 'kids-80mm')).toBe('modern');
    expect(posInvoiceTemplateForBillFormat('a5-vertical', 'wholesale-a5')).toBeUndefined();
  });
});

describe('resolvePosBillFormatFromSaleSettings', () => {
  it('treats a5-vertical POS setting as A5 laser (not thermal)', () => {
    expect(
      resolvePosBillFormatFromSaleSettings({
        pos_bill_format: 'a5-vertical',
        pos_invoice_template: 'tax-invoice',
      }),
    ).toBe('a5');
  });

  it('uses thermal when POS bill format is thermal', () => {
    expect(
      resolvePosBillFormatFromSaleSettings({
        pos_bill_format: 'thermal',
        pos_invoice_template: 'tax-invoice',
      }),
    ).toBe('thermal');
  });
});

describe('resolveSaleReturnPrintFormatFromSettings', () => {
  it('prefers sales_bill_format over pos_bill_format', () => {
    expect(
      resolveSaleReturnPrintFormatFromSettings({
        sales_bill_format: 'a4',
        pos_bill_format: 'thermal',
        invoice_template: 'tax-invoice',
      }),
    ).toBe('a4');
  });
});

describe('resolveSaleBillFormat', () => {
  it('still upgrades sale thermal to laser when template is full-page', () => {
    expect(resolveSaleBillFormat('tax-invoice', 'thermal', 'a4')).toBe('a4');
    expect(resolveSaleBillFormat('retail-erp', 'thermal', 'a5-vertical')).toBe('a5');
  });

  it('follows sale A5 for preprinted letterhead template', () => {
    expect(resolveSaleBillFormat('retail-erp-preprinted', 'a5', 'a4')).toBe('a5');
  });
});

describe('getRealTastA4PrintPageStyle', () => {
  it('prints a full A4 leaf (210×297mm) with zero page margin', () => {
    const css = getRealTastA4PrintPageStyle();
    expect(css).toContain('size: 210mm 297mm');
    expect(css).toContain('margin: 0');
    expect(css).toContain('data-invoice-variant="real-tast"');
    expect(css).toContain('height: 297mm !important');
    expect(css).toContain('min-height: 297mm !important');
    expect(css).toContain('max-height: 297mm !important');
  });

  it('does not clip extra pages — wrappers stay auto-height', () => {
    const css = getRealTastA4PrintPageStyle();
    expect(css).toMatch(/html, body \{[\s\S]*?height: auto !important/);
    expect(css).toMatch(/html, body \{[\s\S]*?overflow: visible !important/);
    expect(css).toMatch(/\.retail-erp-all-pages \{[\s\S]*?height: auto !important/);
    expect(css).toMatch(/\.retail-erp-all-pages \{[\s\S]*?max-height: none !important/);
    expect(css).toContain('page-break-after: always');
    expect(css).toContain('break-after: page');
  });
});

describe('resolveSalePreviewPrintConfig', () => {
  it('routes POS bills to POS template and thermal paper', () => {
    const cfg = resolveSalePreviewPrintConfig(
      { sale_type: 'pos', sale_number: 'POS/26-27/285' },
      {
        pos_bill_format: 'thermal',
        pos_invoice_template: 'trendzo-pos-80mm',
        invoice_template: 'professional',
        sales_bill_format: 'a4',
      },
    );
    expect(cfg.documentType).toBe('pos');
    expect(cfg.paperFormat).toBe('thermal');
    expect(cfg.template).toBe('trendzo-pos-80mm');
  });

  it('routes invoices to sale template and A4 paper', () => {
    const cfg = resolveSalePreviewPrintConfig(
      { sale_type: 'invoice', sale_number: 'INV/26-27/10' },
      {
        pos_bill_format: 'thermal',
        pos_invoice_template: 'trendzo-pos-80mm',
        invoice_template: 'professional',
        sales_bill_format: 'a4',
      },
    );
    expect(cfg.documentType).toBe('invoice');
    expect(cfg.paperFormat).toBe('a4');
    expect(cfg.template).toBe('professional');
  });

  it('treats POS/ numbers as POS when sale_type is missing', () => {
    expect(isPosSaleDocument({ sale_number: 'POS/26-27/285' })).toBe(true);
    expect(isPosSaleDocument({ sale_type: 'invoice', sale_number: 'POS/26-27/285' })).toBe(false);
  });
});

describe('preprinted letterhead logo opt-in', () => {
  it('stays off for existing letterpad orgs (unset / false / string)', () => {
    expect(resolvePrintLogoOnPreprintedLetterhead(undefined)).toBe(false);
    expect(resolvePrintLogoOnPreprintedLetterhead({})).toBe(false);
    expect(resolvePrintLogoOnPreprintedLetterhead({ print_logo_on_preprinted_letterhead: false })).toBe(
      false,
    );
    expect(
      resolvePrintLogoOnPreprintedLetterhead({
        print_logo_on_preprinted_letterhead: 'true' as unknown as boolean,
      }),
    ).toBe(false);
  });

  it('turns on only for the explicit boolean', () => {
    expect(
      resolvePrintLogoOnPreprintedLetterhead({ print_logo_on_preprinted_letterhead: true }),
    ).toBe(true);
  });

  it('prints the logo only on preprinted + enabled + uploaded logo', () => {
    expect(
      shouldPrintPreprintedLetterheadLogo({
        isPreprinted: true,
        enabled: true,
        logoUrl: 'https://example.com/semme.png',
      }),
    ).toBe(true);
    expect(
      shouldPrintPreprintedLetterheadLogo({
        isPreprinted: true,
        enabled: false,
        logoUrl: 'https://example.com/semme.png',
      }),
    ).toBe(false);
    expect(
      shouldPrintPreprintedLetterheadLogo({
        isPreprinted: false,
        enabled: true,
        logoUrl: 'https://example.com/semme.png',
      }),
    ).toBe(false);
    expect(
      shouldPrintPreprintedLetterheadLogo({
        isPreprinted: true,
        enabled: true,
        logoUrl: '  ',
      }),
    ).toBe(false);
  });
});
