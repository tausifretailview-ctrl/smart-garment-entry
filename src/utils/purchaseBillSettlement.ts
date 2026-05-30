/** Purchase bill paid / pending — aligns dashboard with CN-on-bill (`paid_amount`) and payments. */

const EPS = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PurchaseBillPaymentLike = {
  net_amount?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
};

export function getEffectivePaidAmountForPurchaseBill(
  bill: PurchaseBillPaymentLike,
  voucherPaidOnBill = 0
): number {
  const net = round2(Number(bill.net_amount ?? 0));
  const stored = round2(Number(bill.paid_amount ?? 0));
  const voucher = round2(Math.max(0, voucherPaidOnBill));
  if (net <= 0) return 0;
  return Math.min(net, Math.max(stored, voucher));
}

export function getPurchaseBillPendingAmount(
  bill: PurchaseBillPaymentLike,
  voucherPaidOnBill = 0
): number {
  const net = round2(Number(bill.net_amount ?? 0));
  const paid = getEffectivePaidAmountForPurchaseBill(bill, voucherPaidOnBill);
  return round2(Math.max(0, net - paid));
}

export type PurchaseBillDisplayStatus = "paid" | "partial" | "unpaid";

/** Derive status from amounts (CN adjust updates paid_amount on the bill). */
export function derivePurchaseBillDisplayStatus(
  bill: PurchaseBillPaymentLike,
  voucherPaidOnBill = 0
): PurchaseBillDisplayStatus {
  const net = round2(Number(bill.net_amount ?? 0));
  const paid = getEffectivePaidAmountForPurchaseBill(bill, voucherPaidOnBill);
  if (net <= EPS) return "paid";
  if (paid >= net - EPS) return "paid";
  if (paid > EPS) return "partial";
  const stored = (bill.payment_status || "").toLowerCase();
  if (stored === "paid") return "paid";
  if (stored === "partial") return "partial";
  return "unpaid";
}

/** CN applied to a bill: gross CN minus remainder still available on the return. */
export function purchaseCnAppliedToBillAmount(
  cnVoucherAmount: number,
  creditAvailableBalance: number | null | undefined
): number {
  const gross = round2(Math.max(0, cnVoucherAmount));
  if (creditAvailableBalance == null || creditAvailableBalance === undefined) return gross;
  return round2(Math.max(0, gross - Number(creditAvailableBalance)));
}
