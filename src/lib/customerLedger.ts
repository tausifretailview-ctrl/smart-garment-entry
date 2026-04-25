import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";

/**
 * Customer Account Statement — double-entry ledger helpers.
 *
 * Writes to public.customer_ledger_entries. Used ONLY by the new
 * "Customer Account Statement" report. The existing Customer Ledger
 * report (CustomerLedger.tsx / useCustomerBalance) is unaffected.
 *
 * All operations are fire-and-forget: failures are logged to
 * app_error_logs but never thrown — they must not block the primary save.
 */

export type LedgerVoucherType = "OPENING" | "SALE" | "RECEIPT" | "SALE_RETURN";

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