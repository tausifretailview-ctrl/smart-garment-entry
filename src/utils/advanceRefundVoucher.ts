/** Customer payment vouchers for advance booking refunds (not CN / sale-return RF). */

export function isAdvanceRefundPaymentVoucher(v: {
  voucher_type?: string | null;
  reference_type?: string | null;
  description?: string | null;
  payment_method?: string | null;
  voucher_number?: string | null;
}): boolean {
  if (String(v.voucher_type || "").toLowerCase() !== "payment") return false;
  if (String(v.reference_type || "").toLowerCase() !== "customer") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "advance_refund") return true;
  const vn = String(v.voucher_number || "").toUpperCase();
  if (vn.startsWith("ARF/")) return true;
  const desc = String(v.description || "").toLowerCase();
  if (desc.includes("advance refund") && !desc.includes("credit note")) return true;
  return false;
}

export function buildAdvanceRefundDescription(params: {
  advanceNumber: string;
  customerName?: string;
  reason?: string | null;
}): string {
  const adv = params.advanceNumber || "advance";
  const cust = params.customerName?.trim();
  const base = cust
    ? `Advance refund for ${adv} to ${cust}`
    : `Advance refund for ${adv}`;
  const reason = params.reason?.trim();
  return reason ? `${base} — ${reason}` : base;
}
