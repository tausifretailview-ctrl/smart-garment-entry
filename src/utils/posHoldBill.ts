/**
 * POS Hold bills (F7) park a cart as Hold/YY-YY/N without stock or a real POS number.
 * Completing Mix / Cash must promote that number to POS/ — otherwise Sale Report
 * keeps showing Hold/ after the cashier already refunded an S/R exchange.
 */

export function isHoldSaleNumber(saleNumber: string | null | undefined): boolean {
  return typeof saleNumber === "string" && saleNumber.startsWith("Hold/");
}

/** Same-bill S/R exchange where return > new items (customer is owed money). */
export function posBillHasExchangeRefundDue(
  netAmount: number,
  exchangeRefundDue = 0,
): boolean {
  return Number(netAmount) < -0.005 || Number(exchangeRefundDue) > 0.005;
}

/**
 * Completing a parked Hold/ row (Mix, Cash, Credit, …) must assign a POS number.
 * Staying on Hold/ is only valid while payment_status remains hold.
 */
export function shouldPromoteHoldNumberToPos(
  saleNumber: string | null | undefined,
  nextPaymentStatus?: string | null,
): boolean {
  if (!isHoldSaleNumber(saleNumber)) return false;
  return String(nextPaymentStatus || "") !== "hold";
}
