import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";

/**
 * Student fee statement — credit/debit lines (mirrors customer_ledger_entries pattern).
 */

export type StudentLedgerVoucherType = "FEE_RECEIPT";

interface StudentLedgerEntryInput {
  organizationId: string;
  studentId: string;
  voucherType: StudentLedgerVoucherType;
  voucherNo: string;
  particulars: string;
  transactionDate: string;
  amount: number;
}

async function insertStudentEntry(input: StudentLedgerEntryInput, side: "debit" | "credit"): Promise<void> {
  if (!input.studentId || !input.organizationId) return;
  const amt = Number(input.amount) || 0;
  if (amt === 0) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("student_ledger_entries").insert({
      organization_id: input.organizationId,
      student_id: input.studentId,
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
        operation: "studentLedger.insert",
        organizationId: input.organizationId,
        additionalContext: { ...input, side },
      },
      err
    );
  }
}

export const insertStudentLedgerCredit = (input: StudentLedgerEntryInput) =>
  insertStudentEntry(input, "credit");

export const insertStudentLedgerDebit = (input: StudentLedgerEntryInput) =>
  insertStudentEntry(input, "debit");
