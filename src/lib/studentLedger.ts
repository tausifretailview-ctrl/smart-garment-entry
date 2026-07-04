import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

async function insertStudentEntry(
  input: StudentLedgerEntryInput,
  side: "debit" | "credit",
  client: SupabaseClient = supabase,
): Promise<void> {
  if (!input.studentId || !input.organizationId) return;
  const amt = Number(input.amount) || 0;
  if (amt === 0) return;

  const {
    data: { user },
  } = await client.auth.getUser();

  const { error } = await (client as SupabaseClient).from("student_ledger_entries").insert({
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
}

export const insertStudentLedgerCredit = (
  input: StudentLedgerEntryInput,
  client?: SupabaseClient,
) => insertStudentEntry(input, "credit", client);

export const insertStudentLedgerDebit = (
  input: StudentLedgerEntryInput,
  client?: SupabaseClient,
) => insertStudentEntry(input, "debit", client);
