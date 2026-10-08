import type { SupabaseClient } from "@supabase/supabase-js";
import { saleBillFigures } from "@/utils/saleBillFigures";
import { isCreditNoteAdjustmentReceipt } from "@/utils/customerReceiptDeletePlan";
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
  appendRoundOffBalancingLine,
  balanceJournalWithRoundOff,
  pushLine,
  type PartyLineContext,
} from "@/utils/accounting/journalLineUtils";
import {
  computeSaleRevenueBreakdown,
  counterTenderInSaleJournal,
  isOnOrAfterReturnCreditCutover,
} from "@/utils/accounting/saleJournalMath";
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

/** Line-level discount already embedded in line_total (do not also post full header discount_amount). */
function sumLineDiscountFromSaleItems(
  items: Array<{ unit_price?: number | null; quantity?: number | null; line_total?: number | null }>
): number {
  return round2(
    items.reduce((sum, item) => {
      const base = round2(Number(item.unit_price ?? 0) * Number(item.quantity ?? 0));
      const lineTotal = round2(Number(item.line_total ?? 0));
      return sum + round2(Math.max(0, base - lineTotal));
    }, 0)
  );
}

/**
 * Money already settled against this sale by vouchers that carry their own journal
 * (customer receipts, advance applications), read as the Receivable credit of those journals
 * while they are live. An advance spread over several vouchers posts one journal on the last
 * one, so the journal lines are the reliable figure, not the voucher amounts.
 * Credit-note adjustment vouchers are returned separately: the return already credited the
 * customer, so the sale journal must not book them as cash either.
 */
async function fetchSaleSettledOutsideJournal(
  saleId: string,
  organizationId: string,
  arAccountId: string,
  client: SupabaseClient<Database>
): Promise<{ journaledReceiptTotal: number; creditNoteVoucherTotal: number }> {
  const { data: vouchers, error } = await client
    .from("voucher_entries")
    .select("id, total_amount, discount_amount, payment_method")
    .eq("organization_id", organizationId)
    .eq("reference_id", saleId)
    .eq("voucher_type", "receipt")
    .is("deleted_at", null);
  if (error) throw error;
  const rows = (vouchers ?? []) as Array<{
    id: string;
    total_amount: number | null;
    discount_amount: number | null;
    payment_method: string | null;
  }>;
  const isCn = (v: (typeof rows)[number]) => isCreditNoteAdjustmentReceipt(v);

  const creditNoteVoucherTotal = round2(
    rows.filter(isCn).reduce((s, v) => s + Number(v.total_amount ?? 0) + Number(v.discount_amount ?? 0), 0)
  );
  const moneyVoucherIds = rows.filter((v) => !isCn(v)).map((v) => v.id);
  if (moneyVoucherIds.length === 0) return { journaledReceiptTotal: 0, creditNoteVoucherTotal };

  const { data: journals, error: jErr } = await client
    .from("journal_entries")
    .select("id, reversed_journal_id")
    .eq("organization_id", organizationId)
    .in("reference_type", ["CustomerReceipt", "CustomerAdvanceApplication"])
    .in("reference_id", moneyVoucherIds);
  if (jErr) throw jErr;
  const entries = (journals ?? []) as Array<{ id: string; reversed_journal_id: string | null }>;
  const reversedIds = new Set(entries.map((j) => j.reversed_journal_id).filter(Boolean) as string[]);
  const liveJournalIds = entries.filter((j) => !j.reversed_journal_id && !reversedIds.has(j.id)).map((j) => j.id);
  if (liveJournalIds.length === 0) return { journaledReceiptTotal: 0, creditNoteVoucherTotal };

  const { data: lines, error: lErr } = await client
    .from("journal_lines")
    .select("credit_amount, debit_amount")
    .in("journal_entry_id", liveJournalIds)
    .eq("account_id", arAccountId);
  if (lErr) throw lErr;
  const journaledReceiptTotal = round2(
    ((lines ?? []) as Array<{ credit_amount: number | null; debit_amount: number | null }>).reduce(
      (s, l) => s + Number(l.credit_amount ?? 0) - Number(l.debit_amount ?? 0),
      0
    )
  );
  return { journaledReceiptTotal: Math.max(0, journaledReceiptTotal), creditNoteVoucherTotal };
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
      "id, net_amount, paid_amount, payment_method, sale_date, gross_amount, discount_amount, flat_discount_amount, other_charges, points_redeemed_amount, round_off, customer_id, customer_name, sale_return_adjust, credit_applied, tax_type, sale_type, created_at"
    )
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (saleErr) throw saleErr;
  if (!sale) throw new Error(`Sale not found: ${saleId}`);

  const net = round2(Number(sale.net_amount ?? 0));
  const bill = saleBillFigures(sale);
  if (net <= 0) return null;

  const { data: items, error: itemsErr } = await client
    .from("sale_items")
    .select("line_total, gst_percent, unit_price, quantity")
    .eq("sale_id", saleId)
    .is("deleted_at", null);
  if (itemsErr) throw itemsErr;

  // Empty sale_items is rare. `sales` has no gst_amount column (unlike sale_returns),
  // so we cannot mirror the return fallback's Number(sr.gst_amount). Exclusive
  // gross_amount may include GST — use net as the base so GST is not booked as
  // Sales Revenue. Inclusive keeps header gross (pre-existing behaviour).
  const taxType = String((sale as { tax_type?: string | null }).tax_type || "inclusive").toLowerCase();
  const headerGross = Number(sale.gross_amount ?? net);
  const emptyItemsGstBase = taxType === "exclusive" ? net : headerGross;
  const hasItems = Boolean(items && items.length > 0);
  // With items, revenue is booked before the flat discount and the discount's taxable
  // value is debited to Trade Discount; GST is on the discounted value.
  const revenue = hasItems
    ? computeSaleRevenueBreakdown(items ?? [], {
        taxType,
        saleType: (sale as { sale_type?: string | null }).sale_type,
        flatDiscount: Number(sale.flat_discount_amount ?? 0),
      })
    : null;
  const gst = revenue ? revenue.gst : breakdownFromGrossAndGst(emptyItemsGstBase, 0);

  const systemAccounts = await seedDefaultAccounts(organizationId, client);
  const salesRevenue = getAccountByCode(systemAccounts, "4000");
  const arAccount = getAccountByCode(systemAccounts, "1200");
  const stock = getAccountByCode(systemAccounts, "1300");
  const cogs = getAccountByCode(systemAccounts, "5000");
  const tradeDiscount = getAccountByCode(systemAccounts, "4010");
  if (!salesRevenue || !arAccount || !stock || !cogs) {
    throw new Error("Missing Tally v2 chart accounts (4000/1200/1300/5000)");
  }

  // Cash/bank on the bill is only the counter tender. paid_amount also carries later receipts
  // and credit notes, which post (or were posted) by their own journals; using it in full on
  // a re-post would book that money twice.
  const counterPaid = counterTenderInSaleJournal({
    paidAmount: Number(sale.paid_amount ?? 0),
    ...(await fetchSaleSettledOutsideJournal(saleId, organizationId, arAccount.id, client)),
    saleReturnAdjust: bill.saleReturnAdjust,
  });
  const paid = round2(Math.min(counterPaid, bill.payable));
  const receivable = round2(Math.max(0, bill.payable - paid));

  const party = customerParty(sale);
  const lines: PostJournalLineInput[] = [];
  const receiptAccount = resolveCashOrBankLedgerAccount(systemAccounts, sale.payment_method);

  if (paid > 0) pushLine(lines, receiptAccount.id, paid, 0, party);
  if (receivable > 0) pushLine(lines, arAccount.id, receivable, 0, party);

  // S/R adjust settles part of this bill with return credit. The return's own journal
  // debited Sales Returns and credited the customer (Receivable), so the bill consumes that
  // credit: DR Receivable. Bills created before the cutover keep DR Sales Returns, because
  // old exchange returns never posted a journal of their own.
  const saleReturnAdjust = round2(Number((sale as any).sale_return_adjust ?? 0));
  if (saleReturnAdjust > 0.01) {
    const srAccount = isOnOrAfterReturnCreditCutover((sale as { created_at?: string | null }).created_at)
      ? arAccount
      : getAccountByCode(systemAccounts, "4050");
    if (srAccount) pushLine(lines, srAccount.id, saleReturnAdjust, 0, party);
  }

  // Customer advance applied to this sale: DR Customer Advances liability.
  const creditApplied = round2(Number((sale as any).credit_applied ?? 0));
  if (creditApplied > 0.01) {
    const customerAdvances = getAccountByCode(systemAccounts, "2150");
    if (customerAdvances) pushLine(lines, customerAdvances.id, creditApplied, 0, party);
  }

  const revenueCredit = round2(Math.max(0, revenue ? revenue.grossTaxable : gst.taxableAmount));
  if (revenueCredit > 0) pushLine(lines, salesRevenue.id, 0, revenueCredit, party);
  appendOutputGstCredits(lines, systemAccounts, gst, party);

  const otherCharges = round2(Number(sale.other_charges ?? 0));
  if (otherCharges > 0.01) {
    pushLine(lines, salesRevenue.id, 0, otherCharges, party);
  }

  const lineDiscountInLines = sumLineDiscountFromSaleItems(items ?? []);
  const headerDiscount = round2(Number(sale.discount_amount ?? 0));
  const orphanHeaderDiscount = round2(Math.max(0, headerDiscount - lineDiscountInLines));
  const flatDiscountDr = revenue ? revenue.flatDiscountTaxable : Number(sale.flat_discount_amount ?? 0);
  const tradeDiscountDr = round2(
    flatDiscountDr + Number(sale.points_redeemed_amount ?? 0) + orphanHeaderDiscount
  );
  if (tradeDiscountDr > 0.01 && tradeDiscount) {
    pushLine(lines, tradeDiscount.id, tradeDiscountDr, 0, party);
  }

  const cogsAmount = await fetchSaleCogsAmount(saleId, client);
  if (cogsAmount > 0) {
    pushLine(lines, cogs.id, cogsAmount, 0);
    pushLine(lines, stock.id, 0, cogsAmount);
  }

  const saleRoundOff = round2(Number(sale.round_off ?? 0));
  if (Math.abs(saleRoundOff) >= 0.01) {
    appendRoundOffBalancingLine(lines, systemAccounts, saleRoundOff);
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

  const billRoundOff = round2(Number(bill.round_off ?? 0));
  if (Math.abs(billRoundOff) >= 0.01) {
    appendRoundOffBalancingLine(lines, systemAccounts, billRoundOff);
  }
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
      "id, net_amount, refund_type, return_date, payment_method, gross_amount, gst_amount, customer_id, customer_name, created_at"
    )
    .eq("id", saleReturnId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (srErr) throw srErr;
  if (!sr) throw new Error(`Sale return not found: ${saleReturnId}`);

  const net = round2(Number(sr.net_amount ?? 0));
  if (net <= 0) return null;
  const rt = (sr.refund_type || "").toLowerCase().trim();
  // Exchange returns credit the customer like a credit note; the new bill's S/R adjust then
  // consumes that credit (see buildSaleJournalV2). Older exchange returns posted nothing and
  // their bill debited Sales Returns instead, so they stay without a journal.
  const isExchange = rt === "exchange";
  if (isExchange && !isOnOrAfterReturnCreditCutover((sr as { created_at?: string | null }).created_at)) {
    return null;
  }

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
  const stock = getAccountByCode(systemAccounts, "1300");
  const cogs = getAccountByCode(systemAccounts, "5000");
  if (!returnsAccount || !stock || !cogs) {
    throw new Error("Missing chart accounts for sale return (4050/1300/5000)");
  }

  const party = customerParty(sr);
  const effectivePm = isExchange
    ? null
    : paymentMethod != null && String(paymentMethod).trim() !== ""
      ? paymentMethod
      : sr.payment_method != null && String(sr.payment_method).trim() !== ""
        ? sr.payment_method
        : rt === "cash_refund"
          ? "cash"
          : null;
  const creditAccount = resolveReturnSettlementAccount(systemAccounts, effectivePm, "credit_customer");

  const lines: PostJournalLineInput[] = [];
  const taxableReverse = round2(Math.max(0, gst.taxableAmount));
  if (taxableReverse > 0) {
    pushLine(lines, returnsAccount.id, taxableReverse, 0, party);
  }
  appendOutputGstDebits(lines, systemAccounts, gst, party);
  const coveredByReturnsAndGst = round2(taxableReverse + gst.totalGst);
  const returnsRemainder = round2(Math.max(0, net - coveredByReturnsAndGst));
  if (returnsRemainder > 0.01) {
    pushLine(lines, returnsAccount.id, returnsRemainder, 0, party);
  }
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
