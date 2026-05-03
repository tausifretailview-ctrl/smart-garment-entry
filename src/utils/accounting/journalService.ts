import { supabase } from "@/integrations/supabase/client";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const getAccountByCode = (accounts: SeededAccount[], code: string) =>
  accounts.find((a) => a.account_code === code);

const findBankLikeAccount = (accounts: SeededAccount[]) => {
  const bankRegex = /(bank|upi|card|settlement|gateway)/i;
  return accounts.find((a) => a.account_type === "Asset" && bankRegex.test(a.account_name));
};

/** Cash (1000) for cash/pay_later; else prefer system 1010 Bank, then any bank-like asset name, else cash. */
function resolveCashOrBankLedgerAccount(
  accounts: SeededAccount[],
  paymentMethod: string | null | undefined
): SeededAccount {
  const cashInHand = getAccountByCode(accounts, "1000");
  if (!cashInHand) {
    throw new Error("Missing chart account Cash in Hand (1000)");
  }
  const pm = (paymentMethod || "").toLowerCase().trim();
  if (["cash", "pay_later", ""].includes(pm)) return cashInHand;
  const bank1010 = getAccountByCode(accounts, "1010");
  if (bank1010) return bank1010;
  return findBankLikeAccount(accounts) || cashInHand;
}

/** Matches `journal_entries.reference_type` CHECK constraint. */
export type JournalReferenceType =
  | "Sale"
  | "Purchase"
  | "Payment"
  | "StudentFeeReceipt"
  | "ExpenseVoucher"
  | "SalaryVoucher"
  | "CustomerReceipt"
  | "SupplierPayment"
  | "CustomerAdvanceApplication"
  | "CustomerCreditNoteApplication"
  | "CustomerAdvanceReceipt"
  | "CustomerAdvanceRefund"
  | "SaleReturn"
  | "PurchaseReturn";

export type PostJournalLineInput = {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
};

export type PostJournalEntryInput = {
  organizationId: string;
  date: string;
  referenceType: JournalReferenceType;
  referenceId: string;
  description: string;
  lines: PostJournalLineInput[];
  client?: any;
};

export type PostJournalEntryResult =
  | { status: "created"; journalEntryId: string }
  | { status: "already_exists"; journalEntryId: string };

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === "23505";
}

/**
 * Single entry point for chart postings: balance check, idempotency by (org, reference_type, reference_id),
 * insert header + lines (rolls back header if line insert fails).
 */
export async function postJournalEntry(params: PostJournalEntryInput): Promise<PostJournalEntryResult> {
  const { organizationId, date, referenceType, referenceId, description, lines } = params;
  const client = params.client ?? supabase;

  if (!organizationId) throw new Error("organizationId is required");
  if (!referenceId) throw new Error("referenceId is required");
  if (!lines?.length) throw new Error("Journal must have at least one line");

  const normalized: Array<{ account_id: string; debit_amount: number; credit_amount: number }> = [];
  for (const line of lines) {
    const dr = round2(line.debitAmount);
    const cr = round2(line.creditAmount);
    if (dr < 0 || cr < 0) throw new Error("Journal line amounts cannot be negative");
    if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
      throw new Error("Each journal line must have either debit or credit (not both, not neither)");
    }
    normalized.push({
      account_id: line.accountId,
      debit_amount: dr,
      credit_amount: cr,
    });
  }

  const totalDebit = round2(normalized.reduce((s, l) => s + l.debit_amount, 0));
  const totalCredit = round2(normalized.reduce((s, l) => s + l.credit_amount, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal imbalance: DR ${totalDebit} != CR ${totalCredit}`);
  }
  if (totalDebit <= 0) {
    throw new Error("Journal total must be positive");
  }

  const desc = description.length > 500 ? description.slice(0, 497) + "…" : description;

  const { data: existing } = await client
    .from("journal_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .maybeSingle();

  if (existing?.id) {
    return { status: "already_exists", journalEntryId: existing.id as string };
  }

  const { data: entry, error: entryErr } = await client
    .from("journal_entries")
    .insert({
      organization_id: organizationId,
      date,
      reference_type: referenceType,
      reference_id: referenceId,
      description: desc,
      total_amount: totalDebit,
    })
    .select("id")
    .single();

  if (entryErr) {
    if (isUniqueViolation(entryErr)) {
      const { data: row } = await client
        .from("journal_entries")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("reference_type", referenceType)
        .eq("reference_id", referenceId)
        .single();
      if (row?.id) {
        return { status: "already_exists", journalEntryId: row.id as string };
      }
    }
    throw entryErr;
  }

  const payload = normalized.map((line) => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
  }));

  const { error: lineErr } = await client.from("journal_lines").insert(payload);
  if (lineErr) {
    await client.from("journal_entries").delete().eq("id", entry.id);
    throw lineErr;
  }

  return { status: "created", journalEntryId: entry.id as string };
}

/** Removes a posted journal by business reference (journal_lines cascade). */
export async function deleteJournalEntryByReference(
  organizationId: string,
  referenceType: JournalReferenceType,
  referenceId: string,
  client: any = supabase
): Promise<void> {
  if (!organizationId || !referenceId) return;
  const { error } = await client
    .from("journal_entries")
    .delete()
    .eq("organization_id", organizationId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId);
  if (error) throw error;
}

/**
 * Expense voucher (voucher_entries.id): DR expense ledger (mapped category or 6000), CR Cash/Bank.
 * @param expenseLedgerAccountId Optional chart_of_accounts.id (must be account_type Expense in this org); otherwise 6000 General Expenses.
 */
export async function recordExpenseVoucherJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  amount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase,
  expenseLedgerAccountId?: string | null
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  let expenseAccountId: string;
  if (expenseLedgerAccountId) {
    const { data: mapped, error: mapErr } = await client
      .from("chart_of_accounts")
      .select("id, account_type")
      .eq("id", expenseLedgerAccountId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (mapErr) throw mapErr;
    if (!mapped || mapped.account_type !== "Expense") {
      throw new Error("Mapped ledger account must be an Expense account in this organization");
    }
    expenseAccountId = mapped.id as string;
  } else {
    const expenseAccount = getAccountByCode(systemAccounts, "6000");
    if (!expenseAccount) {
      throw new Error("Missing chart accounts for expense journal (General Expenses 6000)");
    }
    expenseAccountId = expenseAccount.id;
  }

  const lines: PostJournalLineInput[] = [
    { accountId: expenseAccountId, debitAmount: net, creditAmount: 0 },
    { accountId: paymentAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc =
    description.trim() || `Expense voucher ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "ExpenseVoucher",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Salary payment voucher (voucher_entries.id): DR Salaries & Wages, CR Cash/Bank.
 */
export async function recordSalaryVoucherJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  amount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const salaryExpense = getAccountByCode(systemAccounts, "6100");

  if (!salaryExpense) {
    throw new Error("Missing chart accounts for salary journal (Salaries & Wages 6100)");
  }

  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: salaryExpense.id, debitAmount: net, creditAmount: 0 },
    { accountId: paymentAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Salary voucher ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "SalaryVoucher",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Customer receipt (voucher_entries.id): DR Cash/Bank + DR settlement discount (6050) as needed, CR AR.
 * Call only when payment_method is not `advance_adjustment`.
 */
export async function recordCustomerReceiptJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  totalAmount: number,
  discountAmount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const total = round2(totalAmount);
  if (total <= 0) return null;

  const disc = round2(Math.max(0, Math.min(discountAmount, total)));
  const cashPortion = round2(total - disc);
  if (cashPortion < 0) throw new Error("Invalid receipt: discount exceeds total");

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const discountAccount = getAccountByCode(systemAccounts, "6050");

  if (!arAccount || !discountAccount) {
    throw new Error("Missing chart accounts for customer receipt (AR / Settlement Discounts 6050)");
  }

  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [];
  if (cashPortion > 0) {
    lines.push({ accountId: receiptAccount.id, debitAmount: cashPortion, creditAmount: 0 });
  }
  if (disc > 0) {
    lines.push({ accountId: discountAccount.id, debitAmount: disc, creditAmount: 0 });
  }
  lines.push({ accountId: arAccount.id, debitAmount: 0, creditAmount: total });

  const desc = description.trim() || `Customer receipt ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "CustomerReceipt",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Supplier payment (voucher_entries.id): DR Accounts Payable, CR Cash/Bank.
 */
export async function recordSupplierPaymentJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  amount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const apAccount = getAccountByCode(systemAccounts, "2000");

  if (!apAccount) {
    throw new Error("Missing chart accounts for supplier payment (Accounts Payable)");
  }

  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: apAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: paymentAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Supplier payment ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "SupplierPayment",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Advance applied to invoice (`payment_method` advance_adjustment on voucher): DR Customer Advances, CR AR.
 */
export async function recordCustomerAdvanceApplicationJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  amount: number,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const advancesAccount = getAccountByCode(systemAccounts, "2150");
  const arAccount = getAccountByCode(systemAccounts, "1200");

  if (!advancesAccount || !arAccount) {
    throw new Error("Missing chart accounts for advance application (Customer Advances 2150 / AR 1200)");
  }

  const lines: PostJournalLineInput[] = [
    { accountId: advancesAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: arAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Advance application ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "CustomerAdvanceApplication",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Customer advance booking (`customer_advances` row): DR Cash/Bank, CR Customer Advances (2150).
 */
export async function recordCustomerAdvanceReceiptJournalEntry(
  customerAdvanceId: string,
  organizationId: string,
  amount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!customerAdvanceId) throw new Error("customerAdvanceId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const advancesAccount = getAccountByCode(systemAccounts, "2150");

  if (!advancesAccount) {
    throw new Error("Missing chart accounts for advance receipt (Customer Advances 2150)");
  }

  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: receiptAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: advancesAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Advance receipt ${customerAdvanceId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "CustomerAdvanceReceipt",
    referenceId: customerAdvanceId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Customer advance refund paid (`advance_refunds` row): DR Customer Advances (2150), CR Cash/Bank.
 */
export async function recordCustomerAdvanceRefundJournalEntry(
  advanceRefundId: string,
  organizationId: string,
  amount: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!advanceRefundId) throw new Error("advanceRefundId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const advancesAccount = getAccountByCode(systemAccounts, "2150");

  if (!advancesAccount) {
    throw new Error("Missing chart accounts for advance refund (Customer Advances 2150)");
  }

  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: advancesAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: paymentAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Advance refund ${advanceRefundId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "CustomerAdvanceRefund",
    referenceId: advanceRefundId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Credit note applied to reduce invoice/customer balance (`payment_method` credit_note_adjustment): DR Sales Returns, CR AR.
 */
export async function recordCustomerCreditNoteApplicationJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  amount: number,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(amount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const returnsAccount = getAccountByCode(systemAccounts, "4050");
  const arAccount = getAccountByCode(systemAccounts, "1200");

  if (!returnsAccount || !arAccount) {
    throw new Error("Missing chart accounts for credit note application (Sales Returns 4050 / AR 1200)");
  }

  const lines: PostJournalLineInput[] = [
    { accountId: returnsAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: arAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Credit note application ${voucherEntryId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "CustomerCreditNoteApplication",
    referenceId: voucherEntryId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * After recycle-bin restore of `voucher_entries`, repost the chart journal using the same rules as original saves.
 * No-op when accounting is explicitly off or voucher shape has no GL mapping (e.g. customer refund payment without journal).
 */
export async function repostJournalForRestoredVoucher(voucherId: string, client: any = supabase): Promise<void> {
  if (!voucherId) return;

  const { data: v, error: fetchErr } = await client
    .from("voucher_entries")
    .select(
      "id, organization_id, voucher_type, reference_type, payment_method, total_amount, discount_amount, description, category, voucher_date"
    )
    .eq("id", voucherId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!v?.organization_id) return;

  const { data: settings } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", v.organization_id)
    .maybeSingle();

  if (!isAccountingEngineEnabled(settings as { accounting_engine_enabled?: boolean } | null)) return;

  const vt = String(v.voucher_type || "").toLowerCase();
  const rt = String(v.reference_type || "").toLowerCase();
  const pm = String(v.payment_method || "").toLowerCase();
  const amt = Number(v.total_amount || 0);
  const disc = Number(v.discount_amount || 0);
  const desc = String(v.description || "");
  const vDate =
    v.voucher_date != null ? String(v.voucher_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const orgId = v.organization_id as string;

  if (vt === "expense" || rt === "expense") {
    let ledgerId: string | null | undefined;
    if (v.category) {
      const { data: ec } = await client
        .from("expense_categories")
        .select("ledger_account_id")
        .eq("organization_id", orgId)
        .eq("name", v.category)
        .maybeSingle();
      ledgerId = ec?.ledger_account_id ?? null;
    }
    await recordExpenseVoucherJournalEntry(
      voucherId,
      orgId,
      amt,
      pm || "cash",
      vDate,
      desc || String(v.category || "Expense"),
      client,
      ledgerId ?? null
    );
    return;
  }

  if (vt === "payment" && rt === "employee") {
    await recordSalaryVoucherJournalEntry(voucherId, orgId, amt, pm || "cash", vDate, desc, client);
    return;
  }

  if (vt === "payment" && rt === "supplier") {
    await recordSupplierPaymentJournalEntry(voucherId, orgId, amt, pm || "cash", vDate, desc, client);
    return;
  }

  if (vt === "receipt" && rt === "student_fee") {
    await recordSchoolFeeReceiptJournalEntry(voucherId, orgId, amt, pm || "cash", vDate, desc, client);
    return;
  }

  if (vt === "receipt" && (rt === "customer" || rt === "sale")) {
    if (pm === "advance_adjustment") {
      await recordCustomerAdvanceApplicationJournalEntry(voucherId, orgId, amt, vDate, desc, client);
      return;
    }
    if (pm === "credit_note_adjustment") {
      await recordCustomerCreditNoteApplicationJournalEntry(voucherId, orgId, amt, vDate, desc, client);
      return;
    }
    await recordCustomerReceiptJournalEntry(voucherId, orgId, amt, disc, pm || "cash", vDate, desc, client);
    return;
  }

  console.warn(
    "[repostJournalForRestoredVoucher] No GL rule for restored voucher",
    voucherId,
    v.voucher_type,
    v.reference_type,
    v.payment_method
  );
}

/**
 * Records strict double-entry journal lines for a sale:
 *   CR Sales Revenue = netAmount
 *   DR Cash/Bank = paidAmount
 *   DR Accounts Receivable = balance
 * @param entryDate Optional `YYYY-MM-DD` for the journal header (defaults to today).
 */
export async function recordSaleJournalEntry(
  saleId: string,
  organizationId: string,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string,
  client: any = supabase,
  entryDate?: string
) {
  if (!saleId) throw new Error("saleId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  const paid = round2(Math.max(0, Math.min(paidAmount, net)));
  const receivable = round2(Math.max(0, net - paid));

  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const salesRevenue = getAccountByCode(systemAccounts, "4000");

  if (!arAccount || !salesRevenue) {
    throw new Error("Missing required system accounts for journaling (AR/Sales Revenue)");
  }

  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: salesRevenue.id, debitAmount: 0, creditAmount: net },
  ];
  if (paid > 0) {
    lines.push({ accountId: receiptAccount.id, debitAmount: paid, creditAmount: 0 });
  }
  if (receivable > 0) {
    lines.push({ accountId: arAccount.id, debitAmount: receivable, creditAmount: 0 });
  }

  const journalDate =
    entryDate && /^\d{4}-\d{2}-\d{2}/.test(entryDate)
      ? entryDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const result = await postJournalEntry({
    organizationId,
    date: journalDate,
    referenceType: "Sale",
    referenceId: saleId,
    description: `Auto journal for sale ${saleId}`,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Records strict double-entry journal lines for a purchase bill:
 *   DR Cost of Goods Sold = netAmount
 *   CR Cash/Bank = paidAmount
 *   CR Accounts Payable = balance
 * @param entryDate Optional `YYYY-MM-DD` for the journal header (defaults to today).
 */
export async function recordPurchaseJournalEntry(
  purchaseId: string,
  organizationId: string,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string,
  client: any = supabase,
  entryDate?: string
) {
  if (!purchaseId) throw new Error("purchaseId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  const paid = round2(Math.max(0, Math.min(paidAmount, net)));
  const payable = round2(Math.max(0, net - paid));

  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const apAccount = getAccountByCode(systemAccounts, "2000");
  const cogsAccount = getAccountByCode(systemAccounts, "5000");

  if (!apAccount || !cogsAccount) {
    throw new Error("Missing required system accounts for journaling (AP/COGS)");
  }

  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: cogsAccount.id, debitAmount: net, creditAmount: 0 },
  ];
  if (paid > 0) {
    lines.push({ accountId: paymentAccount.id, debitAmount: 0, creditAmount: paid });
  }
  if (payable > 0) {
    lines.push({ accountId: apAccount.id, debitAmount: 0, creditAmount: payable });
  }

  const journalDate =
    entryDate && /^\d{4}-\d{2}-\d{2}/.test(entryDate)
      ? entryDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const result = await postJournalEntry({
    organizationId,
    date: journalDate,
    referenceType: "Purchase",
    referenceId: purchaseId,
    description: `Auto journal for purchase ${purchaseId}`,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Sale return (`sale_returns.id`): DR Sales Returns (4050); CR Cash for cash refund or AR for credit note.
 * Exchange-only returns skip posting (inventory / invoice linkage handled elsewhere).
 */
export async function recordSaleReturnJournalEntry(
  saleReturnId: string,
  organizationId: string,
  netAmount: number,
  refundType: string,
  returnDate: string,
  description: string,
  client: any = supabase
) {
  if (!saleReturnId) throw new Error("saleReturnId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  if (net <= 0) return null;

  const rt = (refundType || "").toLowerCase().trim();
  if (rt === "exchange") return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const returnsAccount = getAccountByCode(systemAccounts, "4050");
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const arAccount = getAccountByCode(systemAccounts, "1200");

  if (!returnsAccount || !cashInHand || !arAccount) {
    throw new Error("Missing chart accounts for sale return journal (Sales Returns / Cash / AR)");
  }

  const creditAccount =
    rt === "cash_refund" ? cashInHand : arAccount;

  const lines: PostJournalLineInput[] = [
    { accountId: returnsAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: creditAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Sale return ${saleReturnId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: returnDate,
    referenceType: "SaleReturn",
    referenceId: saleReturnId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Purchase return (`purchase_returns.id`): DR Accounts Payable, CR COGS (reversal of purchase expense).
 */
export async function recordPurchaseReturnJournalEntry(
  purchaseReturnId: string,
  organizationId: string,
  netAmount: number,
  returnDate: string,
  description: string,
  client: any = supabase
) {
  if (!purchaseReturnId) throw new Error("purchaseReturnId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const apAccount = getAccountByCode(systemAccounts, "2000");
  const cogsAccount = getAccountByCode(systemAccounts, "5000");

  if (!apAccount || !cogsAccount) {
    throw new Error("Missing chart accounts for purchase return journal (AP / COGS)");
  }

  const lines: PostJournalLineInput[] = [
    { accountId: apAccount.id, debitAmount: net, creditAmount: 0 },
    { accountId: cogsAccount.id, debitAmount: 0, creditAmount: net },
  ];

  const desc = description.trim() || `Purchase return ${purchaseReturnId.slice(0, 8)}`;
  const result = await postJournalEntry({
    organizationId,
    date: returnDate,
    referenceType: "PurchaseReturn",
    referenceId: purchaseReturnId,
    description: desc,
    lines,
    client,
  });
  return result.journalEntryId;
}

/**
 * Cash-basis school fee receipt: DR Cash/Bank, CR School Fee Income (4100 or 4000).
 * `reference_id` = voucher_entries.id for reversal via delete_fee_receipt.
 */
export async function recordSchoolFeeReceiptJournalEntry(
  voucherEntryId: string,
  organizationId: string,
  grandTotal: number,
  paymentMethod: string,
  entryDate: string,
  description: string,
  client: any = supabase
) {
  if (!voucherEntryId) throw new Error("voucherEntryId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(grandTotal);
  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const feeIncome = getAccountByCode(systemAccounts, "4100") || getAccountByCode(systemAccounts, "4000");

  if (!feeIncome) {
    throw new Error("Missing chart accounts for fee journal (School Fee Income)");
  }

  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, paymentMethod);

  const lines: PostJournalLineInput[] = [
    { accountId: feeIncome.id, debitAmount: 0, creditAmount: net },
    { accountId: receiptAccount.id, debitAmount: net, creditAmount: 0 },
  ];

  const result = await postJournalEntry({
    organizationId,
    date: entryDate,
    referenceType: "StudentFeeReceipt",
    referenceId: voucherEntryId,
    description,
    lines,
    client,
  });
  return result.journalEntryId;
}
