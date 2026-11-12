/** Figures of the POS Net Amount box (PosNetAmountBox), kept apart so they can be unit-tested. */

/** Label above the box: Refund Due, To Collect or Net Amount (same thresholds as before the move). */
export function posNetAmountLabel(finalAmount: number, exchangeRefundDue: number, showToCollect: boolean): string {
  if (finalAmount < -0.005 || exchangeRefundDue > 0.005) return "Refund Due";
  return showToCollect ? "To Collect" : "Net Amount";
}

/** Whole-rupee figure in the box: the refund, the amount left to collect, or the bill net. */
export function posNetAmountBoxValue(
  finalAmount: number,
  exchangeRefundDue: number,
  showToCollect: boolean,
  posTenderDue: number,
): number {
  return Math.round(
    finalAmount < 0 || exchangeRefundDue > 0.005
      ? Math.max(Math.abs(Math.min(0, finalAmount)), exchangeRefundDue)
      : showToCollect
        ? posTenderDue
        : finalAmount,
  );
}

/**
 * Bill net from what the cashier typed. With an advance / gift voucher the box shows what is left
 * to pay, so the advance is added back: typing still sets the bill total.
 */
export function posNetAmountFromTyped(typed: string, showToCollect: boolean, totalBillAdvance: number): number {
  return (parseFloat(typed) || 0) + (showToCollect ? totalBillAdvance : 0);
}
