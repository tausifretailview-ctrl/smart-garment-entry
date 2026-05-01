import { supabase } from "@/integrations/supabase/client";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const getAccountByCode = (accounts: SeededAccount[], code: string) =>
  accounts.find((a) => a.account_code === code);

const findBankLikeAccount = (accounts: SeededAccount[]) => {
  const bankRegex = /(bank|upi|card|settlement|gateway)/i;
  return accounts.find((a) => a.account_type === "Asset" && bankRegex.test(a.account_name));
};

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

  const lines: Array<{ account_id: string; debit_amount: number; credit_amount: number }> = [];

  // Credit Sales Revenue for full value
  lines.push({
    account_id: salesRevenue.id,
    debit_amount: 0,
    credit_amount: net,
  });

  // Debit Cash/Bank for collected amount
  if (paid > 0) {
    lines.push({
      account_id: receiptAccount.id,
      debit_amount: paid,
      credit_amount: 0,
    });
  }

  // Debit AR for unpaid balance
  if (receivable > 0) {
    lines.push({
      account_id: arAccount.id,
      debit_amount: receivable,
      credit_amount: 0,
    });
  }

  const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit_amount, 0));
  const totalCredit = round2(lines.reduce((sum, l) => sum + l.credit_amount, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal imbalance for sale ${saleId}: DR ${totalDebit} != CR ${totalCredit}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: entry, error: entryErr } = await (client as any)
    .from("journal_entries")
    .insert({
      organization_id: organizationId,
      date: today,
      reference_type: "Sale",
      reference_id: saleId,
      description: `Auto journal for sale ${saleId}`,
      total_amount: net,
    })
    .select("id")
    .single();

  if (entryErr) throw entryErr;

  const payload = lines.map((line) => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
  }));

  const { error: lineErr } = await (client as any).from("journal_lines").insert(payload);
  if (lineErr) throw lineErr;

  return entry.id as string;
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

  const lines: Array<{ account_id: string; debit_amount: number; credit_amount: number }> = [];

  // Debit COGS for full bill value
  lines.push({
    account_id: cogsAccount.id,
    debit_amount: net,
    credit_amount: 0,
  });

  // Credit Cash/Bank for paid amount
  if (paid > 0) {
    lines.push({
      account_id: paymentAccount.id,
      debit_amount: 0,
      credit_amount: paid,
    });
  }

  // Credit AP for unpaid amount
  if (payable > 0) {
    lines.push({
      account_id: apAccount.id,
      debit_amount: 0,
      credit_amount: payable,
    });
  }

  const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit_amount, 0));
  const totalCredit = round2(lines.reduce((sum, l) => sum + l.credit_amount, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal imbalance for purchase ${purchaseId}: DR ${totalDebit} != CR ${totalCredit}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: entry, error: entryErr } = await (client as any)
    .from("journal_entries")
    .insert({
      organization_id: organizationId,
      date: today,
      reference_type: "Purchase",
      reference_id: purchaseId,
      description: `Auto journal for purchase ${purchaseId}`,
      total_amount: net,
    })
    .select("id")
    .single();

  if (entryErr) throw entryErr;

  const payload = lines.map((line) => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
  }));

  const { error: lineErr } = await (client as any).from("journal_lines").insert(payload);
  if (lineErr) throw lineErr;

  return entry.id as string;
}

