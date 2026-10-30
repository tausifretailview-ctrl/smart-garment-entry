import { supabase } from "@/integrations/supabase/client";
import { calculateGlAccountLedger } from "@/utils/accountingReportUtils";
import { deleteJournalEntryByReference, postJournalEntry } from "@/utils/accounting/journalService";
import { seedDefaultAccounts } from "@/utils/accounting/seedDefaultAccounts";
import { formatBankAccountLabel } from "@/utils/organizationBankAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const BANK_STATEMENT_OPENING = "_opening";

/** One line of the Bank Statement (GL 1010 Bank, Dr = money in, Cr = money out). */
export type BankStatementRow = {
  key: string;
  date: string;
  createdAt: string | null;
  journalEntryId: string | null;
  referenceType: string;
  referenceId: string | null;
  description: string;
  docNumber: string | null;
  paymentMethod: string | null;
  partyName: string | null;
  bankAccountId: string | null;
  debit: number;
  credit: number;
  balance: number;
  isOpening: boolean;
};

export type BankStatementResult = {
  rows: BankStatementRow[];
  /** false before the bank statement SQL is run: every bank is shown together. */
  splitByBank: boolean;
};

export type BankStatementSummary = {
  opening: number;
  totalIn: number;
  totalOut: number;
  closing: number;
};

export type BankDirectionFilter = "all" | "in" | "out";

function isMissingFunction(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "PGRST202" ||
    e?.code === "42883" ||
    /get_bank_account_statement/i.test(e?.message || "")
  );
}

/** Sale journals are described "Auto journal for sale <uuid>" — show the bill number instead. */
export function cleanBankStatementDescription(
  description: string | null | undefined,
  docNumber: string | null | undefined,
): string {
  const raw = String(description || "").trim();
  if (/^auto journal for sale\b/i.test(raw)) return docNumber ? `Sale ${docNumber}` : "Sale";
  // Tally v2 posters write "Sale 1a2b3c4d" (first 8 of the id) — show the bill number instead.
  const shortId = raw.match(/^(sale|purchase|sale return|purchase return) [0-9a-f]{8}$/i);
  if (shortId && docNumber) return `${shortId[1][0].toUpperCase()}${shortId[1].slice(1)} ${docNumber}`;
  return raw;
}

function mapRpcRow(r: Record<string, unknown>): BankStatementRow {
  const referenceType = String(r.reference_type ?? "");
  const docNumber = r.doc_number != null ? String(r.doc_number) : null;
  return {
    key: `${r.line_seq ?? ""}-${r.journal_entry_id ?? "open"}`,
    date: String(r.entry_date ?? "").slice(0, 10),
    createdAt: r.created_at != null ? String(r.created_at) : null,
    journalEntryId: r.journal_entry_id != null ? String(r.journal_entry_id) : null,
    referenceType,
    referenceId: r.reference_id != null ? String(r.reference_id) : null,
    description: cleanBankStatementDescription(r.description as string | null, docNumber),
    docNumber,
    paymentMethod: r.payment_method != null ? String(r.payment_method) : null,
    partyName: r.party_name != null ? String(r.party_name) : null,
    bankAccountId: r.bank_account_id != null ? String(r.bank_account_id) : null,
    debit: round2(Number(r.debit_amount ?? 0)),
    credit: round2(Number(r.credit_amount ?? 0)),
    balance: round2(Number(r.running_balance ?? 0)),
    isOpening: referenceType === BANK_STATEMENT_OPENING,
  };
}

/** Old path: whole 1010 Bank ledger (all banks together) when the per-bank RPC is not there yet. */
async function fetchCombinedBankLedger(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<BankStatementRow[]> {
  const { data: bank, error } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("account_code", "1010")
    .maybeSingle();
  if (error) throw error;
  if (!bank?.id) return [];

  const lines = await calculateGlAccountLedger(organizationId, bank.id, fromDate, toDate, null);
  const rows: BankStatementRow[] = lines.map((line) => {
    const isOpening = line.referenceType === BANK_STATEMENT_OPENING;
    return {
      key: `${line.lineSeq}-${line.journalLineId ?? "open"}`,
      date: line.entryDate,
      createdAt: line.createdAt,
      journalEntryId: line.journalEntryId,
      referenceType: line.referenceType,
      referenceId: line.referenceId,
      description: isOpening
        ? "Opening balance"
        : cleanBankStatementDescription(line.description, null),
      docNumber: null,
      paymentMethod: null,
      partyName: line.partyNameSnapshot,
      bankAccountId: null,
      debit: round2(line.debitAmount),
      credit: round2(line.creditAmount),
      balance: round2(line.runningBalance),
      isOpening,
    };
  });
  if (!rows[0]?.isOpening) {
    rows.unshift({
      key: "opening",
      date: fromDate,
      createdAt: null,
      journalEntryId: null,
      referenceType: BANK_STATEMENT_OPENING,
      referenceId: null,
      description: "Opening balance",
      docNumber: null,
      paymentMethod: null,
      partyName: null,
      bankAccountId: null,
      debit: 0,
      credit: 0,
      balance: 0,
      isOpening: true,
    });
  }
  return rows;
}

/**
 * Bank Statement for one organization bank account (or all when bankAccountId is null).
 * UPI / card / cheque / transfer sales and receipts land in the default bank unless the
 * voucher picked another receiving bank; cash deposits carry their own bank.
 */
export async function fetchBankStatement(
  organizationId: string,
  bankAccountId: string | null,
  fromDate: string,
  toDate: string,
): Promise<BankStatementResult> {
  const { data, error } = await (supabase as any).rpc("get_bank_account_statement", {
    p_org_id: organizationId,
    p_bank_account_id: bankAccountId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) {
    if (!isMissingFunction(error)) throw error;
    return { rows: await fetchCombinedBankLedger(organizationId, fromDate, toDate), splitByBank: false };
  }
  return {
    rows: ((data ?? []) as Record<string, unknown>[]).map(mapRpcRow),
    splitByBank: true,
  };
}

export function summarizeBankStatement(rows: BankStatementRow[]): BankStatementSummary {
  const opening = rows.find((r) => r.isOpening)?.balance ?? 0;
  let totalIn = 0;
  let totalOut = 0;
  for (const row of rows) {
    if (row.isOpening) continue;
    totalIn += row.debit;
    totalOut += row.credit;
  }
  totalIn = round2(totalIn);
  totalOut = round2(totalOut);
  return { opening: round2(opening), totalIn, totalOut, closing: round2(opening + totalIn - totalOut) };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  bank: "Bank",
  online: "Online",
  multiple: "Mix",
  cash: "Cash",
  finance: "Finance",
};

export function bankPaymentMethodLabel(paymentMethod: string | null | undefined): string {
  const pm = String(paymentMethod || "").toLowerCase().trim();
  if (!pm) return "";
  return PAYMENT_METHOD_LABELS[pm] ?? pm.replace(/_/g, " ");
}

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  Sale: "Sale",
  SaleReturn: "Sale return",
  Purchase: "Purchase",
  PurchaseReturn: "Purchase return",
  CustomerReceipt: "Customer receipt",
  CustomerAdvanceReceipt: "Advance received",
  CustomerAdvanceRefund: "Advance refund",
  SupplierPayment: "Supplier payment",
  ExpenseVoucher: "Expense",
  SalaryVoucher: "Salary",
  ThirdPartyVoucher: "Third-party",
  Contra: "Contra",
  ManualJournal: "Journal",
  StudentFeeReceipt: "Fee receipt",
  PartyOpening: "Opening balance",
  StockAdjustment: "Stock adjustment",
  BalanceAdjustment: "Balance adjustment",
};

export function bankReferenceTypeLabel(referenceType: string | null | undefined, debit = 0): string {
  const rt = String(referenceType || "");
  if (rt === "Contra") return debit > 0 ? "Cash deposit" : "Cash withdrawal";
  return REFERENCE_TYPE_LABELS[rt] ?? rt;
}

export function filterBankStatementRows(
  rows: BankStatementRow[],
  search: string,
  direction: BankDirectionFilter,
): BankStatementRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.isOpening) return !q && direction === "all";
    if (direction === "in" && row.debit <= 0) return false;
    if (direction === "out" && row.credit <= 0) return false;
    if (!q) return true;
    return [
      row.description,
      row.docNumber,
      row.partyName,
      bankPaymentMethodLabel(row.paymentMethod),
      bankReferenceTypeLabel(row.referenceType, row.debit),
    ].some((v) => String(v || "").toLowerCase().includes(q));
  });
}

export type CashBankTransferKind = "deposit" | "withdrawal";

/**
 * Contra between Cash in Hand (1000) and Bank (1010), tagged with the organization bank account.
 * Deposit: DR Bank, CR Cash. Withdrawal: DR Cash, CR Bank.
 */
export async function postCashBankTransfer(params: {
  organizationId: string;
  bankAccountId: string | null;
  bankLabel: string;
  kind: CashBankTransferKind;
  date: string;
  amount: number;
  note?: string;
}) {
  const amount = round2(params.amount);
  if (!(amount > 0)) throw new Error("Enter an amount above zero");
  const accounts = await seedDefaultAccounts(params.organizationId, supabase);
  const cash = accounts.find((a) => a.account_code === "1000");
  const bank = accounts.find((a) => a.account_code === "1010");
  if (!cash || !bank) throw new Error("Cash in Hand (1000) or Bank (1010) ledger is missing");

  const isDeposit = params.kind === "deposit";
  const base = isDeposit
    ? `Cash deposit to ${params.bankLabel}`
    : `Cash withdrawal from ${params.bankLabel}`;
  const note = params.note?.trim();

  return postJournalEntry({
    organizationId: params.organizationId,
    date: params.date,
    referenceType: "Contra",
    referenceId: crypto.randomUUID(),
    description: note ? `${base} — ${note}` : base,
    bankAccountId: params.bankAccountId,
    lines: isDeposit
      ? [
          { accountId: bank.id, debitAmount: amount, creditAmount: 0 },
          { accountId: cash.id, debitAmount: 0, creditAmount: amount },
        ]
      : [
          { accountId: cash.id, debitAmount: amount, creditAmount: 0 },
          { accountId: bank.id, debitAmount: 0, creditAmount: amount },
        ],
    client: supabase,
  });
}

export async function deleteCashBankTransfer(organizationId: string, referenceId: string) {
  await deleteJournalEntryByReference(organizationId, "Contra", referenceId, supabase);
}

/**
 * Daily Tally "Deposit to bank" → a Contra (DR Bank, CR Cash) in the default bank, keyed by the
 * tally snapshot id so re-saving the tally replaces it and a zero deposit removes it.
 */
export async function syncDailyTallyBankDeposit(params: {
  organizationId: string;
  snapshotId: string;
  tallyDate: string;
  amount: number;
}) {
  const amount = round2(params.amount);
  await deleteJournalEntryByReference(params.organizationId, "Contra", params.snapshotId, supabase);
  if (!(amount > 0)) return;

  const { data: banks, error } = await supabase
    .from("organization_bank_accounts")
    .select("id, bank_name, account_number, is_default, created_at")
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const bank = banks?.[0] ?? null;

  const accounts = await seedDefaultAccounts(params.organizationId, supabase);
  const cash = accounts.find((a) => a.account_code === "1000");
  const bankLedger = accounts.find((a) => a.account_code === "1010");
  if (!cash || !bankLedger) throw new Error("Cash in Hand (1000) or Bank (1010) ledger is missing");

  const [y, m, d] = params.tallyDate.split("-");
  const bankLabel = bank ? formatBankAccountLabel(bank) : "bank";
  await postJournalEntry({
    organizationId: params.organizationId,
    date: params.tallyDate,
    referenceType: "Contra",
    referenceId: params.snapshotId,
    description: `Cash deposit to ${bankLabel} — Daily Tally ${d}/${m}/${y}`,
    bankAccountId: bank?.id ?? null,
    lines: [
      { accountId: bankLedger.id, debitAmount: amount, creditAmount: 0 },
      { accountId: cash.id, debitAmount: 0, creditAmount: amount },
    ],
    client: supabase,
  });
}
