/** Delete (soft) a supplier payment voucher and undo everything it settled. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";
import { syncPurchaseBillPaymentsFromVouchersBatch } from "@/utils/purchaseBillSettlement";
import { deleteJournalEntryByReference } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SupplierPaymentVoucherLike = {
  id: string;
  voucher_number?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  description?: string | null;
  total_amount?: number | string | null;
  discount_amount?: number | string | null;
};

type BillPaidRow = {
  id: string;
  paid_amount?: number | null;
  net_amount?: number | null;
  supplier_invoice_no?: string | null;
  software_bill_no?: string | null;
};

/**
 * Bill paid/status after taking a deleted voucher's settlement back off.
 * The supplier ledger reads `paid_amount - vouchers` as "Payment at purchase", so the
 * stored amount must come down, or the deleted payment reappears there.
 */
export function purchaseBillPaidAfterVoucherRemoved(
  bill: { paid_amount?: number | null; net_amount?: number | null },
  removedCredit: number,
): { paid_amount: number; payment_status: "paid" | "partial" | "unpaid" } {
  const net = round2(Number(bill.net_amount ?? 0));
  const paid = round2(Math.max(0, Number(bill.paid_amount ?? 0) - Math.max(0, removedCredit)));
  const payment_status = net > 0 && paid >= net - 0.01 ? "paid" : paid > 0.01 ? "partial" : "unpaid";
  return { paid_amount: paid, payment_status };
}

/** Base voucher number of a split payment ("PAY/26-27/872-2" → "PAY/26-27/872"). */
export function supplierPaymentGroupNumber(voucherNumber: string | null | undefined): string {
  const v = String(voucherNumber || "");
  const m = v.match(/^(.*\/\d+)-\d+$/);
  return m ? m[1] : v;
}

/** Other parts of the same split payment (same base number), excluding the voucher itself. */
export function splitPaymentSiblings<T extends { id: string; voucher_number?: string | null }>(
  voucher: T,
  all: T[] | undefined,
): T[] {
  const base = supplierPaymentGroupNumber(voucher.voucher_number);
  if (!base) return [];
  return (all || []).filter((v) => v.id !== voucher.id && supplierPaymentGroupNumber(v.voucher_number) === base);
}

/** Legacy supplier-level vouchers named their bills only in the description. */
function legacyBillRefsFromDescription(description: string | null | undefined): string[] {
  const m = String(description || "").match(/Bills?:\s*(.+?)(?:\s*\||$)/i);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Soft-deletes the voucher (Recycle Bin), removes its day book journal and lowers the
 * paid amount of the bill it settled. Bill-linked vouchers (`reference_id = bill.id`)
 * are exact; legacy supplier-level vouchers fall back to the bill numbers in the
 * description. Opening-balance payments only touch the voucher and journal.
 */
export async function deleteSupplierPaymentVoucher(
  voucher: SupplierPaymentVoucherLike,
  organizationId: string,
  userId: string | null,
  client: SupabaseClient,
): Promise<void> {
  const credit = voucherSettlementCredit({
    total_amount: Number(voucher.total_amount || 0),
    discount_amount: Number(voucher.discount_amount || 0),
  });

  const { error: delErr } = await client
    .from("voucher_entries")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("id", voucher.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (delErr) throw delErr;

  try {
    const { data: acct } = await client
      .from("settings")
      .select("accounting_engine_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (isAccountingEngineEnabled(acct as { accounting_engine_enabled?: boolean } | null)) {
      await deleteJournalEntryByReference(organizationId, "SupplierPayment", voucher.id, client);
    }
  } catch (glErr) {
    await client
      .from("voucher_entries")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", voucher.id)
      .eq("organization_id", organizationId);
    throw glErr;
  }

  if (voucher.reference_type !== "supplier" || !voucher.reference_id || credit <= 0) return;

  const { data: linkedBill, error: billErr } = await client
    .from("purchase_bills")
    .select("id, paid_amount, net_amount")
    .eq("id", voucher.reference_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (billErr) throw billErr;

  const touched: string[] = [];
  if (linkedBill) {
    const next = purchaseBillPaidAfterVoucherRemoved(linkedBill as BillPaidRow, credit);
    const { error } = await client
      .from("purchase_bills")
      .update(next)
      .eq("id", linkedBill.id)
      .eq("organization_id", organizationId);
    if (error) throw error;
    touched.push(linkedBill.id);
  } else {
    const refs = legacyBillRefsFromDescription(voucher.description);
    if (refs.length > 0) {
      const { data: bills, error } = await client
        .from("purchase_bills")
        .select("id, paid_amount, net_amount, supplier_invoice_no, software_bill_no")
        .eq("organization_id", organizationId)
        .eq("supplier_id", voucher.reference_id)
        .is("deleted_at", null);
      if (error) throw error;
      let remaining = credit;
      for (const bill of (bills || []) as BillPaidRow[]) {
        if (remaining <= 0) break;
        const ref = bill.supplier_invoice_no || bill.software_bill_no || bill.id.slice(0, 8);
        if (!refs.includes(ref)) continue;
        const take = Math.min(remaining, Number(bill.paid_amount || 0));
        if (take <= 0) continue;
        const next = purchaseBillPaidAfterVoucherRemoved(bill, take);
        const { error: upErr } = await client
          .from("purchase_bills")
          .update(next)
          .eq("id", bill.id)
          .eq("organization_id", organizationId);
        if (upErr) throw upErr;
        touched.push(bill.id);
        remaining = round2(remaining - take);
      }
    }
  }

  // Never below what the bill's remaining payment vouchers still settle.
  if (touched.length > 0) {
    await syncPurchaseBillPaymentsFromVouchersBatch(touched, organizationId, client);
  }
}

/** After a Recycle Bin restore: raise the bill's paid amount back to its payment vouchers. */
export async function resyncBillAfterSupplierPaymentRestore(voucherId: string, client: SupabaseClient): Promise<void> {
  const { data: v } = await client
    .from("voucher_entries")
    .select("organization_id, voucher_type, reference_type, reference_id")
    .eq("id", voucherId)
    .maybeSingle();
  if (!v?.reference_id || !v.organization_id) return;
  if (String(v.voucher_type || "").toLowerCase() !== "payment" || v.reference_type !== "supplier") return;
  const { data: bill } = await client
    .from("purchase_bills")
    .select("id")
    .eq("id", v.reference_id)
    .eq("organization_id", v.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bill) return;
  await syncPurchaseBillPaymentsFromVouchersBatch([bill.id], v.organization_id, client);
}
