/**
 * Standalone POS / sale-return cash refunds for cashier reports.
 *
 * Exchange overflow lives on `sales.refund_amount`. Direct S/R refunds live on
 * `sale_returns` (`refund_type = cash_refund` plus payment_method). Do not add
 * the matching "Refund paid for sale return" payment voucher on top.
 */

export type CashierSaleReturnRefundRow = {
  net_amount?: number | null;
  refund_type?: string | null;
  payment_method?: string | null;
};

const DRAWER_REFUND_TYPES = new Set([
  "cash_refund",
  "upi_refund",
  "card_refund",
  "bank_refund",
]);

export function isDrawerSaleReturnRefund(row: CashierSaleReturnRefundRow): boolean {
  return DRAWER_REFUND_TYPES.has(String(row.refund_type || "").toLowerCase());
}

export function cashierSaleReturnRefundMode(
  row: CashierSaleReturnRefundRow,
): "cash" | "upi" | "card" | "bank" {
  const refundType = String(row.refund_type || "").toLowerCase();
  if (refundType === "upi_refund") return "upi";
  if (refundType === "card_refund") return "card";
  if (refundType === "bank_refund") return "bank";
  const pm = String(row.payment_method || "cash").toLowerCase().trim();
  if (pm === "upi") return "upi";
  if (pm === "card") return "card";
  if (pm === "bank" || pm === "cheque" || pm === "neft" || pm === "bank_transfer") return "bank";
  return "cash";
}

export function sumCashierSaleReturnRefunds(
  rows: CashierSaleReturnRefundRow[] | null | undefined,
): {
  refundTotal: number;
  cashOut: number;
  upiOut: number;
  cardOut: number;
  bankOut: number;
} {
  let refundTotal = 0;
  let cashOut = 0;
  let upiOut = 0;
  let cardOut = 0;
  let bankOut = 0;
  for (const row of rows || []) {
    if (!isDrawerSaleReturnRefund(row)) continue;
    const amt = Number(row.net_amount) || 0;
    if (amt <= 0) continue;
    refundTotal += amt;
    const mode = cashierSaleReturnRefundMode(row);
    if (mode === "upi") upiOut += amt;
    else if (mode === "card") cardOut += amt;
    else if (mode === "bank") bankOut += amt;
    else cashOut += amt;
  }
  return { refundTotal, cashOut, upiOut, cardOut, bankOut };
}

/** Payment voucher written for a named-customer standalone cash refund. */
export function isSaleReturnRefundPaymentVoucher(v: { description?: string | null }): boolean {
  return /refund paid for sale return/i.test(String(v.description || ""));
}
