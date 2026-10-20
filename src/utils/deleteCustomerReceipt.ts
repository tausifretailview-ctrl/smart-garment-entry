import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { deleteJournalEntryByReference } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { reverseCustomerAdvanceFifo } from "@/utils/reverseCustomerAdvanceFifo";
import { derivePaidAndStatus, warnSettlementPathMismatch } from "@/utils/saleSettlement";
import { syncSalePaymentFromVouchers } from "@/utils/customerBalanceUtils";
import {
  collectSaleIdsForReceiptDelete,
  creditNoteSaleForReceiptDelete,
  customerIdForReceiptBalanceRefresh,
  customerReceiptReversedAmount,
  isAdvanceAdjustmentReceipt,
  isCreditNoteAdjustmentReceipt,
  loadSalesTouchedByReceipt,
  type ReceiptForDelete,
} from "@/utils/customerReceiptDeletePlan";

const SETTLEMENT_TOLERANCE_RUPEE = 0.99;

/** Columns a receipt row needs for deleteCustomerReceipt. */
export const CUSTOMER_RECEIPT_DELETE_COLUMNS =
  "id, voucher_number, reference_type, reference_id, description, total_amount, discount_amount, payment_method";

export type CustomerReceiptToDelete = ReceiptForDelete & {
  id: string;
  voucher_number?: string | null;
};

/**
 * Delete one customer receipt voucher and reverse everything it did: journal,
 * credit-note / advance application, and the paid amount of every bill it paid.
 * Used by Customer Payment and the Payment Reconciliation report so both undo a
 * receipt the same way.
 */
export async function deleteCustomerReceipt(
  organizationId: string,
  payment: CustomerReceiptToDelete,
  client: typeof supabase = supabase,
): Promise<{ voucherId: string; paymentAmount: number; voucherNumber: string | null; customerId: string | null }> {
  const voucherId = payment.id;
  const paymentAmount = customerReceiptReversedAmount(payment);
  const isAdvanceApplication = isAdvanceAdjustmentReceipt(payment);
  const isCreditNoteApplication = isCreditNoteAdjustmentReceipt(payment);
  const touchedSales = await loadSalesTouchedByReceipt(client, organizationId, payment);
  const saleIds = collectSaleIdsForReceiptDelete(payment, touchedSales);
  const customerId = customerIdForReceiptBalanceRefresh(payment, touchedSales, saleIds);
  const cnSale = creditNoteSaleForReceiptDelete(payment, touchedSales, saleIds);
  const { data: acctDel } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const engineOn = isAccountingEngineEnabled(
    acctDel as { accounting_engine_enabled?: boolean } | null
  );
  if (engineOn) {
    const journalRef = isAdvanceApplication
      ? "CustomerAdvanceApplication"
      : isCreditNoteApplication
        ? "CustomerCreditNoteApplication"
        : "CustomerReceipt";
    await deleteJournalEntryByReference(organizationId, journalRef, voucherId, client);
  }
  // Written after the voucher is gone: the DB refuses lowering S/R adjust
  // while a credit-note voucher is still live on the bill.
  let cnSaleUpdate: { paid_amount: number; payment_status: string; sale_return_adjust: number } | null = null;
  if (cnSale) {
    const netAmount = Number(cnSale.net_amount || 0);
    const srAdjust = Number(cnSale.sale_return_adjust || 0);
    const dualPaidAndSr = String(payment.description || "").includes("(Return");
    const newSr = Math.max(0, srAdjust - paymentAmount);
    let newPaid = Number(cnSale.paid_amount || 0);
    if (dualPaidAndSr) newPaid = Math.max(0, newPaid - paymentAmount);
    const legacyCnStatus =
      newPaid + newSr >= netAmount - SETTLEMENT_TOLERANCE_RUPEE
        ? "completed"
        : newPaid > 0 || newSr > 0
          ? "partial"
          : "pending";
    const { paymentStatus: newStatus } = derivePaidAndStatus({
      netAmount,
      saleReturnAdjust: newSr,
      cashReceived: newPaid,
      advanceApplied: 0,
      cnApplied: newSr,
      discountGiven: 0,
    });
    warnSettlementPathMismatch(
      "CustomerPaymentTab.deleteReceipt.cn",
      legacyCnStatus,
      newStatus,
    );
    cnSaleUpdate = {
      paid_amount: newPaid,
      payment_status: newStatus,
      sale_return_adjust: newSr,
    };
  }
  await client.from("voucher_items").delete().eq("voucher_id", voucherId);
  const { data: removed, error } = await client
    .from("voucher_entries")
    .delete()
    .eq("id", voucherId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw error;
  if (!removed?.length) throw new Error("Receipt not found");
  if (cnSale && cnSaleUpdate) {
    const { error: saleUpdErr } = await client
      .from("sales")
      .update(cnSaleUpdate)
      .eq("id", cnSale.id)
      .eq("organization_id", organizationId);
    if (saleUpdErr) throw saleUpdErr;
  }
  const salesToResync = isCreditNoteApplication
    ? []
    : saleIds.filter((id) => id !== cnSale?.id);
  if (isAdvanceApplication && customerId) {
    await reverseCustomerAdvanceFifo(
      client,
      organizationId,
      customerId,
      paymentAmount,
    );
  }
  const voucherDateYmd = format(new Date(), "yyyy-MM-dd");
  try {
    for (const saleId of salesToResync) {
      await syncSalePaymentFromVouchers(
        saleId,
        organizationId,
        voucherDateYmd,
        client,
      );
    }
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : String(syncError);
    throw new Error(`Receipt deleted, but the invoice balance was not updated: ${message}`);
  }
  return { voucherId, paymentAmount, voucherNumber: payment.voucher_number ?? null, customerId };
}
