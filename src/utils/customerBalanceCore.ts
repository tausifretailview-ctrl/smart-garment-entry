/**
 * Single source of truth for customer lifetime outstanding.
 * Formula aligned with `reconcile_customer_balance` / `get_customer_true_outstanding` (SQL)
 * and `customerAuditMath` audit components, plus explicit extensions:
 *
 * - `paidAmountDrift` — POS cash/UPI on `sales.paid_amount` without a matching receipt voucher
 * - `pendingStandaloneSaleReturns` — standalone sale_returns still in `pending` (not in RPC lines)
 */

const BALANCE_MISMATCH_TOL = 1;

export type ComputeCustomerOutstandingOptions = {
  /** When true, exclude advance/CN application receipts from receipt credits (CustomerLedger memo rules). */
  ledgerAlignedApplicationReceipts?: boolean;
};

export const isAdvanceApplicationVoucher = (v: {
  voucher_type?: string | null;
  reference_type?: string | null;
  payment_method?: string | null;
  description?: string | null;
}): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  if (String(v.reference_type || "").toLowerCase() !== "sale") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "advance_adjustment") return true;
  const desc = (v.description || "").toLowerCase().trim();
  return desc.startsWith("adjusted from advance balance");
};

export const isAdvanceApplicationReceiptLedgerAligned = (v: {
  voucher_type?: string | null;
  payment_method?: string | null;
  description?: string | null;
}): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "advance_adjustment") return true;
  const desc = (v.description || "").toLowerCase();
  return desc.includes("adjusted from advance balance") || desc.includes("advance adjusted");
};

export const isCreditNoteApplicationReceiptLedgerAligned = (v: {
  voucher_type?: string | null;
  payment_method?: string | null;
  description?: string | null;
}): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "credit_note_adjustment") return true;
  const desc = (v.description || "").toLowerCase();
  return desc.includes("credit note adjusted") || desc.includes("cn adjusted");
};

export const isReceiptMemoApplicationLedgerAligned = (v: {
  voucher_type?: string | null;
  reference_type?: string | null;
  payment_method?: string | null;
  description?: string | null;
}): boolean =>
  isAdvanceApplicationReceiptLedgerAligned(v) || isCreditNoteApplicationReceiptLedgerAligned(v);

export type CustomerBalanceCoreVoucher = {
  voucher_type: string;
  reference_type?: string | null;
  reference_id?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
  description?: string | null;
};

export type CustomerBalanceCoreSale = {
  id?: string;
  net_amount?: number | null;
  sale_return_adjust?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  is_cancelled?: boolean | null;
};

export type CustomerBalanceCoreSaleReturn = {
  net_amount?: number | null;
  credit_status?: string | null;
  linked_sale_id?: string | null;
};

export type CustomerBalanceCoreParams = {
  openingBalance: number;
  customerId?: string;
  sales: CustomerBalanceCoreSale[];
  voucherEntries: CustomerBalanceCoreVoucher[];
  customerAdvances: Array<{ amount?: number | null; used_amount?: number | null }>;
  advanceRefunds: Array<{ refund_amount?: number | null }>;
  adjustmentTotal?: number;
  saleReturns?: CustomerBalanceCoreSaleReturn[];
  /** Customer payment vouchers not present in voucherEntries (e.g. ledger refundsPaidTotal). */
  additionalCustomerPaymentDebits?: number;
  options?: ComputeCustomerOutstandingOptions;
};

/** Component breakdown — matches RPC `reconcile_customer_balance` lines + extensions. */
export type CustomerBalanceCoreComponents = {
  openingBalance: number;
  balanceAdjustment: number;
  totalInvoicedGross: number;
  saleReturnAdjustOnInvoices: number;
  receiptPayments: number;
  creditNoteVouchers: number;
  customerPaymentRefunds: number;
  advancesApplied: number;
  unusedAdvances: number;
  /** POS: sales.paid_amount minus receipt vouchers on the same sale (parity with at-sale cash). */
  paidAmountDrift: number;
  /** Standalone sale_returns with credit_status pending (explicit; not in RPC SUM). */
  pendingStandaloneSaleReturns: number;
};

export type CustomerBalanceCoreResult = {
  /** Lifetime Dr (+) / Cr (−) after all components. */
  balance: number;
  openingBalance: number;
  totalInvoicedGross: number;
  totalSaleReturnAdjustOnInvoices: number;
  totalSalesNet: number;
  totalRealPayments: number;
  receiptCredits: number;
  creditNoteCredits: number;
  customerPaymentDebits: number;
  totalAdvanceUsed: number;
  unusedAdvance: number;
  advanceRefundedTotal: number;
  adjustmentTotal: number;
  paidAmountDrift: number;
  pendingStandaloneSaleReturns: number;
  /** Audit/RPC formula before drift and pending SR (for comparison). */
  auditFormulaOutstanding: number;
  components: CustomerBalanceCoreComponents;
};

const normalizeStatus = (status: unknown) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export function warnCustomerBalanceMismatch(
  label: string,
  legacyBalance: number,
  coreBalance: number,
  extra?: Record<string, unknown>,
): void {
  const diff = Math.abs(legacyBalance - coreBalance);
  if (diff > BALANCE_MISMATCH_TOL) {
    console.warn(
      `[customerBalance] ${label}: legacy vs core differ by ₹${diff.toFixed(2)}`,
      { legacyBalance, coreBalance, ...extra },
    );
  }
}

function voucherCredit(v: { total_amount?: number | null; discount_amount?: number | null }): number {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

function filterValidSales(sales: CustomerBalanceCoreSale[]): CustomerBalanceCoreSale[] {
  return sales.filter(
    (s) =>
      s.is_cancelled !== true &&
      !["cancelled", "hold"].includes(String(s.payment_status || "").toLowerCase()),
  );
}

/**
 * POS cash parity: `sales.paid_amount` minus receipt voucher totals on the same sale.
 * At-sale cash/UPI is often stored on the sale row without a matching `voucher_entries` receipt
 * (payment may exist only in `customer_ledger_entries`). Subtracting drift aligns balance with POS.
 */
export function computePaidAmountDrift(
  validSales: CustomerBalanceCoreSale[],
  voucherEntries: CustomerBalanceCoreVoucher[],
): number {
  const voucherTotalsBySale = new Map<string, number>();
  for (const v of voucherEntries) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const refId = v.reference_id;
    if (!refId) continue;
    voucherTotalsBySale.set(
      refId,
      (voucherTotalsBySale.get(refId) || 0) + (Number(v.total_amount) || 0),
    );
  }

  let drift = 0;
  for (const s of validSales) {
    const paid = Number(s.paid_amount || 0);
    if (paid <= 0 || !s.id) continue;
    const voucherSum = voucherTotalsBySale.get(s.id) || 0;
    const gap = paid - voucherSum;
    if (gap > 0) drift += gap;
  }
  return drift;
}

/**
 * Standalone pending sale returns (explicit component, not folded into RPC `reconcile_customer_balance`).
 * Sum of `sale_returns` where `credit_status` is `pending` — credit not yet absorbed into invoices.
 */
export function computePendingStandaloneSaleReturns(
  saleReturns: CustomerBalanceCoreSaleReturn[] | undefined,
): number {
  if (!saleReturns?.length) return 0;
  return saleReturns.reduce((sum, sr) => {
    const status = normalizeStatus(sr.credit_status);
    if (status !== "pending") return sum;
    return sum + (Number(sr.net_amount) || 0);
  }, 0);
}

/**
 * Lifetime outstanding — RPC/audit math + documented drift + pending standalone SR.
 */
export function computeCustomerBalanceCore(params: CustomerBalanceCoreParams): CustomerBalanceCoreResult {
  const validSales = filterValidSales(params.sales);
  const adjustmentTotal = Number(params.adjustmentTotal || 0);
  const useLedgerAlignedApps = params.options?.ledgerAlignedApplicationReceipts === true;

  const totalSaleReturnAdjustOnInvoices = validSales.reduce(
    (sum, s) => sum + Number(s.sale_return_adjust || 0),
    0,
  );
  const totalInvoicedGross = validSales.reduce(
    (sum, s) => sum + Number(s.net_amount || 0) + Number(s.sale_return_adjust || 0),
    0,
  );

  const realReceipts = params.voucherEntries.filter((v) => {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
    if (useLedgerAlignedApps) return !isReceiptMemoApplicationLedgerAligned(v);
    return !isAdvanceApplicationVoucher(v);
  });
  const receiptCredits = realReceipts.reduce((sum, v) => sum + voucherCredit(v), 0);

  const creditNoteCredits = params.voucherEntries
    .filter(
      (v) =>
        String(v.voucher_type || "").toLowerCase() === "credit_note" &&
        String(v.reference_type || "").toLowerCase() === "customer",
    )
    .reduce((sum, v) => sum + voucherCredit(v), 0);

  const customerPaymentDebits =
    params.voucherEntries
      .filter(
        (v) =>
          String(v.voucher_type || "").toLowerCase() === "payment" &&
          String(v.reference_type || "").toLowerCase() === "customer",
      )
      .reduce((sum, v) => sum + Math.max(0, Number(v.total_amount) || 0), 0) +
    Math.max(0, Number(params.additionalCustomerPaymentDebits || 0));

  const totalRealPayments = receiptCredits + creditNoteCredits;

  const totalAdvanceReceived = params.customerAdvances.reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0,
  );
  const totalAdvanceUsed = params.customerAdvances.reduce(
    (sum, a) => sum + Number(a.used_amount || 0),
    0,
  );
  const advanceRefundedTotal = params.advanceRefunds.reduce(
    (sum, r) => sum + Number(r.refund_amount || 0),
    0,
  );
  const unusedAdvance = Math.max(0, totalAdvanceReceived - totalAdvanceUsed - advanceRefundedTotal);

  const openingBalance = Number(params.openingBalance || 0);

  const auditFormulaOutstanding =
    openingBalance +
    totalInvoicedGross -
    totalSaleReturnAdjustOnInvoices -
    totalRealPayments -
    customerPaymentDebits -
    totalAdvanceUsed -
    unusedAdvance +
    adjustmentTotal;

  const paidAmountDrift = computePaidAmountDrift(validSales, params.voucherEntries);
  const pendingStandaloneSaleReturns = computePendingStandaloneSaleReturns(params.saleReturns);

  const balance = Math.round(
    auditFormulaOutstanding - paidAmountDrift - pendingStandaloneSaleReturns,
  );

  return {
    balance,
    openingBalance: Math.round(openingBalance),
    totalInvoicedGross: Math.round(totalInvoicedGross),
    totalSaleReturnAdjustOnInvoices: Math.round(totalSaleReturnAdjustOnInvoices),
    totalSalesNet: Math.round(totalInvoicedGross - totalSaleReturnAdjustOnInvoices),
    totalRealPayments: Math.round(totalRealPayments),
    receiptCredits: Math.round(receiptCredits),
    creditNoteCredits: Math.round(creditNoteCredits),
    customerPaymentDebits: Math.round(customerPaymentDebits),
    totalAdvanceUsed: Math.round(totalAdvanceUsed),
    unusedAdvance: Math.round(unusedAdvance),
    advanceRefundedTotal: Math.round(advanceRefundedTotal),
    adjustmentTotal: Math.round(adjustmentTotal),
    paidAmountDrift: Math.round(paidAmountDrift),
    pendingStandaloneSaleReturns: Math.round(pendingStandaloneSaleReturns),
    auditFormulaOutstanding: Math.round(auditFormulaOutstanding),
    components: {
      openingBalance: Math.round(openingBalance),
      balanceAdjustment: Math.round(adjustmentTotal),
      totalInvoicedGross: Math.round(totalInvoicedGross),
      saleReturnAdjustOnInvoices: Math.round(-totalSaleReturnAdjustOnInvoices),
      receiptPayments: Math.round(-receiptCredits),
      creditNoteVouchers: Math.round(-creditNoteCredits),
      customerPaymentRefunds: Math.round(-customerPaymentDebits),
      advancesApplied: Math.round(-totalAdvanceUsed),
      unusedAdvances: Math.round(-unusedAdvance),
      paidAmountDrift: Math.round(-paidAmountDrift),
      pendingStandaloneSaleReturns: Math.round(-pendingStandaloneSaleReturns),
    },
  };
}

/** Sum of RPC-aligned component lines (should match `balance` when inputs match DB). */
export function sumReconcileStyleComponents(c: CustomerBalanceCoreComponents): number {
  return (
    c.openingBalance +
    c.balanceAdjustment +
    c.totalInvoicedGross +
    c.saleReturnAdjustOnInvoices +
    c.receiptPayments +
    c.creditNoteVouchers +
    c.customerPaymentRefunds +
    c.advancesApplied +
    c.unusedAdvances +
    c.paidAmountDrift +
    c.pendingStandaloneSaleReturns
  );
}
