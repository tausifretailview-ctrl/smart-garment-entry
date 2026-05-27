/** Shared settlement math for customer receipts and supplier payments. */

export const SETTLEMENT_TOLERANCE_RUPEE = 0.99;

export function toNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundToRupee(value: unknown): number {
  return Math.max(0, Math.round(toNumberOrZero(value)));
}

/** Voucher credit that reduces AR/AP: cash (`total_amount`) + settlement discount (`discount_amount`). */
export function voucherSettlementCredit(v: {
  total_amount?: number | null;
  discount_amount?: number | null;
}): number {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

/**
 * Settlement (invoice/bill total), optional % discount → cash paid/received + discount rupees.
 * `settlementRaw` is the amount entered as the total against selected documents.
 */
export function resolvePaymentBreakdown(
  settlementRaw: string,
  discountPercentRaw: string,
  discountAmountRaw: string,
) {
  const settlement = roundToRupee(settlementRaw);
  const pct = Math.min(100, Math.max(0, toNumberOrZero(discountPercentRaw)));
  let discount = 0;
  if (pct > 0 && settlement > 0) {
    discount = roundToRupee((settlement * pct) / 100);
  } else {
    discount = roundToRupee(discountAmountRaw);
    if (discount > settlement && settlement > 0) discount = settlement;
  }
  const cash = roundToRupee(Math.max(0, settlement - discount));
  return { settlement, discount, cash, discountPercent: pct };
}
