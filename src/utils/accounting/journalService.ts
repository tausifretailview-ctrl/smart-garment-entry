import { supabase } from "@/integrations/supabase/client";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const getAccountByCode = (accounts: SeededAccount[], code: string) =>
  accounts.find((a) => a.account_code === code);

const findBankLikeAccount = (accounts: SeededAccount[]) => {
  const bankRegex = /(bank|upi|card|settlement|gateway)/i;
  return accounts.find((a) => a.account_type === "Asset" && bankRegex.test(a.account_name));
};

/** Matches `journal_entries.reference_type` CHECK constraint. */
export type JournalReferenceType =
  | "Sale"
  | "Purchase"
  | "Payment"
  | "StudentFeeReceipt"
  | "ExpenseVoucher"
  | "SalaryVoucher"
  | "CustomerReceipt"
  | "SupplierPayment";

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
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  if (!cashInHand) {
    throw new Error("Missing chart account for expense journal (Cash)");
  }

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

  const pm = (paymentMethod || "").toLowerCase().trim();
  const useBankAccount = !["cash", "pay_later", ""].includes(pm);
  const paymentAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

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
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const salaryExpense = getAccountByCode(systemAccounts, "6100");

  if (!cashInHand || !salaryExpense) {
    throw new Error("Missing chart accounts for salary journal (Cash / Salaries & Wages)");
  }

  const pm = (paymentMethod || "").toLowerCase().trim();
  const useBankAccount = !["cash", "pay_later", ""].includes(pm);
  const paymentAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

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
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const discountAccount = getAccountByCode(systemAccounts, "6050");

  if (!cashInHand || !arAccount || !discountAccount) {
    throw new Error("Missing chart accounts for customer receipt (Cash / AR / Settlement Discounts 6050)");
  }

  const pm = (paymentMethod || "").toLowerCase().trim();
  const useBankAccount = !["cash", "pay_later", ""].includes(pm);
  const receiptAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

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
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const apAccount = getAccountByCode(systemAccounts, "2000");

  if (!cashInHand || !apAccount) {
    throw new Error("Missing chart accounts for supplier payment (Cash / Accounts Payable)");
  }

  const pm = (paymentMethod || "").toLowerCase().trim();
  const useBankAccount = !["cash", "pay_later", ""].includes(pm);
  const paymentAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

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
 * Records strict double-entry journal lines for a sale:
 *   CR Sales Revenue = netAmount
 *   DR Cash/Bank = paidAmount
 *   DR Accounts Receivable = balance
 */
export async function recordSaleJournalEntry(
  saleId: string,
  organizationId: string,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string,
  client: any = supabase
) {
  if (!saleId) throw new Error("saleId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  const paid = round2(Math.max(0, Math.min(paidAmount, net)));
  const receivable = round2(Math.max(0, net - paid));

  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const salesRevenue = getAccountByCode(systemAccounts, "4000");

  if (!cashInHand || !arAccount || !salesRevenue) {
    throw new Error("Missing required system accounts for journaling (Cash/AR/Sales Revenue)");
  }

  const useBankAccount = !["cash", "pay_later", ""].includes((paymentMethod || "").toLowerCase().trim());
  const receiptAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

  const lines: PostJournalLineInput[] = [
    { accountId: salesRevenue.id, debitAmount: 0, creditAmount: net },
  ];
  if (paid > 0) {
    lines.push({ accountId: receiptAccount.id, debitAmount: paid, creditAmount: 0 });
  }
  if (receivable > 0) {
    lines.push({ accountId: arAccount.id, debitAmount: receivable, creditAmount: 0 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await postJournalEntry({
    organizationId,
    date: today,
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
 */
export async function recordPurchaseJournalEntry(
  purchaseId: string,
  organizationId: string,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string,
  client: any = supabase
) {
  if (!purchaseId) throw new Error("purchaseId is required");
  if (!organizationId) throw new Error("organizationId is required");

  const net = round2(netAmount);
  const paid = round2(Math.max(0, Math.min(paidAmount, net)));
  const payable = round2(Math.max(0, net - paid));

  if (net <= 0) return null;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const apAccount = getAccountByCode(systemAccounts, "2000");
  const cogsAccount = getAccountByCode(systemAccounts, "5000");

  if (!cashInHand || !apAccount || !cogsAccount) {
    throw new Error("Missing required system accounts for journaling (Cash/AP/COGS)");
  }

  const useBankAccount = !["cash", "pay_later", ""].includes((paymentMethod || "").toLowerCase().trim());
  const paymentAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

  const lines: PostJournalLineInput[] = [
    { accountId: cogsAccount.id, debitAmount: net, creditAmount: 0 },
  ];
  if (paid > 0) {
    lines.push({ accountId: paymentAccount.id, debitAmount: 0, creditAmount: paid });
  }
  if (payable > 0) {
    lines.push({ accountId: apAccount.id, debitAmount: 0, creditAmount: payable });
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await postJournalEntry({
    organizationId,
    date: today,
    referenceType: "Purchase",
    referenceId: purchaseId,
    description: `Auto journal for purchase ${purchaseId}`,
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
  const cashInHand = getAccountByCode(systemAccounts, "1000");
  const feeIncome = getAccountByCode(systemAccounts, "4100") || getAccountByCode(systemAccounts, "4000");

  if (!cashInHand || !feeIncome) {
    throw new Error("Missing chart accounts for fee journal (Cash / School Fee Income)");
  }

  const pm = (paymentMethod || "").toLowerCase().trim();
  const useBankAccount = !["cash", "pay_later", ""].includes(pm);
  const receiptAccount = useBankAccount ? findBankLikeAccount(systemAccounts) || cashInHand : cashInHand;

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
