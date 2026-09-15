/** Purchase bill paid / pending — aligns dashboard with CN-on-bill (`paid_amount`) and payments. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";

const EPS = 0.01;
const SYNC_EPS = 0.009;

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

export type PurchaseBillPaymentSyncResult = {
  paid_amount: number;
  payment_status: PurchaseBillDisplayStatus;
  changed: boolean;
};

/** Derive stored bill paid/status from current row + bill-linked payment voucher settlement. */
export function reconcilePurchaseBillPaymentState(
  bill: PurchaseBillPaymentLike,
  voucherSettlementTotal: number,
): PurchaseBillPaymentSyncResult {
  const paid_amount = getEffectivePaidAmountForPurchaseBill(bill, voucherSettlementTotal);
  const payment_status = derivePurchaseBillDisplayStatus(bill, voucherSettlementTotal);
  const storedPaid = round2(Number(bill.paid_amount ?? 0));
  const storedStatus = (bill.payment_status || "unpaid").toLowerCase();
  const changed =
    Math.abs(storedPaid - paid_amount) > SYNC_EPS || storedStatus !== payment_status;
  return { paid_amount, payment_status, changed };
}

function sumBillLinkedPaymentSettlement(
  rows: Array<{ total_amount?: number | null; discount_amount?: number | null }>,
): number {
  return round2(
    rows.reduce((sum, row) => sum + voucherSettlementCredit(row), 0),
  );
}

/** Canonical writer: align purchase_bills.paid_amount/status with bill-linked payment vouchers. */
export async function syncPurchaseBillPaymentFromVouchers(
  billId: string,
  organizationId: string,
  client: SupabaseClient,
): Promise<PurchaseBillPaymentSyncResult> {
  const { data: bill, error: billError } = await client
    .from("purchase_bills")
    .select("id, net_amount, paid_amount, payment_status")
    .eq("id", billId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (billError) throw billError;
  if (!bill) throw new Error(`Purchase bill not found: ${billId}`);

  const { data: voucherRows, error: voucherError } = await client
    .from("voucher_entries")
    .select("total_amount, discount_amount")
    .eq("organization_id", organizationId)
    .eq("reference_type", "supplier")
    .eq("voucher_type", "payment")
    .eq("reference_id", billId)
    .is("deleted_at", null);
  if (voucherError) throw voucherError;

  const voucherSettlementTotal = sumBillLinkedPaymentSettlement(voucherRows || []);
  const rec = reconcilePurchaseBillPaymentState(bill, voucherSettlementTotal);
  if (rec.changed) {
    const { error: updateError } = await client
      .from("purchase_bills")
      .update({ paid_amount: rec.paid_amount, payment_status: rec.payment_status })
      .eq("id", billId)
      .eq("organization_id", organizationId);
    if (updateError) throw updateError;
  }
  return rec;
}

export async function syncPurchaseBillPaymentsFromVouchersBatch(
  billIds: string[],
  organizationId: string,
  client: SupabaseClient,
): Promise<Map<string, PurchaseBillPaymentSyncResult>> {
  const uniqueIds = [...new Set(billIds.filter(Boolean))];
  const results = new Map<string, PurchaseBillPaymentSyncResult>();
  await Promise.all(
    uniqueIds.map(async (billId) => {
      results.set(billId, await syncPurchaseBillPaymentFromVouchers(billId, organizationId, client));
    }),
  );
  return results;
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
