/** Customer payment vouchers that pay out credit-note / sale-return balances (not advance_refunds). */

export function isCnRefundPaymentVoucher(v: {
  voucher_type?: string | null;
  reference_type?: string | null;
  description?: string | null;
  payment_method?: string | null;
  voucher_number?: string | null;
}): boolean {
  if (String(v.voucher_type || "").toLowerCase() !== "payment") return false;
  if (String(v.reference_type || "").toLowerCase() !== "customer") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "cn_refund") return true;
  const desc = String(v.description || "").toLowerCase();
  if (desc.includes("credit note refund")) return true;
  if (desc.includes("refund paid for sale return")) return true;
  const vn = String(v.voucher_number || "").toUpperCase();
  if (vn.startsWith("RF/") || vn.startsWith("CN-REFUND")) return true;
  return false;
}

/** Sale return number embedded in CN refund voucher description (e.g. SR/26-27/20). */
export function parseSaleReturnRefFromCnRefundDescription(description: string): string | null {
  const m = String(description || "").match(/SR\/\d{2}-\d{2}\/\d+/i);
  return m ? m[0].toUpperCase() : null;
}
