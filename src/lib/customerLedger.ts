import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";
import { saleRestoreLedgerAmounts } from "@/utils/saleRestoreNumber";

/**
 * Customer Account Statement helpers.
 *
 * New SALE / RECEIPT / SALE_RETURN / customer PAYMENT rows are written by
 * database triggers on sales, voucher_entries, and sale_returns (same
 * transaction as the primary write). These client helpers remain for
 * delete-on-cancel and any leftover callers; insert is fire-and-forget
 * and must not be used as the primary write path.
 */

export type LedgerVoucherType =
  | "OPENING"
  | "SALE"
  | "RECEIPT"
  | "SALE_RETURN"
  | "PAYMENT";

interface LedgerEntryInput {
  organizationId: string;
  customerId: string;
  voucherType: LedgerVoucherType;
  voucherNo: string;
  particulars: string;
  transactionDate: string; // yyyy-mm-dd
  amount: number;
}

async function insertEntry(
  input: LedgerEntryInput,
  side: "debit" | "credit"
): Promise<void> {
  if (!input.customerId || !input.organizationId) return;
  const amt = Number(input.amount) || 0;
  if (amt === 0) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("customer_ledger_entries").insert({
      organization_id: input.organizationId,
      customer_id: input.customerId,
      voucher_type: input.voucherType,
      voucher_no: input.voucherNo,
      particulars: input.particulars,
      transaction_date: input.transactionDate,
      debit: side === "debit" ? amt : 0,
      credit: side === "credit" ? amt : 0,
      created_by: user?.id ?? null,
    });
    if (error) throw error;
  } catch (err) {
    logError(
      {
        operation: "customerLedger.insert",
        organizationId: input.organizationId,
        additionalContext: { ...input, side },
      },
      err
    );
  }
}

export const insertLedgerDebit = (input: LedgerEntryInput) => insertEntry(input, "debit");
export const insertLedgerCredit = (input: LedgerEntryInput) => insertEntry(input, "credit");

/**
 * Recycle-bin restore only clears sales.deleted_at. The ledger trigger skips
 * that UPDATE, and POS delete already removed SALE/RECEIPT statement rows.
 * Rebuild those rows when they are missing. Does not write paid_amount.
 */
export async function ensureCustomerLedgerAfterSaleRestore(sale: {
  organization_id?: string | null;
  customer_id?: string | null;
  sale_number?: string | null;
  sale_date?: string | null;
  net_amount?: number | null;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
  refund_amount?: number | null;
}): Promise<boolean> {
  const organizationId = sale.organization_id;
  const customerId = sale.customer_id;
  const voucherNo = String(sale.sale_number || "").trim();
  if (!organizationId || !customerId || !voucherNo) return false;

  const { data: existing, error } = await (supabase as any)
    .from("customer_ledger_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("voucher_no", voucherNo)
    .in("voucher_type", ["SALE", "RECEIPT"])
    .limit(1);
  if (error) {
    logError(
      { operation: "customerLedger.ensureAfterRestore", organizationId },
      error,
    );
    return false;
  }
  if (existing?.length) return false;

  const { saleDebit, receiptCredit } = saleRestoreLedgerAmounts(sale);
  const transactionDate = sale.sale_date
    ? String(sale.sale_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  await insertLedgerDebit({
    organizationId,
    customerId,
    voucherType: "SALE",
    voucherNo,
    particulars: `Sales Invoice ${voucherNo}`,
    transactionDate,
    amount: saleDebit,
  });
  if (receiptCredit > 0) {
    await insertLedgerCredit({
      organizationId,
      customerId,
      voucherType: "RECEIPT",
      voucherNo,
      particulars: `Payment at Sale ${voucherNo}`,
      transactionDate,
      amount: receiptCredit,
    });
  }
  return true;
}

/**
 * Delete prior ledger rows for a given voucher (used on edit/cancel/delete).
 */
export async function deleteLedgerEntries(params: {
  organizationId: string;
  voucherNo: string;
  voucherTypes?: LedgerVoucherType[];
}): Promise<void> {
  if (!params.organizationId || !params.voucherNo) return;
  try {
    let q = (supabase as any)
      .from("customer_ledger_entries")
      .delete()
      .eq("organization_id", params.organizationId)
      .eq("voucher_no", params.voucherNo);
    if (params.voucherTypes && params.voucherTypes.length) {
      q = q.in("voucher_type", params.voucherTypes);
    }
    const { error } = await q;
    if (error) throw error;
  } catch (err) {
    logError(
      {
        operation: "customerLedger.delete",
        organizationId: params.organizationId,
        additionalContext: params,
      },
      err
    );
  }
}