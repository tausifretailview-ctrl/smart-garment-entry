import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PostJournalLineInput } from "@/utils/accounting/accountingTypes";
import type { JournalReferenceType } from "@/utils/accounting/accountingTypes";
import {
  aggregateInclusiveLines,
  breakdownFromGrossAndGst,
  breakdownPurchaseHeaderGst,
} from "@/utils/accounting/gstBreakdown";
import {
  appendInputGstCredits,
  appendInputGstDebits,
  appendOutputGstCredits,
  appendOutputGstDebits,
  balanceJournalWithRoundOff,
  pushLine,
  type PartyLineContext,
} from "@/utils/accounting/journalLineUtils";
import {
  fetchPurchaseReturnStockAmount,
  fetchSaleCogsAmount,
  fetchSaleReturnCogsAmount,
} from "@/utils/accounting/saleCogs";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type BuiltJournal = {
  lines: PostJournalLineInput[];
  date: string;
  description: string;
  referenceType: JournalReferenceType;
  referenceId: string;
};

const getAccountByCode = (accounts: SeededAccount[], code: string) =>
  accounts.find((a) => a.account_code === code);

function resolveCashOrBankLedgerAccount(
  accounts: SeededAccount[],
  paymentMethod: string | null | undefined
): SeededAccount {
  const cashInHand = getAccountByCode(accounts, "1000");
  if (!cashInHand) throw new Error("Missing chart account Cash in Hand (1000)");
  const pm = (paymentMethod || "").toLowerCase().trim();
  if (["cash", "pay_later", ""].includes(pm)) return cashInHand;
  const bank1010 = getAccountByCode(accounts, "1010");
  if (bank1010) return bank1010;
  const bankRegex = /(bank|upi|card|settlement|gateway)/i;
  const found = accounts.find((a) => a.account_type === "Asset" && bankRegex.test(a.account_name));
  return found || cashInHand;
}

function resolveReturnSettlementAccount(
  accounts: SeededAccount[],
  paymentMethod: string | null | undefined,
  side: "credit_customer" | "debit_supplier"
): SeededAccount {
  const cash = getAccountByCode(accounts, "1000");
  if (!cash) throw new Error("Missing chart account Cash in Hand (1000)");
  const pmRaw = (paymentMethod || "").toLowerCase().trim();
  const pm = pmRaw === "cash_refund" ? "cash" : pmRaw;
  if (pm === "cash") return cash;
  const bankElectronic =
    ["upi", "card", "bank_transfer", "cheque", "other", "bank"].includes(pm) || pm.includes("bank");
  if (bankElectronic) {
    const bank1010 = getAccountByCode(accounts, "1010");
    if (bank1010) return bank1010;
    const found = accounts.find(
      (a) => a.account_type === "Asset" && /(bank|upi|card|settlement|gateway)/i.test(a.account_name)
    );
    return found || cash;
  }
  if (side === "credit_customer") {
    const ar = getAccountByCode(accounts, "1200");
    if (!ar) throw new Error("Missing chart account Accounts Receivable (1200)");
    return ar;
  }
  const ap = getAccountByCode(accounts, "2000");
  if (!ap) throw new Error("Missing chart account Accounts Payable (2000)");
  return ap;
}

function customerParty(row: {
  customer_id?: string | null;
  customer_name?: string | null;
}): PartyLineContext | undefined {
  if (!row.customer_id) return undefined;
  return {
    partyType: "customer",
    partyId: row.customer_id,
    partyNameSnapshot: row.customer_name ?? undefined,
  };
}

function supplierParty(row: {
  supplier_id?: string | null;
  supplier_name?: string | null;
}): PartyLineContext | undefined {
  if (!row.supplier_id) return undefined;
  return {
    partyType: "supplier",
    partyId: row.supplier_id,
    partyNameSnapshot: row.supplier_name ?? undefined,
  };
}

function resolveEntryDate(rowDate: string | null | undefined, entryDate?: string): string {
  if (entryDate && /^\d{4}-\d{2}-\d{2}/.test(entryDate)) return entryDate.slice(0, 10);
  if (rowDate != null) return String(rowDate).slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export async function buildSaleJournalV2(
  saleId: string,
  organizationId: string,
  client: SupabaseClient<Database>,
  entryDate?: string
): Promise<BuiltJournal | null> {
  const { data: sale, error: saleErr } = await client
    .from("sales")
    .select(
      "id, net_amount, paid_amount, payment_method, sale_date, gross_amount, discount_amount, round_off, customer_id, customer_name"
    )
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (saleErr) throw saleErr;
  if (!sale) throw new Error(`Sale not found: ${saleId}`);

  const net = round2(Number(sale.net_amount ?? 0));
  const paid = round2(Math.max(0, Math.min(Number(sale.paid_amount ?? 0), net)));
  const receivable = round2(Math.max(0, net - paid));
  if (net <= 0) return null;

  const { data: items, error: itemsErr } = await client
    .from("sale_items")
    .select("line_total, gst_percent")
    .eq("sale_id", saleId)
    .is("deleted_at", null);
  if (itemsErr) throw itemsErr;

  const gst =
    items && items.length > 0
      ? aggregateInclusiveLines(items)
      : breakdownFromGrossAndGst(Number(sale.gross_amount ?? net), 0);

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const salesRevenue = getAccountByCode(systemAccounts, "4000");
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const stock = getAccountByCode(systemAccounts, "1300");
  const cogs = getAccountByCode(systemAccounts, "5000");
  const tradeDiscount = getAccountByCode(systemAccounts, "4010");
  if (!salesRevenue || !arAccount || !stock || !cogs) {
    throw new Error("Missing Tally v2 chart accounts (4000/1200/1300/5000)");
  }

  const party = customerParty(sale);
  const lines: PostJournalLineInput[] = [];
  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, sale.payment_method);

  if (paid > 0) pushLine(lines, receiptAccount.id, paid, 0, party);
  if (receivable > 0) pushLine(lines, arAccount.id, receivable, 0, party);

  const revenueCredit = round2(Math.max(0, gst.taxableAmount));
  if (revenueCredit > 0) pushLine(lines, salesRevenue.id, 0, revenueCredit, party);
  appendOutputGstCredits(lines, systemAccounts, gst, party);

  const headerDiscount = round2(Number(sale.discount_amount ?? 0));
  if (headerDiscount > 0.01 && tradeDiscount) {
    pushLine(lines, tradeDiscount.id, headerDiscount, 0, party);
  }

  const cogsAmount = await fetchSaleCogsAmount(saleId, client);
  if (cogsAmount > 0) {
    pushLine(lines, cogs.id, cogsAmount, 0);
    pushLine(lines, stock.id, 0, cogsAmount);
  }

  balanceJournalWithRoundOff(lines, systemAccounts);

  return {
    lines,
    date: resolveEntryDate(sale.sale_date, entryDate),
    description: `Sale ${saleId.slice(0, 8)}`,
    referenceType: "Sale",
    referenceId: saleId,
  };
}

export async function buildPurchaseJournalV2(
  purchaseId: string,
  organizationId: string,
  client: SupabaseClient<Database>,
  entryDate?: string,
  paymentMethodOverride?: string | null
): Promise<BuiltJournal | null> {
  const { data: bill, error: billErr } = await client
    .from("purchase_bills")
    .select(
      "id, net_amount, paid_amount, bill_date, gross_amount, discount_amount, gst_amount, other_charges, round_off, supplier_id, supplier_name"
    )
    .eq("id", purchaseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (billErr) throw billErr;
  if (!bill) throw new Error(`Purchase bill not found: ${purchaseId}`);

  const net = round2(Number(bill.net_amount ?? 0));
  const paid = round2(Math.max(0, Math.min(Number(bill.paid_amount ?? 0), net)));
  const payable = round2(Math.max(0, net - paid));
  if (net <= 0) return null;

  const inventoryDebit = round2(
    Math.max(0, Number(bill.gross_amount ?? 0) - Number(bill.discount_amount ?? 0) + Number(bill.other_charges ?? 0))
  );
  const gst = breakdownPurchaseHeaderGst(Number(bill.gst_amount ?? 0));

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const stock = getAccountByCode(systemAccounts, "1300");
  const apAccount = getAccountByCode(systemAccounts, "2000");
  if (!stock || !apAccount) throw new Error("Missing Tally v2 chart accounts (1300/2000)");

  const party = supplierParty(bill);
  const pm =
    paymentMethodOverride != null && String(paymentMethodOverride).trim() !== ""
      ? paymentMethodOverride
      : paid > 0
        ? "cash"
        : "pay_later";
  const paymentAccount = resolveCashOrBankLedgerAccount(systemAccounts, pm);

  const lines: PostJournalLineInput[] = [];
  if (inventoryDebit > 0) pushLine(lines, stock.id, inventoryDebit, 0, party);
  appendInputGstDebits(lines, systemAccounts, gst, party);
  if (paid > 0) pushLine(lines, paymentAccount.id, 0, paid, party);
  if (payable > 0) pushLine(lines, apAccount.id, 0, payable, party);

  balanceJournalWithRoundOff(lines, systemAccounts);

  return {
    lines,
    date: resolveEntryDate(bill.bill_date, entryDate),
    description: `Purchase ${purchaseId.slice(0, 8)}`,
    referenceType: "Purchase",
    referenceId: purchaseId,
  };
}

export async function buildSaleReturnJournalV2(
  saleReturnId: string,
  organizationId: string,
  client: SupabaseClient<Database>,
  paymentMethod?: string | null
): Promise<BuiltJournal | null> {
  const { data: sr, error: srErr } = await client
    .from("sale_returns")
    .select(
      "id, net_amount, refund_type, return_date, payment_method, gross_amount, gst_amount, customer_id, customer_name"
    )
    .eq("id", saleReturnId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (srErr) throw srErr;
  if (!sr) throw new Error(`Sale return not found: ${saleReturnId}`);

  const net = round2(Number(sr.net_amount ?? 0));
  if (net <= 0) return null;
  const rt = (sr.refund_type || "").toLowerCase().trim();
  if (rt === "exchange") return null;

  const { data: items } = await client
    .from("sale_return_items")
    .select("line_total, gst_percent")
    .eq("return_id", saleReturnId)
    .is("deleted_at", null);

  const gst =
    items && items.length > 0
      ? aggregateInclusiveLines(items)
      : breakdownFromGrossAndGst(Number(sr.gross_amount ?? net), Number(sr.gst_amount ?? 0));

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const returnsAccount = getAccountByCode(systemAccounts, "4050");
  const salesRevenue = getAccountByCode(systemAccounts, "4000");
  const stock = getAccountByCode(systemAccounts, "1300");
  const cogs = getAccountByCode(systemAccounts, "5000");
  if (!returnsAccount || !salesRevenue || !stock || !cogs) {
    throw new Error("Missing chart accounts for sale return (4050/4000/1300/5000)");
  }

  const party = customerParty(sr);
  const effectivePm =
    paymentMethod != null && String(paymentMethod).trim() !== ""
      ? paymentMethod
      : sr.payment_method != null && String(sr.payment_method).trim() !== ""
        ? sr.payment_method
        : rt === "cash_refund"
          ? "cash"
          : null;
  const creditAccount = resolveReturnSettlementAccount(systemAccounts, effectivePm, "credit_customer");

  const lines: PostJournalLineInput[] = [];
  const revenueReverse = round2(Math.max(0, gst.taxableAmount));
  if (revenueReverse > 0) {
    pushLine(lines, salesRevenue.id, revenueReverse, 0, party);
    pushLine(lines, returnsAccount.id, 0, revenueReverse, party);
  }
  appendOutputGstDebits(lines, systemAccounts, gst, party);
  pushLine(lines, creditAccount.id, 0, net, party);

  const cogsAmount = await fetchSaleReturnCogsAmount(saleReturnId, client);
  if (cogsAmount > 0) {
    pushLine(lines, stock.id, cogsAmount, 0);
    pushLine(lines, cogs.id, 0, cogsAmount);
  }

  balanceJournalWithRoundOff(lines, systemAccounts);

  return {
    lines,
    date: resolveEntryDate(sr.return_date),
    description: `Sale return ${saleReturnId.slice(0, 8)}`,
    referenceType: "SaleReturn",
    referenceId: saleReturnId,
  };
}

export async function buildPurchaseReturnJournalV2(
  purchaseReturnId: string,
  organizationId: string,
  client: SupabaseClient<Database>,
  paymentMethod?: string | null
): Promise<BuiltJournal | null> {
  const { data: pr, error: prErr } = await client
    .from("purchase_returns")
    .select(
      "id, net_amount, return_date, payment_method, gross_amount, gst_amount, discount_amount, supplier_id, supplier_name"
    )
    .eq("id", purchaseReturnId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (prErr) throw prErr;
  if (!pr) throw new Error(`Purchase return not found: ${purchaseReturnId}`);

  const net = round2(Number(pr.net_amount ?? 0));
  if (net <= 0) return null;

  const gst = breakdownPurchaseHeaderGst(Number(pr.gst_amount ?? 0));
  const stockAmount = await fetchPurchaseReturnStockAmount(purchaseReturnId, client);
  const inventoryFromHeader = round2(
    Math.max(0, Number(pr.gross_amount ?? 0) - Number(pr.discount_amount ?? 0))
  );
  const inventoryCredit = inventoryFromHeader > 0 ? inventoryFromHeader : stockAmount;

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const purchaseReturns = getAccountByCode(systemAccounts, "5050");
  const stock = getAccountByCode(systemAccounts, "1300");
  if (!purchaseReturns || !stock) throw new Error("Missing chart accounts (5050/1300)");

  const party = supplierParty(pr);
  const debitAccount = resolveReturnSettlementAccount(
    systemAccounts,
    paymentMethod ?? pr.payment_method ?? null,
    "debit_supplier"
  );

  const lines: PostJournalLineInput[] = [];
  pushLine(lines, debitAccount.id, net, 0, party);
  if (inventoryCredit > 0) pushLine(lines, stock.id, 0, inventoryCredit, party);
  appendInputGstCredits(lines, systemAccounts, gst, party);
  const remainder = round2(Math.max(0, net - inventoryCredit - gst.totalGst));
  if (remainder > 0.01) pushLine(lines, purchaseReturns.id, 0, remainder, party);

  balanceJournalWithRoundOff(lines, systemAccounts);

  return {
    lines,
    date: resolveEntryDate(pr.return_date),
    description: `Purchase return ${purchaseReturnId.slice(0, 8)}`,
    referenceType: "PurchaseReturn",
    referenceId: purchaseReturnId,
  };
}

export function isTallyV2PostingEnabled(accounts: SeededAccount[]): boolean {
  return !!getAccountByCode(accounts, "1300");
}
