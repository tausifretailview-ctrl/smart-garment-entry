/**
 * Sales-invoice discount restore + paid-edit guard.
 *
 * sale_items has no discount_amount column. Rupee line discounts live in
 * line_total (unit_price * qty − line_total). Header flat is
 * sales.flat_discount_amount. Loading must restore both; treating the
 * line_total gap as “already in the form” while forcing discountAmount=0
 * is what drops the printed Discount on edit/save (Uzma Kudia / ELLA NOOR).
 */

export type SaleHeaderDiscountSource = {
  gross_amount?: number | null;
  net_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  flat_discount_percent?: number | null;
  other_charges?: number | null;
  round_off?: number | null;
  points_redeemed_amount?: number | null;
};

export type SaleItemDiscountSource = {
  unit_price?: number | null;
  quantity?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  discount_share?: number | null;
  line_total?: number | null;
};

export type SaleLineDiscountFields = {
  discountPercent: number;
  discountAmount: number;
};

const EPS = 0.005;

function n(value: number | null | undefined): number {
  return Number(value) || 0;
}

/** Restore flat discount when opening a saved invoice (legacy rows may only have discount in discount_amount). */
export function resolveFlatDiscountFromSale(
  invoice: SaleHeaderDiscountSource,
  saleItems: SaleItemDiscountSource[],
): { percent: number; rupees: number } {
  const percent = n(invoice.flat_discount_percent);
  const rupees = n(invoice.flat_discount_amount);
  if (rupees > EPS || percent > EPS) {
    return { percent, rupees };
  }

  const lineDisc = saleItems.reduce((sum, item) => {
    const lt = n(item.line_total);
    const base = n(item.unit_price) * n(item.quantity);
    if (lt > 0 && base > 0) {
      return sum + Math.max(0, base - lt - n(item.discount_share));
    }
    const itemDiscAmt = n(item.discount_amount);
    if (itemDiscAmt > 0) return sum + itemDiscAmt;
    return sum + (base * n(item.discount_percent)) / 100;
  }, 0);

  const headerDisc = n(invoice.discount_amount);
  const orphanHeader = Math.max(0, headerDisc - lineDisc);
  const gross = n(invoice.gross_amount);
  const net = n(invoice.net_amount);
  const other = n(invoice.other_charges);
  const round = n(invoice.round_off);
  const points = n(invoice.points_redeemed_amount);
  const implied = Math.max(0, gross - lineDisc - net + other - round - points);
  const flatRupees = orphanHeader > EPS ? orphanHeader : implied;
  return { percent: 0, rupees: Math.round(flatRupees * 100) / 100 };
}

/**
 * Restore form discount fields from a persisted sale_item.
 * Rupee discounts are inferred from the unit×qty vs line_total gap when
 * discount_percent is 0. discount_share (allocated header flat) is excluded
 * so we do not double-count a real flat_discount_amount.
 */
export function hydrateSaleItemDiscountFields(item: SaleItemDiscountSource): SaleLineDiscountFields {
  const qty = n(item.quantity);
  const base = n(item.unit_price) * qty;
  const percent = n(item.discount_percent);
  const storedRupee = n(item.discount_amount);
  const share = n(item.discount_share);
  const lineTotal = n(item.line_total);

  if (percent > EPS) {
    return { discountPercent: percent, discountAmount: 0 };
  }

  if (storedRupee > EPS) {
    return { discountPercent: 0, discountAmount: Math.round(storedRupee * 100) / 100 };
  }

  // Exclusive GST can make line_total > base — do not treat that as a discount.
  if (base > EPS && lineTotal > base + EPS) {
    return { discountPercent: 0, discountAmount: 0 };
  }

  if (base > EPS && lineTotal > EPS) {
    const gap = Math.max(0, base - lineTotal - share);
    if (gap > EPS) {
      return { discountPercent: 0, discountAmount: Math.round(gap * 100) / 100 };
    }
  }

  return { discountPercent: 0, discountAmount: 0 };
}

/** Inclusive-tax header totals — same shape as SalesInvoice.tsx footer. */
export function computeSalesInvoiceHeaderTotals(args: {
  lines: Array<{
    salePrice: number;
    quantity: number;
    discountPercent: number;
    discountAmount: number;
  }>;
  flatDiscountPercent?: number;
  flatDiscountRupees?: number;
  otherCharges?: number;
  roundOff?: number;
}): {
  grossAmount: number;
  lineItemDiscount: number;
  flatDiscountAmount: number;
  totalDiscount: number;
  netAmount: number;
} {
  const grossAmount = args.lines.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
  const lineItemDiscount = args.lines.reduce((sum, item) => {
    const base = item.salePrice * item.quantity;
    const discount =
      item.discountAmount > 0
        ? item.discountAmount
        : item.discountPercent > 0
          ? (base * item.discountPercent) / 100
          : 0;
    return sum + discount;
  }, 0);
  const flatDiscountAmount =
    (grossAmount * (args.flatDiscountPercent || 0)) / 100 + (args.flatDiscountRupees || 0);
  const totalDiscount = lineItemDiscount + flatDiscountAmount;
  const netAmount = Math.round(
    grossAmount - totalDiscount + (args.otherCharges || 0) + (args.roundOff || 0),
  );
  return { grossAmount, lineItemDiscount, flatDiscountAmount, totalDiscount, netAmount };
}

export function recordedInvoiceReceiptAmount(sale: {
  paid_amount?: number | null;
  credit_applied?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
}): number {
  const paid = n(sale.paid_amount);
  const credit = n(sale.credit_applied);
  const tender = n(sale.cash_amount) + n(sale.card_amount) + n(sale.upi_amount);
  return Math.max(paid, credit, tender);
}

export function invoiceHasRecordedReceipt(sale: Parameters<typeof recordedInvoiceReceiptAmount>[0]): boolean {
  return recordedInvoiceReceiptAmount(sale) > EPS;
}

export function formatPaidInvoiceLineEditWarning(received: number): string {
  const amt = Math.round(n(received)).toLocaleString("en-IN");
  return `This invoice already has ₹${amt} received — editing items may create a balance mismatch. Continue?`;
}

/** Persist a percent so returns/other screens can round-trip rupee line discounts. */
export function saleItemDiscountPercentForPersist(
  baseAmount: number,
  discountPercent: number,
  discountAmount: number,
): number {
  if (n(discountPercent) > EPS) return n(discountPercent);
  if (baseAmount > EPS && n(discountAmount) > EPS) {
    return Math.round((n(discountAmount) / baseAmount) * 1e6) / 1e4;
  }
  return 0;
}

export function saleLineFingerprint(
  lines: Array<{ variantId?: string | null; quantity?: number | null }>,
): string {
  return lines
    .map((l) => `${l.variantId || ""}:${n(l.quantity)}`)
    .sort()
    .join("|");
}
