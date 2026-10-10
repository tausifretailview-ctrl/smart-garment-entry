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

/**
 * A Hold/ number whose status is no longer "hold" is still a parked bill only while it is
 * pay_later (F7 Hold always saves pay_later; the S/R-exchange refund case keeps it).
 * Bills completed from Hold before Hold/ → POS/ promotion existed keep their Hold/ number
 * with a real tender method (cash / upi / card / multiple) and are real sales.
 * Unknown method (column not selected) keeps the old "any Hold/ is held" behaviour.
 */
export function isParkedHoldNumberSale(sale: {
  sale_number?: string | null;
  payment_method?: string | null;
}): boolean {
  if (!isHoldSaleNumber(sale.sale_number)) return false;
  const method = sale.payment_method;
  if (method == null || String(method).trim() === "") return true;
  return String(method).trim().toLowerCase() === "pay_later";
}
