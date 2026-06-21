import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { fetchCustomerAuditBundle, salePaidAtSaleTender } from "@/utils/customerAuditBundle";
import { computeCustomerBalanceCore, getCustomerAccountState, warnCustomerBalanceMismatch } from "@/utils/customerBalanceCore";
import { fetchCustomerFinancialSnapshotMap } from "@/utils/customerFinancialSnapshot";
import { CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES } from "@/utils/paymentVoucherFilters";

/**
 * Shared customer receivable math — matches Customer Ledger / useCustomerBalance.
 * Handles sale_return_adjust on invoices, credit-note vs cash voucher splits,
 * sale_returns rows (linked adjusted vs adjusted_outstanding), advances, and refunds.
 */

export interface CustomerBalanceResult {
  balance: number;
  /** Net billings after invoice-level return/CN adjustments (gross net_amount − sale_return_adjust). */
  totalSales: number;
  totalPaid: number;
}

export type VoucherLedgerRow = {
  reference_id: string | null;
  reference_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
  description?: string | null;
};

/** Cash + settlement discount on a receipt voucher (matches SQL reconcile_customer_balance). */
export function voucherReceiptSettlementAmount(v: VoucherLedgerRow): number {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

export type SaleReturnLedgerRow = {
  net_amount: number | null;
  credit_status: string | null;
  linked_sale_id: string | null;
};

export interface CustomerOutstandingParams {
  openingBalance: number;
  customerId: string;
  sales: Array<{
    id: string;
    net_amount: number | null;
    paid_amount?: number | null;
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
    sale_return_adjust?: number | null;
  }>;
  vouchers: VoucherLedgerRow[];
  adjustmentTotal: number;
  advances: Array<{ id: string; amount: number | null; used_amount: number | null }>;
  advanceRefundTotal: number;
  saleReturns: SaleReturnLedgerRow[];
  refundsPaidTotal: number;
}

export interface CustomerOutstandingResult extends CustomerBalanceResult {
  totalSalesGross: number;
  totalSaleReturnAdjustOnSales: number;
  unusedAdvanceTotal: number;
  adjustmentTotal: number;
  saleReturnTotal: number;
  totalCashPaid: number;
  totalAdvanceApplied: number;
  totalCnApplied: number;
}

const normalizeStatus = (status: unknown) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isAdjustedOutstanding = (status: unknown) => normalizeStatus(status) === "adjusted_outstanding";

function isAdvVoucher(v: VoucherLedgerRow): boolean {
  const desc = (v.description || "").toLowerCase();
  return (
    v.payment_method === "advance_adjustment" ||
    desc.includes("adjusted from advance balance") ||
    desc.includes("advance adjusted")
  );
}

function isCnVoucher(v: VoucherLedgerRow): boolean {
  const desc = (v.description || "").toLowerCase();
  return (
    v.payment_method === "credit_note_adjustment" ||
    desc.includes("credit note adjusted") ||
    desc.includes("cn adjusted")
  );
}

/** Pre-refactor ledger math (sale_returns status rules, per-sale paid_amount). */
function computeCustomerOutstandingLegacy(p: CustomerOutstandingParams): CustomerOutstandingResult {
  const saleIds = p.sales.map((s) => s.id);
  const saleIdSet = new Set(saleIds);

  const invoiceVoucherPayments: Record<string, number> = {};
  const invoiceAdvPortions: Record<string, number> = {};
  const invoiceCnPortions: Record<string, number> = {};
  let openingBalanceVoucherPayments = 0;

  p.vouchers.forEach((v) => {
    if (!v.reference_id) return;
    const isAdv = isAdvVoucher(v);
    const isCn = isCnVoucher(v);

    if (saleIdSet.has(v.reference_id)) {
      if (isAdv) {
        invoiceAdvPortions[v.reference_id] =
          (invoiceAdvPortions[v.reference_id] || 0) + (Number(v.total_amount) || 0);
      } else if (isCn) {
        invoiceCnPortions[v.reference_id] =
          (invoiceCnPortions[v.reference_id] || 0) + (Number(v.total_amount) || 0);
      } else {
        invoiceVoucherPayments[v.reference_id] =
          (invoiceVoucherPayments[v.reference_id] || 0) + voucherReceiptSettlementAmount(v);
      }
    } else if (v.reference_type === "customer" && v.reference_id === p.customerId) {
      if (!isAdv && !isCn) {
        openingBalanceVoucherPayments += voucherReceiptSettlementAmount(v);
      }
    }
  });

  const totalSalesGross =
    p.sales.reduce((sum, sale) => sum + (Number(sale.net_amount) || 0), 0) || 0;
  const totalSaleReturnAdjustOnSales =
    p.sales.reduce((sum, sale) => sum + Number(sale.sale_return_adjust || 0), 0) || 0;

  let totalPaidOnSales = 0;
  let totalAdvanceApplied = 0;
  let totalCnApplied = 0;
  p.sales.forEach((sale) => {
    const salePaidAmount = Math.max(Number(sale.paid_amount || 0), salePaidAtSaleTender(sale));
    const cashVoucher = invoiceVoucherPayments[sale.id] || 0;
    const advVoucher = invoiceAdvPortions[sale.id] || 0;
    const cnVoucher = invoiceCnPortions[sale.id] || 0;
    const advCnVoucher = advVoucher + cnVoucher;
    totalPaidOnSales += Math.max(salePaidAmount - advCnVoucher, cashVoucher);
    totalAdvanceApplied += advVoucher;
    totalCnApplied += cnVoucher;
  });

  const totalPaid =
    totalPaidOnSales + totalAdvanceApplied + totalCnApplied + openingBalanceVoucherPayments;

  const unusedAdvanceTotal = p.advances.reduce(
    (sum, adv) => sum + Math.max(0, (Number(adv.amount) || 0) - (Number(adv.used_amount) || 0)),
    0
  );

  const adjustedOutstandingTotal =
    p.saleReturns
      .filter((sr) => isAdjustedOutstanding(sr.credit_status))
      .reduce((sum, sr) => sum + (Number(sr.net_amount) || 0), 0) || 0;

  const actionedReturnTotal = p.saleReturns
    .filter((sr) => {
      const status = normalizeStatus(sr.credit_status);
      return !!status && status !== "pending";
    })
    .reduce((sum, sr) => {
      const status = normalizeStatus(sr.credit_status);
      const alreadyInNet = !!sr.linked_sale_id && status === "adjusted";
      return sum + (alreadyInNet ? 0 : Number(sr.net_amount) || 0);
    }, 0);

  const saleReturnTotal = Math.max(0, actionedReturnTotal - adjustedOutstandingTotal);

  // Outstanding = invoices − payments (payments include advances APPLIED via totalPaid).
  // Unused advance is reported separately (unusedAdvanceTotal) — not subtracted here.
  const grossOutstanding =
    p.openingBalance +
    totalSalesGross -
    totalSaleReturnAdjustOnSales -
    totalPaid +
    p.adjustmentTotal -
    saleReturnTotal +
    (p.refundsPaidTotal || 0);

  const balance = Math.round(grossOutstanding - adjustedOutstandingTotal);
  const totalSalesNet = Math.round(totalSalesGross - totalSaleReturnAdjustOnSales);

  return {
    balance,
    totalSales: totalSalesNet,
    totalSalesGross: Math.round(totalSalesGross),
    totalSaleReturnAdjustOnSales: Math.round(totalSaleReturnAdjustOnSales),
    totalPaid: Math.round(totalPaid),
    unusedAdvanceTotal: Math.round(unusedAdvanceTotal),
    adjustmentTotal: Math.round(p.adjustmentTotal),
    saleReturnTotal: Math.round(saleReturnTotal),
    totalCashPaid: Math.round(totalPaidOnSales + openingBalanceVoucherPayments),
    totalAdvanceApplied: Math.round(totalAdvanceApplied),
    totalCnApplied: Math.round(totalCnApplied),
  };
}

/**
 * Customer outstanding for ledger bulk paths — delegates to {@link getCustomerAccountState}
 * with ledger-aligned memo receipts; warns if legacy ledger math differs by > ₹1.
 */
export function computeCustomerOutstanding(p: CustomerOutstandingParams): CustomerOutstandingResult {
  const legacy = computeCustomerOutstandingLegacy(p);

  const voucherEntries = p.vouchers.map((v) => ({
    voucher_type: "receipt",
    reference_type: v.reference_type,
    reference_id: v.reference_id,
    total_amount: v.total_amount,
    discount_amount: v.discount_amount,
    payment_method: v.payment_method,
    description: v.description,
  }));

  const state = getCustomerAccountState({
    openingBalance: p.openingBalance,
    customerId: p.customerId,
    sales: p.sales,
    voucherEntries,
    customerAdvances: p.advances,
    advanceRefunds:
      (p.advanceRefundTotal || 0) > 0 ? [{ refund_amount: p.advanceRefundTotal }] : [],
    adjustmentTotal: p.adjustmentTotal,
    saleReturns: p.saleReturns,
    additionalCustomerPaymentDebits: p.refundsPaidTotal,
    options: { ledgerAlignedApplicationReceipts: true },
  });

  warnCustomerBalanceMismatch(
    "customerBalanceUtils.computeCustomerOutstanding",
    legacy.balance,
    state.balance,
    { customerId: p.customerId },
  );

  const totalCashPaid = Math.round(state.receiptCredits + state.paidAmountDrift);

  return {
    balance: state.balance,
    /** Net billings (gross invoices − CN/S/R on invoices). */
    totalSales: state.totalSalesNet,
    totalSalesGross: state.totalInvoicedGross,
    totalSaleReturnAdjustOnSales: state.totalSaleReturnAdjustOnInvoices,
    totalPaid: legacy.totalPaid,
    unusedAdvanceTotal: state.unusedAdvance,
    adjustmentTotal: state.adjustmentTotal,
    saleReturnTotal: state.pendingStandaloneSaleReturns,
    totalCashPaid,
    totalAdvanceApplied: legacy.totalAdvanceApplied,
    totalCnApplied: legacy.totalCnApplied,
  };
}

const INVOICE_RECON_TOL = 0.01;
/** Legacy bug duplicated CN into paid_amount alongside sale_return_adjust (same rupee amount). */
const DUPLICATE_CN_PAID_MATCH_TOL = 1;

export type SaleReceiptVoucherSplit = {
  cash: number;
  cn: number;
  adv: number;
  discount: number;
};

/**
 * Bucket sale-linked receipt voucher rows by payment method / description
 * (same rules as {@link computeCustomerOutstanding}).
 */
export type SaleReceiptVoucherRow = {
  reference_id: string | null;
  reference_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
  description?: string | null;
};

const emptySplit = (): SaleReceiptVoucherSplit => ({ cash: 0, cn: 0, adv: 0, discount: 0 });

function mergeSplits(
  target: Map<string, SaleReceiptVoucherSplit>,
  add: Map<string, SaleReceiptVoucherSplit>,
): void {
  add.forEach((split, saleId) => {
    const cur = target.get(saleId) || emptySplit();
    target.set(saleId, {
      cash: cur.cash + split.cash,
      cn: cur.cn + split.cn,
      adv: cur.adv + split.adv,
      discount: cur.discount + split.discount,
    });
  });
}

function addRowToSplitMap(
  map: Map<string, SaleReceiptVoucherSplit>,
  saleId: string,
  row: SaleReceiptVoucherRow,
): void {
  const one = splitSaleLinkedReceiptRows([{ ...row, reference_id: saleId }]);
  mergeSplits(map, one);
}

/** FY-wise bill no. INV/25-26/591 or POS/25-26/42 — serial repeats each FY. */
const SALE_NUMBER_TOKEN = /(?:INV|POS)\/[\d-]+\/[\d]+/gi;

/** Invoice numbers embedded in receipt descriptions (customer-level RCP rows). */
export function extractSaleNumbersFromReceiptDescription(description: string): string[] {
  const matches = description.match(SALE_NUMBER_TOKEN) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function normalizeSaleNumberToken(value: string): string {
  return value.trim().toUpperCase();
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function invoiceAmountDue(inv: {
  net_amount?: number | null;
  sale_return_adjust?: number | null;
}): number {
  return Math.max(
    0,
    Math.round(Number(inv.net_amount || 0) - Number(inv.sale_return_adjust || 0)),
  );
}

function receiptSettlementTotal(row: SaleReceiptVoucherRow): number {
  return Number(row.total_amount || 0) + Number(row.discount_amount || 0);
}

/** When several rows match one receipt, prefer the invoice whose due equals receipt amount. */
function disambiguateMatchesByReceiptAmount(
  matchedIds: string[],
  row: SaleReceiptVoucherRow,
  invoices: Array<{
    id: string;
    net_amount?: number | null;
    sale_return_adjust?: number | null;
  }>,
): string[] {
  if (matchedIds.length <= 1) return matchedIds;
  const settled = Math.round(receiptSettlementTotal(row));
  if (settled <= 0) return matchedIds;

  const byAmount = matchedIds.filter((id) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return false;
    return Math.abs(invoiceAmountDue(inv) - settled) <= 1;
  });
  if (byAmount.length === 1) return byAmount;

  let bestId = matchedIds[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const id of matchedIds) {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) continue;
    const diff = Math.abs(invoiceAmountDue(inv) - settled);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = id;
    }
  }
  if (bestDiff <= 1) return [bestId];
  return matchedIds;
}

function matchInvoiceIdsFromCustomerReceiptRow(
  row: SaleReceiptVoucherRow,
  invoices: Array<{ id: string; sale_number?: string | null; net_amount?: number | null; sale_return_adjust?: number | null }>,
): string[] {
  const desc = String(row.description || "");
  const descLower = desc.toLowerCase();
  const byNumber = invoices
    .filter((i) => i.sale_number?.trim())
    .map((i) => ({ id: i.id, num: i.sale_number!.trim() }))
    .sort((a, b) => b.num.length - a.num.length);

  const descTokens = extractSaleNumbersFromReceiptDescription(desc);
  const tokenSet = new Set(descTokens);

  const matched = new Set<string>();
  for (const token of descTokens) {
    for (const { id, num } of byNumber) {
      if (normalizeSaleNumberToken(num) === token) matched.add(id);
    }
  }
  // Substring fallback only when no concrete sale-number token was extracted
  // from the description. Otherwise the receipt clearly references a specific
  // invoice — and if that invoice isn't in our list, we MUST NOT leak the
  // payment onto a shorter-numbered invoice whose sale_number happens to be a
  // substring (e.g. "Payment for INV/26-27/471" attaching to INV/26-27/47).
  if (matched.size === 0 && descTokens.length === 0 && descLower.includes("inv/")) {
    for (const { id, num } of byNumber) {
      if (descLower.includes(normalizeSaleNumberToken(num).toLowerCase())) matched.add(id);
    }
  }
  if (matched.size === 0) {
    const settled = Math.round(receiptSettlementTotal(row));
    if (settled > 0) {
      const amountHits = invoices.filter(
        (inv) => Math.abs(invoiceAmountDue(inv) - settled) <= 1,
      );
      if (amountHits.length === 1) matched.add(amountHits[0].id);
    }
  }

  if (tokenSet.size > 0 && matched.size > 1) {
    const fyScoped = [...matched].filter((id) => {
      const inv = invoices.find((i) => i.id === id);
      const num = inv?.sale_number?.trim();
      return num ? tokenSet.has(normalizeSaleNumberToken(num)) : false;
    });
    if (fyScoped.length >= 1) {
      return disambiguateMatchesByReceiptAmount(fyScoped, row, invoices);
    }
  }

  return disambiguateMatchesByReceiptAmount([...matched], row, invoices);
}

/**
 * Customer Payment often stores receipts as reference_type=customer (customer uuid).
 * Dashboard queries used reference_id IN (sale ids) only, so those payments were invisible
 * and invoices stayed "Not Paid" while the ledger showed ₹0 due.
 */
export function augmentSaleReceiptSplitFromCustomerVouchers(
  splitBySale: Map<string, SaleReceiptVoucherSplit>,
  voucherRows: SaleReceiptVoucherRow[],
  invoices: Array<{
    id: string;
    sale_number?: string | null;
    net_amount?: number | null;
    sale_return_adjust?: number | null;
  }>,
): Map<string, SaleReceiptVoucherSplit> {
  const result = new Map(splitBySale instanceof Map ? splitBySale : new Map());
  const saleIdSet = new Set(invoices.map((i) => i.id).filter(Boolean));

  for (const row of voucherRows) {
    try {
      if (!row?.reference_id) continue;
      if (saleIdSet.has(row.reference_id)) continue;
      const refType = String(row.reference_type || "").toLowerCase();
      if (refType === "supplier" || refType === "employee" || refType === "expense") continue;

      const matchedIds = matchInvoiceIdsFromCustomerReceiptRow(row, invoices);
      if (matchedIds.length === 0) continue;

      if (matchedIds.length === 1) {
        addRowToSplitMap(result, matchedIds[0], row);
        continue;
      }

      const share = 1 / matchedIds.length;
      const scaled: SaleReceiptVoucherRow = {
        ...row,
        total_amount: Number(row.total_amount || 0) * share,
        discount_amount: Number(row.discount_amount || 0) * share,
      };
      for (const saleId of matchedIds) {
        addRowToSplitMap(result, saleId, scaled);
      }
    } catch (rowErr) {
      console.warn("[customerBalance] skip customer receipt split row", rowErr);
    }
  }

  return result;
}

/** Sale-linked + customer-linked receipts → per-invoice settlement split. */
export function buildSaleReceiptSplitMap(
  invoices: Array<{ id: string; sale_number?: string | null; customer_id?: string | null }>,
  voucherRows: SaleReceiptVoucherRow[],
): Map<string, SaleReceiptVoucherSplit> {
  try {
    const saleIds = new Set(invoices.map((i) => i.id).filter(Boolean));
    const directRows = voucherRows.filter((r) => r?.reference_id && saleIds.has(r.reference_id));
    const base = splitSaleLinkedReceiptRows(directRows);
    const augmented = augmentSaleReceiptSplitFromCustomerVouchers(base, voucherRows, invoices);
    return augmented instanceof Map ? augmented : new Map<string, SaleReceiptVoucherSplit>();
  } catch (err) {
    console.error("[customerBalance] buildSaleReceiptSplitMap failed", err);
    return new Map<string, SaleReceiptVoucherSplit>();
  }
}

const RECEIPT_SPLIT_SELECT =
  "reference_id, reference_type, total_amount, discount_amount, payment_method, description";

const RECEIPT_VOUCHER_PAGE = 1000;
const SALE_ID_IN_CHUNK = 80;

function dedupeReceiptRows(rows: SaleReceiptVoucherRow[]): SaleReceiptVoucherRow[] {
  const seen = new Set<string>();
  const merged: SaleReceiptVoucherRow[] = [];
  for (const row of rows) {
    const key = `${row.reference_type}|${row.reference_id}|${row.description}|${row.total_amount}|${row.discount_amount}|${row.payment_method}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

/** Paginate receipt rows — avoids Supabase 1000-row cap hiding older customer payments. */
async function fetchPaginatedReceiptRows(
  client: SupabaseClient,
  organizationId: string,
  apply: (q: any) => any,
): Promise<SaleReceiptVoucherRow[]> {
  const all: SaleReceiptVoucherRow[] = [];
  let offset = 0;
  while (true) {
    let q: any = client
      .from("voucher_entries")
      .select(RECEIPT_SPLIT_SELECT)
      .eq("organization_id", organizationId)
      .ilike("voucher_type", "receipt")
      .is("deleted_at", null)
      .in("reference_type", [...CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES]);
    q = apply(q);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + RECEIPT_VOUCHER_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as SaleReceiptVoucherRow[]));
    if (data.length < RECEIPT_VOUCHER_PAGE) break;
    offset += RECEIPT_VOUCHER_PAGE;
  }
  return all;
}

export type FetchSaleReceiptSplitsOptions = {
  /** YYYY-MM-DD — limits customer-level receipt rows (reduces cloud reads on dashboards). */
  voucherDateFrom?: string | null;
  voucherDateTo?: string | null;
};

/** Fetch receipt vouchers for a page of invoices (sale id + customer id paths). */
export async function fetchSaleReceiptSplitsForInvoices(
  client: SupabaseClient,
  organizationId: string,
  invoices: Array<{ id: string; sale_number?: string | null; customer_id?: string | null }>,
  options?: FetchSaleReceiptSplitsOptions,
): Promise<Map<string, SaleReceiptVoucherSplit>> {
  const empty = new Map<string, SaleReceiptVoucherSplit>();
  try {
    const saleIds = invoices.map((i) => i.id).filter(Boolean);
    if (saleIds.length === 0) return empty;

    const customerIds = [
      ...new Set(invoices.map((i) => i.customer_id).filter(Boolean)),
    ] as string[];

    const merged: SaleReceiptVoucherRow[] = [];

    for (let i = 0; i < saleIds.length; i += SALE_ID_IN_CHUNK) {
      const chunk = saleIds.slice(i, i + SALE_ID_IN_CHUNK);
      try {
        const rows = await fetchPaginatedReceiptRows(client, organizationId, (q) =>
          q.in("reference_id", chunk),
        );
        merged.push(...rows);
      } catch (chunkErr) {
        console.warn("[customerBalance] skip sale-id receipt chunk", chunkErr);
      }
    }

    const applyVoucherDateBounds = (q: any) => {
      let bounded = q;
      if (options?.voucherDateFrom) {
        bounded = bounded.gte("voucher_date", options.voucherDateFrom);
      }
      if (options?.voucherDateTo) {
        bounded = bounded.lte("voucher_date", options.voucherDateTo);
      }
      return bounded;
    };

    for (const customerId of customerIds) {
      try {
        const rows = await fetchPaginatedReceiptRows(client, organizationId, (q) =>
          applyVoucherDateBounds(q.eq("reference_id", customerId)),
        );
        merged.push(...rows);
      } catch (custErr) {
        console.warn("[customerBalance] skip customer receipt rows", customerId, custErr);
      }
    }

    const saleNumbers = [
      ...new Set(
        invoices.map((i) => i.sale_number?.trim()).filter((n): n is string => Boolean(n)),
      ),
    ];
    const DESC_OR_CHUNK = 12;
    for (let i = 0; i < saleNumbers.length; i += DESC_OR_CHUNK) {
      const batch = saleNumbers.slice(i, i + DESC_OR_CHUNK);
      const orFilter = batch
        .map((num) => `description.ilike.%${escapeIlikePattern(num)}%`)
        .join(",");
      try {
        const rows = await fetchPaginatedReceiptRows(client, organizationId, (q) =>
          applyVoucherDateBounds(q.or(orFilter)),
        );
        merged.push(...rows);
      } catch (descErr) {
        console.warn("[customerBalance] skip description receipt chunk", descErr);
      }
    }

    const map = buildSaleReceiptSplitMap(invoices, dedupeReceiptRows(merged));
    return map instanceof Map ? map : empty;
  } catch (err) {
    console.error("[customerBalance] fetchSaleReceiptSplitsForInvoices failed", err);
    return empty;
  }
}

export function splitSaleLinkedReceiptRows(
  rows: Array<{
    reference_id: string | null;
    total_amount?: number | null;
    discount_amount?: number | null;
    payment_method?: string | null;
    description?: string | null;
  }>
): Map<string, SaleReceiptVoucherSplit> {
  const map = new Map<string, SaleReceiptVoucherSplit>();

  for (const r of rows) {
    try {
      if (!r?.reference_id) continue;
      const v: VoucherLedgerRow = {
        reference_id: r.reference_id,
        total_amount: r.total_amount,
        discount_amount: r.discount_amount,
        payment_method: r.payment_method,
        description: r.description,
      };
      const cashAmt = Number(r.total_amount || 0);
      const discAmt = Number(r.discount_amount || 0);
      const cur = map.get(r.reference_id) || emptySplit();
      if (isAdvVoucher(v)) cur.adv += cashAmt;
      else if (isCnVoucher(v)) cur.cn += cashAmt;
      else {
        cur.cash += cashAmt;
        cur.discount += discAmt;
      }
      map.set(r.reference_id, cur);
    } catch (rowErr) {
      console.warn("[customerBalance] skip sale-linked receipt row", rowErr);
    }
  }
  return map;
}

/**
 * Per-invoice cash paid, outstanding, and status for Sales Invoice Dashboard.
 * Uses ledger-consistent cash vs CN/advance split and repairs duplicate CN in paid_amount.
 */
export function reconcileSaleInvoiceDisplay(params: {
  net_amount: number;
  sale_return_adjust: number;
  paid_amount: number;
  split?: SaleReceiptVoucherSplit | null;
  /**
   * Merchandise gross (Σ mrp × qty from sale_items). Optional.
   * When provided, distinguishes the two `net_amount` conventions:
   *   - post-return (POS exchange / billing return baked in): net + sr ≈ items_gross
   *     → `sr` is already inside `net`, do NOT subtract it again (legacy behavior).
   *   - pre-return (CN/return adjusted onto a full-bill invoice, e.g. ELLA NOOR): net is
   *     the full bill and `sr` is a credit applied on top → subtract `sr` from payable.
   * The guard `net + sr > items_gross` is false for post-return rows, so passing
   * items_gross is a NO-OP for the exchange / SHAHIN-PATEL cases (no regression) and only
   * credits the applied return for genuine pre-return invoices.
   */
  items_gross?: number | null;
}): {
  paid_amount: number;
  payment_status: "pending" | "partial" | "completed";
  outstanding: number;
} {
  const net = Number(params.net_amount || 0);
  const sr = Number(params.sale_return_adjust || 0);
  const itemsGross = params.items_gross != null ? Number(params.items_gross) : null;
  // Pre-return invoice: the full bill is still in `net` and the return was applied as a
  // credit on top (no reduction of net). Subtract it once. Guard is conservative — it can
  // never fire for a post-return row (where net + sr ≤ items_gross), the dangerous direction.
  const srAppliedOnTop =
    itemsGross != null &&
    itemsGross > INVOICE_RECON_TOL &&
    sr > INVOICE_RECON_TOL &&
    net + sr > itemsGross + DUPLICATE_CN_PAID_MATCH_TOL;
  const salePaid = Number(params.paid_amount || 0);
  const { cash = 0, cn = 0, adv = 0, discount = 0 } = params.split || {
    cash: 0,
    cn: 0,
    adv: 0,
    discount: 0,
  };
  const advCn = adv + cn;
  // At-sale tender (POS cash/card/UPI columns) plus follow-up receipt vouchers — not max().
  let effectiveCash = Math.max(0, salePaid - advCn) + cash + discount;

  if (sr > INVOICE_RECON_TOL && Math.abs(salePaid - sr) <= DUPLICATE_CN_PAID_MATCH_TOL) {
    effectiveCash = Math.max(0, cash);
  }

  // `net_amount` is stored POST-adjust (already net of any sale_return_adjust
  // applied at billing — see customerAuditMath / reconcile_customer_balances).
  // The billing return must therefore NOT be subtracted again here. Doing so
  // double-credited the return, making adjusted-but-unpaid invoices read as
  // fully settled (e.g. net 1,000 with sr 1,000 + ₹0 cash showed ₹0 due
  // instead of ₹1,000). `sr` is used ONLY to dedupe a CN application that merely
  // duplicates the billing return (legacy FloatingSaleReturn POS-redeem rows that
  // write both sale_return_adjust and a credit_note_adjustment voucher).
  const payable = srAppliedOnTop ? Math.max(0, net - sr) : net;
  const exposureAfterCashLike = Math.max(0, payable - effectiveCash);
  // Avoid double-counting CN: when sale_return_adjust already encodes the CN
  // application (Sales Dashboard CN-adjust flow writes both sr and a
  // credit_note_adjustment voucher for the same amount), subtract the portion
  // already represented in sr from the cn bucket.
  const cnNotInSr = Math.max(0, cn - Math.max(0, sr));
  const cappedNonCash = Math.min(exposureAfterCashLike, adv + cnNotInSr + discount);
  const outstanding = Math.max(0, Math.round(payable - effectiveCash - cappedNonCash));
  const settledDisplay = Math.max(
    0,
    Math.round(Math.min(payable, effectiveCash + cappedNonCash))
  );

  // Only genuine settlements signal "partial". `sr` is now fully baked into
  // `net`, and a CN that merely duplicates the billing return (cn ≤ sr) is not a
  // real payment, so use `cnNotInSr` rather than the raw CN bucket.
  const payment_status: "pending" | "partial" | "completed" =
    outstanding <= INVOICE_RECON_TOL
      ? "completed"
      : effectiveCash > INVOICE_RECON_TOL ||
          adv > INVOICE_RECON_TOL ||
          cnNotInSr > INVOICE_RECON_TOL
        ? "partial"
        : "pending";

  return {
    paid_amount: settledDisplay,
    payment_status,
    outstanding,
  };
}

export type ReceiptReprintVoucher = {
  reference_id?: string | null;
  reference_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  description?: string | null;
};

export type ReceiptReprintSale = {
  id: string;
  sale_number?: string | null;
  customer_id?: string | null;
  net_amount?: number | null;
  sale_return_adjust?: number | null;
  paid_amount?: number | null;
};

/**
 * Point-in-time balances for a PAYMENT RECEIPT reprint.
 *
 * Receipts historically printed previousBalance/currentBalance = 0 because they were not
 * recomputed for old vouchers. This resolves the invoice the receipt settled (by
 * reference_id or by the invoice number in the description) and reconciles it with live
 * receipt splits so the receipt shows the real invoice balance:
 *   currentBalance  = invoice outstanding now (after this + any other receipts)
 *   previousBalance = currentBalance + this voucher's settlement (cash + discount)
 *
 * Returns null when the receipt can't be tied to a single invoice (e.g. opening-balance or
 * multi-invoice receipts) so callers can keep their existing fallback.
 */
export async function resolveReceiptReprintBalances(
  client: SupabaseClient,
  organizationId: string,
  voucher: ReceiptReprintVoucher,
  sales: ReceiptReprintSale[] | undefined,
): Promise<{ invoice: ReceiptReprintSale; previousBalance: number; currentBalance: number } | null> {
  const settled =
    Math.max(0, Number(voucher.total_amount || 0)) + Math.max(0, Number(voucher.discount_amount || 0));

  let sale = sales?.find((s) => s.id === voucher.reference_id) || null;
  if (!sale && voucher.description) {
    const nums = extractSaleNumbersFromReceiptDescription(voucher.description);
    if (nums.length === 1) {
      sale =
        sales?.find(
          (s) => normalizeSaleNumberToken(String(s.sale_number || "")) === nums[0],
        ) || null;
    }
  }
  if (!sale) return null;

  const splitMap = await fetchSaleReceiptSplitsForInvoices(client, organizationId, [
    { id: sale.id, sale_number: sale.sale_number, customer_id: sale.customer_id },
  ]);
  const split = splitMap.get(sale.id) ?? emptySplit();
  const rec = reconcileSaleInvoiceWithSplit(sale, split);
  const currentBalance = Math.max(0, Math.round(rec.outstanding));
  const previousBalance = Math.max(0, Math.round(currentBalance + settled));
  return { invoice: sale, previousBalance, currentBalance };
}

/** Same paid_amount input as Customer Payment / invoice due (strip voucher buckets already in split). */
export function reconcileSaleInvoiceWithSplit(
  sale: {
    net_amount?: number | null;
    sale_return_adjust?: number | null;
    paid_amount?: number | null;
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
    /** Optional Σ(mrp × qty); enables the pre-return S/R subtraction guard. */
    items_gross?: number | null;
  },
  split: SaleReceiptVoucherSplit | null | undefined,
) {
  const s = split ?? emptySplit();
  const voucherBucketSum = s.cash + s.adv + s.cn;
  const atSaleTender = salePaidAtSaleTender(sale);
  const storedPaid = Number(sale.paid_amount || 0);
  const paidForReconcile = Math.max(atSaleTender, Math.max(0, storedPaid - voucherBucketSum));
  return reconcileSaleInvoiceDisplay({
    net_amount: Number(sale.net_amount || 0),
    sale_return_adjust: Number(sale.sale_return_adjust || 0),
    paid_amount: paidForReconcile,
    split: s,
    items_gross: sale.items_gross != null ? Number(sale.items_gross) : null,
  });
}

export type SaleRowForPaymentSync = {
  id: string;
  net_amount?: number | null;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
  customer_id?: string | null;
  sale_number?: string | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
};

const SALE_PAYMENT_SYNC_SELECT =
  "id, net_amount, paid_amount, sale_return_adjust, customer_id, sale_number, cash_amount, card_amount, upi_amount";

async function loadSalesForPaymentSync(
  client: SupabaseClient,
  organizationId: string,
  invoiceIds: string[],
  existingSalesById?: Map<string, SaleRowForPaymentSync>,
): Promise<Map<string, SaleRowForPaymentSync>> {
  const salesById = new Map(existingSalesById);
  const missingIds = [...new Set(invoiceIds.filter(Boolean))].filter((id) => !salesById.has(id));

  for (let i = 0; i < missingIds.length; i += SALE_ID_IN_CHUNK) {
    const chunk = missingIds.slice(i, i + SALE_ID_IN_CHUNK);
    const { data, error } = await client
      .from("sales")
      .select(SALE_PAYMENT_SYNC_SELECT)
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      salesById.set(row.id, row as SaleRowForPaymentSync);
    }
  }

  return salesById;
}

/** Batch sync: one sales IN(...) load + one receipt-split fetch for many invoices. */
export async function syncSalePaymentsFromVouchersBatch(
  invoiceIds: string[],
  organizationId: string,
  voucherDateYmd: string,
  client: SupabaseClient,
  options?: {
    existingSalesById?: Map<string, SaleRowForPaymentSync>;
  },
): Promise<Map<string, ReturnType<typeof reconcileSaleInvoiceWithSplit>>> {
  const uniqueIds = [...new Set(invoiceIds.filter(Boolean))];
  const results = new Map<string, ReturnType<typeof reconcileSaleInvoiceWithSplit>>();
  if (uniqueIds.length === 0) return results;

  const salesById = await loadSalesForPaymentSync(
    client,
    organizationId,
    uniqueIds,
    options?.existingSalesById,
  );

  const splitMap = await fetchSaleReceiptSplitsForInvoices(
    client,
    organizationId,
    uniqueIds
      .map((id) => salesById.get(id))
      .filter(Boolean)
      .map((sale) => ({
        id: sale!.id,
        sale_number: sale!.sale_number,
        customer_id: sale!.customer_id,
      })),
  );

  await Promise.all(
    uniqueIds.map(async (invoiceId) => {
      const sale = salesById.get(invoiceId);
      if (!sale) return;
      const split = splitMap.get(invoiceId) ?? emptySplit();
      const rec = reconcileSaleInvoiceWithSplit(sale, split);
      const { error: updErr } = await client
        .from("sales")
        .update({
          paid_amount: rec.paid_amount,
          payment_status: rec.payment_status,
          payment_date: voucherDateYmd,
        })
        .eq("id", invoiceId)
        .eq("organization_id", organizationId);
      if (updErr) throw updErr;
      results.set(invoiceId, rec);
    }),
  );

  return results;
}

/** Ledger-consistent paid_amount / status from receipt vouchers (canonical sale row writer). */
export async function syncSalePaymentFromVouchers(
  invoiceId: string,
  organizationId: string,
  voucherDateYmd: string,
  client: SupabaseClient,
  options?: {
    /** Skip sales SELECT when caller already has the row (e.g. POS payment dialog). */
    existingSale?: SaleRowForPaymentSync | null;
  },
) {
  const existingSalesById = options?.existingSale
    ? new Map([[invoiceId, options.existingSale]])
    : undefined;

  const results = await syncSalePaymentsFromVouchersBatch(
    [invoiceId],
    organizationId,
    voucherDateYmd,
    client,
    { existingSalesById },
  );

  const rec = results.get(invoiceId);
  if (!rec) {
    throw new Error(`Sale not found: ${invoiceId}`);
  }
  return rec;
}

/**
 * Build a map of sale_id -> total voucher payment amount from voucher entries.
 * Also returns total opening balance payments for a specific customer.
 * @deprecated Prefer passing full voucher rows into {@link computeCustomerOutstanding}.
 */
export function buildVoucherPaymentMaps(
  voucherEntries: Array<{ reference_id: string | null; reference_type: string | null; total_amount: number | null }>,
  saleIds: string[],
  customerId: string
): { invoiceVoucherPayments: Map<string, number>; openingBalancePayments: number } {
  const invoiceVoucherPayments = new Map<string, number>();
  let openingBalancePayments = 0;
  const saleIdSet = new Set(saleIds);

  voucherEntries.forEach((v) => {
    if (!v.reference_id) return;

    if (saleIdSet.has(v.reference_id)) {
      invoiceVoucherPayments.set(
        v.reference_id,
        (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
      );
    } else if (v.reference_type === "customer" && v.reference_id === customerId) {
      openingBalancePayments += Number(v.total_amount) || 0;
    }
  });

  return { invoiceVoucherPayments, openingBalancePayments };
}

/**
 * Calculate outstanding per sale using Math.max() logic.
 * Returns a Map of customer_id -> total outstanding balance from invoices.
 */
export function calculateCustomerInvoiceBalances(
  sales: Array<{
    id: string;
    customer_id: string | null;
    net_amount: number | null;
    paid_amount: number | null;
    sale_return_adjust?: number | null;
  }>,
  invoiceVoucherPayments: Map<string, number>
): Map<string, number> {
  const customerBalances = new Map<string, number>();

  sales.forEach((sale) => {
    if (sale.customer_id) {
      const salePaidAmount = sale.paid_amount || 0;
      const voucherAmount = invoiceVoucherPayments.get(sale.id) || 0;
      const effectivePaid = Math.max(salePaidAmount, voucherAmount);
      const sr = Number(sale.sale_return_adjust || 0);
      const outstanding = Math.max(
        0,
        Math.round((sale.net_amount || 0) - effectivePaid - sr)
      );

      customerBalances.set(
        sale.customer_id,
        (customerBalances.get(sale.customer_id) || 0) + outstanding
      );
    }
  });

  return customerBalances;
}

/** Full DB-backed snapshot for one customer — aligned with Customer Audit Report / voucher_entries (non-deleted). */
export async function fetchCustomerBalanceSnapshot(
  client: SupabaseClient,
  organizationId: string,
  customerId: string
): Promise<{
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  adjustmentTotal: number;
  unusedAdvanceTotal: number;
  saleReturnTotal: number;
  totalSalesGross: number;
  totalSaleReturnAdjustOnSales: number;
  totalCashPaid: number;
  totalAdvanceApplied: number;
  totalCnApplied: number;
}> {
  const bundle = await fetchCustomerAuditBundle(client, organizationId, customerId);
  const adjustmentTotal = (bundle.balanceAdjustments || []).reduce(
    (sum: number, a: { outstanding_difference?: number | null }) =>
      sum + Number(a.outstanding_difference || 0),
    0,
  );

  const core = computeCustomerBalanceCore({
    openingBalance: Number(bundle.customer.opening_balance || 0),
    customerId,
    sales: bundle.allSales,
    voucherEntries: bundle.vouchersMerged,
    customerAdvances: bundle.advances,
    advanceRefunds: bundle.refunds,
    adjustmentTotal,
    saleReturns: bundle.saleReturns,
    options: { ledgerAlignedApplicationReceipts: true },
  });

  // Pre-fix bug: adjustment was in auditFormulaOutstanding and added again; drift subtracted twice.
  const preFixBalance = Math.round(
    core.auditFormulaOutstanding - core.paidAmountDrift + adjustmentTotal,
  );
  warnCustomerBalanceMismatch(
    "fetchCustomerBalanceSnapshot (adjustment double-apply fix)",
    preFixBalance,
    core.balance,
    { customerId },
  );

  const openingBalance = core.openingBalance;
  const totalSalesGross = core.totalInvoicedGross;
  const totalSaleReturnAdjustOnSales = core.totalSaleReturnAdjustOnInvoices;
  const totalSales = core.totalSalesNet;
  const totalCashPaid = Math.round(core.receiptCredits + core.paidAmountDrift);
  const totalPaid = Math.round(
    totalCashPaid + core.creditNoteCredits + core.totalAdvanceUsed,
  );

  return {
    balance: core.balance,
    openingBalance,
    totalSales,
    totalPaid,
    adjustmentTotal: core.adjustmentTotal,
    unusedAdvanceTotal: core.unusedAdvance,
    saleReturnTotal: core.pendingStandaloneSaleReturns,
    totalSalesGross,
    totalSaleReturnAdjustOnSales,
    totalCashPaid,
    totalAdvanceApplied: core.totalAdvanceUsed,
    totalCnApplied: core.creditNoteCredits,
  };
}

/**
 * Lifetime outstanding Dr per customer — uses batch SQL snapshot RPC (fast pickers / lists).
 * Pass `customerIds` to limit RPC work (e.g. payment tab candidates only).
 */
export async function fetchCustomerLifetimeBalanceMap(
  organizationId: string,
  client: SupabaseClient = supabase,
  customerIds?: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!organizationId) return map;

  const ids =
    customerIds?.filter(Boolean) ??
    (await fetchAllCustomers(organizationId)).map((c: { id: string }) => c.id).filter(Boolean);

  if (ids.length === 0) return map;

  const snapshotMap = await fetchCustomerFinancialSnapshotMap(organizationId, ids, client);
  for (const id of ids) {
    map.set(id, snapshotMap.get(id)?.outstandingDr ?? 0);
  }
  return map;
}
