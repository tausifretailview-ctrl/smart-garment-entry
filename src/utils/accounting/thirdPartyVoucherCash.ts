/** voucher_entries.reference_type for third-party pay/receive (cash report consumers). */
export const THIRD_PARTY_VOUCHER_REFERENCE_TYPE = "third_party" as const;

/** journal_entries.reference_type for third-party GL postings. */
export const THIRD_PARTY_JOURNAL_REFERENCE_TYPE = "ThirdPartyVoucher" as const;

export type ThirdPartyVoucherDirection = "paid_out" | "received";

export type DailyTallyVoucherOutflowBucket =
  | "supplier"
  | "employee"
  | "expense"
  | "third_party"
  | "customer_refund"
  | "none";

export function paymentMethodFromCashBankAccount(account: {
  account_code: string;
  account_name: string;
}): string {
  if (account.account_code === "1010") return "bank_transfer";
  if (/bank|upi|card/i.test(account.account_name)) return "bank_transfer";
  return "cash";
}

export function voucherTypeForThirdPartyDirection(direction: ThirdPartyVoucherDirection): "payment" | "receipt" {
  return direction === "received" ? "receipt" : "payment";
}

/** Classify payment vouchers for daily cash outflow buckets (mutually exclusive). */
export function classifyDailyTallyPaymentOutflow(voucher: {
  voucher_type?: string | null;
  reference_type?: string | null;
}): DailyTallyVoucherOutflowBucket {
  const vt = String(voucher.voucher_type || "").toLowerCase();
  const rt = String(voucher.reference_type || "").toLowerCase();
  if (vt === "payment" && rt === "supplier") return "supplier";
  if (vt === "payment" && rt === "employee") return "employee";
  if (vt === "expense" || rt === "expense") return "expense";
  if (vt === "payment" && rt === THIRD_PARTY_VOUCHER_REFERENCE_TYPE) return "third_party";
  if (vt === "payment" && rt === "customer") return "customer_refund";
  return "none";
}

/** P&L / trial balance expense fetches — third-party payments must stay excluded. */
export function isOperatingExpenseVoucher(voucher: {
  voucher_type?: string | null;
  reference_type?: string | null;
}): boolean {
  const vt = String(voucher.voucher_type || "").toLowerCase();
  const rt = String(voucher.reference_type || "").toLowerCase();
  return vt === "expense" || rt === "expense";
}
