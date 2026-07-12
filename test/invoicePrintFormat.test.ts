import { describe, expect, it } from 'vitest';
import { resolvePosBillFormat, resolveSaleBillFormat } from '@/utils/invoicePrintFormat';

describe('resolvePosBillFormat', () => {
  it('honors POS thermal when invoice template is retail-erp (laser A5 design)', () => {
    expect(resolvePosBillFormat('retail-erp', 'thermal', 'a4')).toBe('thermal');
  });

  it('honors POS thermal when invoice template is tax-invoice', () => {
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
});

describe('resolveSaleBillFormat', () => {
  it('still upgrades sale thermal to laser when template is full-page', () => {
    expect(resolveSaleBillFormat('tax-invoice', 'thermal', 'a4')).toBe('a4');
    expect(resolveSaleBillFormat('retail-erp', 'thermal', 'a5-vertical')).toBe('a5');
  });
});
