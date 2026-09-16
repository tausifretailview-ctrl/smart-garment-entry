/** Mix (F6) must persist cash/card/UPI split — never full paid_amount with zero tender. */
export const MIX_PAYMENT_BREAKDOWN_REQUIRED_MESSAGE =
  "Mix payment requires a cash/card/UPI split. Open Mix Payment (F6) and enter the amounts.";

export function assertMixPaymentHasBreakdown(
  paymentMethod: string,
  paymentBreakdown: unknown,
): void {
  if (paymentMethod === "multiple" && !paymentBreakdown) {
    throw new Error(MIX_PAYMENT_BREAKDOWN_REQUIRED_MESSAGE);
  }
}
