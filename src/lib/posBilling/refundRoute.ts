/**
 * POS same-bill exchange / refund rules, in one place (Plan Phase 4, save logic).
 *
 * A bill owes the customer money when its net is below zero (a return worth more than the new
 * items) or when the exchange leaves a refund on top of a zero bill (exchangeRefundDue).
 */

/** The bill owes the customer money (net < −0.5 paise, or an exchange refund is due). */
export function posHasRefundDue(finalAmount: number, exchangeRefundDue: number): boolean {
  return finalAmount < -0.005 || exchangeRefundDue > 0.005;
}

/** How much is owed back: the negative net or the exchange refund, whichever is larger. */
export function posRefundDueAmount(finalAmount: number, exchangeRefundDue: number): number {
  return Math.max(Math.abs(Math.min(0, finalAmount)), exchangeRefundDue);
}

export type PosPaymentKeyMethod = "cash" | "card" | "upi" | "pay_later";

/**
 * Where an F1–F4 payment key goes:
 * - no refund due: save with that method;
 * - refund due + Cash: save and pay the refund in cash now (cashExchangeRefund);
 * - refund due + UPI / card / credit: open Mix, where the shop chooses refund mode or credit note.
 */
export function posPaymentKeyRoute(
  method: PosPaymentKeyMethod,
  finalAmount: number,
  exchangeRefundDue: number,
): { kind: "mix" } | { kind: "save"; cashExchangeRefund: number } {
  if (!posHasRefundDue(finalAmount, exchangeRefundDue)) return { kind: "save", cashExchangeRefund: 0 };
  const cashExchangeRefund = method === "cash" ? posRefundDueAmount(finalAmount, exchangeRefundDue) : 0;
  if (cashExchangeRefund <= 0.005) return { kind: "mix" };
  return { kind: "save", cashExchangeRefund };
}

/** Amount the Mix dialog opens with: the refund as a negative figure, else what is left to collect. */
export function posMixDialogBillAmount(finalAmount: number, exchangeRefundDue: number, tenderDue: number): number {
  return posHasRefundDue(finalAmount, exchangeRefundDue) ? -posRefundDueAmount(finalAmount, exchangeRefundDue) : tenderDue;
}
