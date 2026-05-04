import type { SupabaseClient } from "@supabase/supabase-js";

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
  payment_method?: string | null;
  description?: string | null;
};

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
    paid_amount: number | null;
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

/**
 * Single source of truth for customer outstanding (matches {@link useCustomerBalance}).
 */
export function computeCustomerOutstanding(p: CustomerOutstandingParams): CustomerOutstandingResult {
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
          (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
      }
    } else if (v.reference_type === "customer" && v.reference_id === p.customerId) {
      if (!isAdv && !isCn) {
        openingBalanceVoucherPayments += Number(v.total_amount) || 0;
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
    const salePaidAmount = sale.paid_amount || 0;
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

  const effectiveUnusedAdvances = Math.max(0, unusedAdvanceTotal - (p.advanceRefundTotal || 0));
  const grossOutstanding =
    p.openingBalance +
    totalSalesGross -
    totalSaleReturnAdjustOnSales -
    totalPaid +
    p.adjustmentTotal -
    effectiveUnusedAdvances -
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

const INVOICE_RECON_TOL = 0.01;
/** Legacy bug duplicated CN into paid_amount alongside sale_return_adjust (same rupee amount). */
const DUPLICATE_CN_PAID_MATCH_TOL = 1;

export type SaleReceiptVoucherSplit = {
  cash: number;
  cn: number;
  adv: number;
};

/**
 * Bucket sale-linked receipt voucher rows by payment method / description
 * (same rules as {@link computeCustomerOutstanding}).
 */
export function splitSaleLinkedReceiptRows(
  rows: Array<{
    reference_id: string | null;
    total_amount?: number | null;
    payment_method?: string | null;
    description?: string | null;
  }>
): Map<string, SaleReceiptVoucherSplit> {
  const map = new Map<string, SaleReceiptVoucherSplit>();
  const empty = (): SaleReceiptVoucherSplit => ({ cash: 0, cn: 0, adv: 0 });

  for (const r of rows) {
    if (!r.reference_id) continue;
    const v: VoucherLedgerRow = {
      reference_id: r.reference_id,
      total_amount: r.total_amount,
      payment_method: r.payment_method,
      description: r.description,
    };
    const amt = Number(r.total_amount || 0);
    const cur = map.get(r.reference_id) || empty();
    if (isAdvVoucher(v)) cur.adv += amt;
    else if (isCnVoucher(v)) cur.cn += amt;
    else cur.cash += amt;
    map.set(r.reference_id, cur);
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
}): {
  paid_amount: number;
  payment_status: "pending" | "partial" | "completed";
  outstanding: number;
} {
  const net = Number(params.net_amount || 0);
  const sr = Number(params.sale_return_adjust || 0);
  const salePaid = Number(params.paid_amount || 0);
  const { cash = 0, cn = 0, adv = 0 } = params.split || { cash: 0, cn: 0, adv: 0 };
  const advCn = adv + cn;
  let effectiveCash = Math.max(salePaid - advCn, cash);

  if (sr > INVOICE_RECON_TOL && Math.abs(salePaid - sr) <= DUPLICATE_CN_PAID_MATCH_TOL) {
    effectiveCash = Math.max(0, cash);
  }

  // After stripping advance/CN from paid_amount into `effectiveCash`, settlement
  // toward the bill still includes the advance/CN voucher buckets (same as
  // computeCustomerOutstanding). Without this, advance-only payments left
  // outstanding = net − sr while effectiveCash was 0.
  const exposureAfterCashLike = Math.max(0, net - sr - effectiveCash);
  const cappedNonCash = Math.min(exposureAfterCashLike, adv + cn);
  const outstanding = Math.max(0, Math.round(net - sr - effectiveCash - cappedNonCash));
  const settledDisplay = Math.max(
    0,
    Math.round(Math.min(net - sr, effectiveCash + cappedNonCash))
  );

  const payment_status: "pending" | "partial" | "completed" =
    outstanding <= INVOICE_RECON_TOL
      ? "completed"
      : effectiveCash > INVOICE_RECON_TOL ||
          sr > INVOICE_RECON_TOL ||
          adv > INVOICE_RECON_TOL ||
          cn > INVOICE_RECON_TOL
        ? "partial"
        : "pending";

  return {
    paid_amount: settledDisplay,
    payment_status,
    outstanding,
  };
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

/** Full DB-backed snapshot for one customer (ledger-consistent). */
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
}> {
  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("opening_balance")
    .eq("id", customerId)
    .single();

  if (customerError) throw customerError;
  const openingBalance = customer?.opening_balance || 0;

  const { data: sales, error: salesError } = await client
    .from("sales")
    .select("id, net_amount, paid_amount, sale_return_adjust, payment_status")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .neq("payment_status", "cancelled")
    .neq("payment_status", "hold");

  if (salesError) throw salesError;

  const { data: allVouchers, error: voucherError } = await client
    .from("voucher_entries")
    .select("reference_id, reference_type, total_amount, payment_method, description")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .is("deleted_at", null);

  if (voucherError) throw voucherError;

  const { data: adjustments, error: adjError } = await client
    .from("customer_balance_adjustments")
    .select("outstanding_difference")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId);

  if (adjError) throw adjError;
  const adjustmentTotal =
    adjustments?.reduce((sum, adj) => sum + (adj.outstanding_difference || 0), 0) || 0;

  const { data: advances, error: advError } = await client
    .from("customer_advances")
    .select("id, amount, used_amount")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .in("status", ["active", "partially_used"]);

  if (advError) throw advError;

  const advanceIds = advances?.map((a) => a.id) || [];
  let advanceRefundTotal = 0;
  if (advanceIds.length > 0) {
    const { data: advRefunds } = await client
      .from("advance_refunds")
      .select("refund_amount")
      .in("advance_id", advanceIds);
    advanceRefundTotal = advRefunds?.reduce((s, r) => s + (r.refund_amount || 0), 0) || 0;
  }

  const { data: saleReturns, error: srError } = await client
    .from("sale_returns")
    .select("id, net_amount, credit_status, linked_sale_id")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (srError) throw srError;

  const { data: refundVouchers } = await client
    .from("voucher_entries")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "payment")
    .eq("reference_type", "customer")
    .eq("reference_id", customerId)
    .is("deleted_at", null);
  const refundsPaidTotal = refundVouchers?.reduce((s, v) => s + (v.total_amount || 0), 0) || 0;

  const co = computeCustomerOutstanding({
    openingBalance,
    customerId,
    sales: sales || [],
    vouchers: allVouchers || [],
    adjustmentTotal,
    advances: (advances || []).map((a) => ({
      id: a.id,
      amount: a.amount,
      used_amount: a.used_amount,
    })),
    advanceRefundTotal,
    saleReturns: saleReturns || [],
    refundsPaidTotal,
  });

  return {
    balance: co.balance,
    openingBalance: Math.round(openingBalance),
    totalSales: co.totalSales,
    totalPaid: co.totalPaid,
    adjustmentTotal: co.adjustmentTotal,
    unusedAdvanceTotal: co.unusedAdvanceTotal,
    saleReturnTotal: co.saleReturnTotal,
  };
}
