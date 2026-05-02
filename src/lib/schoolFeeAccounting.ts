import type { SupabaseClient } from "@supabase/supabase-js";
import { insertStudentLedgerCredit } from "@/lib/studentLedger";
import { recordSchoolFeeReceiptJournalEntry } from "@/utils/accounting/journalService";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isFeeHeadUuid(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id);
}

export type FeeReceiptAccountingLine = {
  head_name: string;
  paying: number;
  fee_head_id: string | null;
};

function mapPaymentMethod(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (s === "upi") return "upi";
  if (s === "card") return "card";
  if (s === "bank transfer") return "bank_transfer";
  return "cash";
}

async function getOrCreateCashLedger(client: any, organizationId: string): Promise<string> {
  const { data: found } = await client
    .from("account_ledgers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("account_type", "asset")
    .ilike("account_name", "%cash%")
    .limit(1)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: created, error } = await client
    .from("account_ledgers")
    .insert({
      organization_id: organizationId,
      account_name: "Cash in Hand",
      account_type: "asset",
      opening_balance: 0,
      current_balance: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created!.id as string;
}

async function getOrCreateDefaultFeeIncomeLedger(client: any, organizationId: string): Promise<string> {
  const { data: found } = await client
    .from("account_ledgers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("account_type", "income")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: created, error } = await client
    .from("account_ledgers")
    .insert({
      organization_id: organizationId,
      account_name: "School Fee Income",
      account_type: "income",
      opening_balance: 0,
      current_balance: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created!.id as string;
}

async function getReceiptDebitAccountId(
  client: any,
  organizationId: string,
  mappedMethod: string
): Promise<string> {
  if (mappedMethod === "cash") {
    const { data } = await client
      .from("account_ledgers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("account_type", "asset")
      .ilike("account_name", "%cash%")
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
    return getOrCreateCashLedger(client, organizationId);
  }

  for (const pattern of ["%bank%", "%upi%", "%card%", "%settlement%"] as const) {
    const { data: row } = await client
      .from("account_ledgers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("account_type", "asset")
      .ilike("account_name", pattern)
      .limit(1)
      .maybeSingle();
    if (row?.id) return row.id as string;
  }

  return getOrCreateCashLedger(client, organizationId);
}

/**
 * Inserts voucher header (with id), balanced voucher_items (Dr cash/bank, Cr income per fee head / default),
 * and student_ledger_entries credits (one per line). Matches delete_fee_receipt reversal.
 */
export async function postSchoolFeeReceiptAccounting(
  client: SupabaseClient,
  params: {
    organizationId: string;
    studentId: string;
    studentName: string;
    admissionNumber: string;
    receiptNumber: string;
    voucherDate: string;
    paymentMethodRaw: string;
    grandTotal: number;
    lines: FeeReceiptAccountingLine[];
    transactionId?: string | null;
    /** When true (org Settings → accounting engine), posts chart_of_accounts journal (Phase 2). */
    postChartJournal?: boolean;
  }
): Promise<{ voucherId: string }> {
  const {
    organizationId,
    studentId,
    studentName,
    admissionNumber,
    receiptNumber,
    voucherDate,
    paymentMethodRaw,
    lines,
  } = params;
  const grandTotal = round2(params.grandTotal);
  if (grandTotal <= 0) throw new Error("grandTotal must be positive");

  const mappedMethod = mapPaymentMethod(paymentMethodRaw);
  const feeHeadNames = lines.map((l) => l.head_name).join(", ");
  const descTxn = params.transactionId ? ` | Txn: ${params.transactionId}` : "";
  const description = `Fee Collection - ${studentName} (${admissionNumber}) | ${feeHeadNames} | ${paymentMethodRaw}${descTxn}`;

  const { data: voucher, error: vErr } = await client
    .from("voucher_entries")
    .insert({
      organization_id: organizationId,
      voucher_type: "receipt",
      voucher_number: receiptNumber,
      voucher_date: voucherDate,
      total_amount: grandTotal,
      description,
      reference_type: "student_fee",
      reference_id: studentId,
      payment_method: mappedMethod,
    })
    .select("id")
    .single();

  if (vErr || !voucher?.id) throw vErr || new Error("Voucher insert failed");

  const voucherId = voucher.id as string;

  const feeHeadIds = [...new Set(lines.map((l) => l.fee_head_id).filter(isFeeHeadUuid))];
  const incomeByHeadId = new Map<string, string | null>();
  if (feeHeadIds.length > 0) {
    const { data: heads, error: hErr } = await client
      .from("fee_heads")
      .select("id, income_account_id")
      .eq("organization_id", organizationId)
      .in("id", feeHeadIds);
    if (hErr) throw hErr;
    (heads || []).forEach((h: any) => {
      incomeByHeadId.set(h.id as string, (h.income_account_id as string | null) ?? null);
    });
  }

  const defaultIncomeId = await getOrCreateDefaultFeeIncomeLedger(client as any, organizationId);
  const debitAccountId = await getReceiptDebitAccountId(client as any, organizationId, mappedMethod);

  const creditTotals = new Map<string, number>();
  for (const line of lines) {
    const pay = round2(line.paying);
    if (pay <= 0) continue;
    let incomeId = defaultIncomeId;
    if (isFeeHeadUuid(line.fee_head_id)) {
      const mapped = incomeByHeadId.get(line.fee_head_id);
      if (mapped) incomeId = mapped;
    }
    creditTotals.set(incomeId, round2((creditTotals.get(incomeId) || 0) + pay));
  }

  const sumCredits = round2([...creditTotals.values()].reduce((a, b) => a + b, 0));
  if (Math.abs(sumCredits - grandTotal) > 0.02) {
    throw new Error(`Fee receipt lines (${sumCredits}) do not match total (${grandTotal})`);
  }

  const voucherItems: Array<{
    voucher_id: string;
    account_id: string;
    debit_amount: number;
    credit_amount: number;
    description: string | null;
  }> = [
    {
      voucher_id: voucherId,
      account_id: debitAccountId,
      debit_amount: grandTotal,
      credit_amount: 0,
      description: `Fee receipt ${receiptNumber} — ${mappedMethod}`,
    },
  ];

  for (const [accountId, cr] of creditTotals) {
    if (cr <= 0) continue;
    voucherItems.push({
      voucher_id: voucherId,
      account_id: accountId,
      debit_amount: 0,
      credit_amount: round2(cr),
      description: `Fee income — ${receiptNumber}`,
    });
  }

  const { error: viErr } = await client.from("voucher_items").insert(voucherItems);
  if (viErr) {
    await client.from("voucher_entries").delete().eq("id", voucherId);
    throw viErr;
  }

  if (params.postChartJournal) {
    try {
      await recordSchoolFeeReceiptJournalEntry(
        voucherId,
        organizationId,
        grandTotal,
        paymentMethodRaw,
        voucherDate,
        description,
        client as any
      );
    } catch (jErr) {
      await client.from("voucher_items").delete().eq("voucher_id", voucherId);
      await client.from("voucher_entries").delete().eq("id", voucherId);
      throw jErr;
    }
  }

  for (const line of lines) {
    const pay = round2(line.paying);
    if (pay <= 0) continue;
    insertStudentLedgerCredit({
      organizationId,
      studentId,
      voucherType: "FEE_RECEIPT",
      voucherNo: receiptNumber,
      particulars: `${line.head_name} — receipt`,
      transactionDate: voucherDate,
      amount: pay,
    });
  }

  return { voucherId };
}
