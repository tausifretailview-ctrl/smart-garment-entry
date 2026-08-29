import { describe, expect, it } from "vitest";
import {
  computeSalesInvoiceHeaderTotals,
  formatPaidInvoiceLineEditWarning,
  hydrateSaleItemDiscountFields,
  invoiceHasRecordedReceipt,
  recordedInvoiceReceiptAmount,
  resolveFlatDiscountFromSale,
  saleItemDiscountPercentForPersist,
  saleLineFingerprint,
} from "./salesInvoiceDiscountRestore";

/** INV/26-27/2841 UZMA KUDIA (ELLA NOOR) — printed 21/8/2026. */
const UZMA_ITEMS = [
  { unit_price: 3500, quantity: 1, discount_percent: 0, line_total: 1999, variantId: "a" },
  { unit_price: 4500, quantity: 1, discount_percent: 0, line_total: 3900, variantId: "b" },
  { unit_price: 2500, quantity: 1, discount_percent: 0, line_total: 2500, variantId: "c" },
  { unit_price: 10750, quantity: 1, discount_percent: 0, line_total: 10750, variantId: "d" },
];

const UZMA_HEADER = {
  gross_amount: 21250,
  net_amount: 19149,
  discount_amount: 2101,
  flat_discount_amount: 0,
  flat_discount_percent: 0,
};

describe("hydrateSaleItemDiscountFields — Uzma rupee line discounts", () => {
  it("restores ₹1,501 and ₹600 from line_total gaps when percent is 0", () => {
    expect(hydrateSaleItemDiscountFields(UZMA_ITEMS[0])).toEqual({
      discountPercent: 0,
      discountAmount: 1501,
    });
    expect(hydrateSaleItemDiscountFields(UZMA_ITEMS[1])).toEqual({
      discountPercent: 0,
      discountAmount: 600,
    });
    expect(hydrateSaleItemDiscountFields(UZMA_ITEMS[2])).toEqual({
      discountPercent: 0,
      discountAmount: 0,
    });
    expect(hydrateSaleItemDiscountFields(UZMA_ITEMS[3])).toEqual({
      discountPercent: 0,
      discountAmount: 0,
    });
  });

  it("keeps stored percent and does not invent a rupee amount", () => {
    expect(
      hydrateSaleItemDiscountFields({
        unit_price: 3500,
        quantity: 1,
        discount_percent: 10,
        line_total: 3150,
      }),
    ).toEqual({ discountPercent: 10, discountAmount: 0 });
  });

  it("does not treat exclusive GST (line_total > base) as a discount", () => {
    expect(
      hydrateSaleItemDiscountFields({
        unit_price: 1000,
        quantity: 1,
        discount_percent: 0,
        line_total: 1050,
      }),
    ).toEqual({ discountPercent: 0, discountAmount: 0 });
  });

  it("excludes discount_share so header flat is not double-counted as a line disc", () => {
    expect(
      hydrateSaleItemDiscountFields({
        unit_price: 3500,
        quantity: 1,
        discount_percent: 0,
        discount_share: 346.2,
        line_total: 3153.8,
      }),
    ).toEqual({ discountPercent: 0, discountAmount: 0 });
  });
});

describe("Uzma open → delete line → save totals", () => {
  it("without hydrate, footer loses the ₹2,101 discount (the live bug)", () => {
    const broken = UZMA_ITEMS.map((item) => ({
      salePrice: item.unit_price,
      quantity: item.quantity,
      discountPercent: item.discount_percent,
      discountAmount: 0,
    }));
    const totals = computeSalesInvoiceHeaderTotals({
      lines: broken,
      flatDiscountRupees: resolveFlatDiscountFromSale(UZMA_HEADER, UZMA_ITEMS).rupees,
    });
    // resolveFlat sees line_total gaps = header discount_amount → orphan/implied flat = 0
    expect(totals.totalDiscount).toBe(0);
    expect(totals.netAmount).toBe(21250);
    expect(totals.netAmount - 19149).toBe(2101);
  });

  it("with hydrate, printed Discount ₹2,101 and net ₹19,149 survive", () => {
    const lines = UZMA_ITEMS.map((item) => {
      const d = hydrateSaleItemDiscountFields(item);
      return {
        salePrice: item.unit_price,
        quantity: item.quantity,
        ...d,
      };
    });
    const flat = resolveFlatDiscountFromSale(UZMA_HEADER, UZMA_ITEMS);
    const totals = computeSalesInvoiceHeaderTotals({
      lines,
      flatDiscountPercent: flat.percent,
      flatDiscountRupees: flat.rupees,
    });
    expect(totals.lineItemDiscount).toBe(2101);
    expect(totals.flatDiscountAmount).toBe(0);
    expect(totals.totalDiscount).toBe(2101);
    expect(totals.netAmount).toBe(19149);
  });

  it("deleting the ₹10,750 line keeps the remaining ₹2,101 discount", () => {
    const remaining = UZMA_ITEMS.slice(0, 3).map((item) => {
      const d = hydrateSaleItemDiscountFields(item);
      return { salePrice: item.unit_price, quantity: item.quantity, ...d };
    });
    const totals = computeSalesInvoiceHeaderTotals({
      lines: remaining,
      flatDiscountRupees: 0,
    });
    expect(totals.grossAmount).toBe(10500);
    expect(totals.totalDiscount).toBe(2101);
    expect(totals.netAmount).toBe(8399);
  });

  it("true header flat survives a line delete", () => {
    const fullPriceItems = UZMA_ITEMS.map((item) => ({
      ...item,
      line_total: item.unit_price,
    }));
    const header = {
      ...UZMA_HEADER,
      discount_amount: 0,
      flat_discount_amount: 2101,
    };
    const flat = resolveFlatDiscountFromSale(header, fullPriceItems);
    expect(flat.rupees).toBe(2101);
    const remaining = fullPriceItems.slice(0, 3).map((item) => ({
      salePrice: item.unit_price,
      quantity: item.quantity,
      ...hydrateSaleItemDiscountFields(item),
    }));
    const totals = computeSalesInvoiceHeaderTotals({
      lines: remaining,
      flatDiscountRupees: flat.rupees,
    });
    expect(totals.flatDiscountAmount).toBe(2101);
    expect(totals.netAmount).toBe(8399);
  });
});

describe("paid-invoice line-edit guardrail", () => {
  it("treats paid_amount, credit_applied, or tender as received", () => {
    expect(invoiceHasRecordedReceipt({ paid_amount: 19149 })).toBe(true);
    expect(invoiceHasRecordedReceipt({ credit_applied: 10899 })).toBe(true);
    expect(invoiceHasRecordedReceipt({ cash_amount: 500, upi_amount: 0 })).toBe(true);
    expect(invoiceHasRecordedReceipt({ paid_amount: 0, credit_applied: 0 })).toBe(false);
    expect(recordedInvoiceReceiptAmount({ paid_amount: 19149, cash_amount: 19149 })).toBe(19149);
  });

  it("formats the Continue? warning with the received amount", () => {
    expect(formatPaidInvoiceLineEditWarning(10899)).toBe(
      "This invoice already has ₹10,899 received — editing items may create a balance mismatch. Continue?",
    );
    expect(formatPaidInvoiceLineEditWarning(19149)).toContain("₹19,149");
  });

  it("fingerprints line identity so save can detect an item edit", () => {
    const original = saleLineFingerprint(UZMA_ITEMS);
    const deleted = saleLineFingerprint(UZMA_ITEMS.slice(0, 3));
    expect(original).not.toBe(deleted);
    expect(saleLineFingerprint(UZMA_ITEMS)).toBe(original);
  });
});

describe("saleItemDiscountPercentForPersist", () => {
  it("derives a percent that round-trips Uzma line 1 to ₹1,501", () => {
    const pct = saleItemDiscountPercentForPersist(3500, 0, 1501);
    expect(Math.round((3500 * pct) / 100)).toBe(1501);
  });
});
