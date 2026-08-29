import { describe, expect, it } from 'vitest';
import {
  getRealTastA4PrintPageStyle,
  isPosThermalBillFormat,
  isThermal80mmInvoiceTemplate,
  posInvoiceTemplateForBillFormat,
  resolvePosBillFormat,
  resolvePosBillFormatFromSaleSettings,
  resolvePosInvoiceTemplate,
  resolveSaleBillFormat,
  resolveSaleInvoiceTemplate,
  resolveSaleReturnPrintFormatFromSettings,
  toInvoiceWrapperFormat,
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
