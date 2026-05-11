/**
 * Pure helpers for Customer Audit Report — not used by legacy ledger / balance hooks.
 *
 * Extensions vs. bare receipts-only logic:
 * - `isAdvanceApplicationVoucher` also treats `payment_method === 'advance_adjustment'` as advance application.
 * - Customer `credit_note` vouchers (reference_type customer) are included in settlement credits with receipts.
 * - Receipt amounts use total_amount + discount_amount when discount_amount is present (matches voucher entry UI).
 *
 * Phase 1 (Customer Account Statement audit only): pass `{ ledgerAlignedApplicationReceipts: true }` to
 * `computeCustomerOutstanding` / `buildAuditRows` so advance/CN application receipts match
 * {@link customerBalanceUtils} (customer-level sale applications are memo-only, not cash credits).
 */

export const isAdvanceApplicationVoucher = (v: any): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  if (String(v.reference_type || "").toLowerCase() !== "sale") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "advance_adjustment") return true;
  const desc = (v.description || "").toLowerCase().trim();
  return desc.startsWith("adjusted from advance balance");
};

/** Same advance-application detection as `isAdvVoucher` in customerBalanceUtils (any reference_type). */
export const isAdvanceApplicationReceiptLedgerAligned = (v: any): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "advance_adjustment") return true;
  const desc = (v.description || "").toLowerCase();
  return desc.includes("adjusted from advance balance") || desc.includes("advance adjusted");
};

/** Same CN-application detection as `isCnVoucher` in customerBalanceUtils (receipt rows). */
export const isCreditNoteApplicationReceiptLedgerAligned = (v: any): boolean => {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const pm = String(v.payment_method || "").toLowerCase();
  if (pm === "credit_note_adjustment") return true;
  const desc = (v.description || "").toLowerCase();
  return desc.includes("credit note adjusted") || desc.includes("cn adjusted");
};

export const isReceiptMemoApplicationLedgerAligned = (v: any): boolean =>
  isAdvanceApplicationReceiptLedgerAligned(v) || isCreditNoteApplicationReceiptLedgerAligned(v);

export type ComputeCustomerOutstandingOptions = {
  /** When true, exclude advance/CN application receipts from receipt credits (matches CustomerLedgerPage memo rules). */
  ledgerAlignedApplicationReceipts?: boolean;
};

export const computeCustomerOutstanding = (
  params: {
    openingBalance: number;
    sales: Array<{ net_amount: number; sale_return_adjust?: number; payment_status?: string; is_cancelled?: boolean }>;
    voucherEntries: Array<{
      voucher_type: string;
      reference_type: string;
      description: string;
      total_amount: number;
      discount_amount?: number | null;
      payment_method?: string | null;
    }>;
    customerAdvances: Array<{ amount: number; used_amount: number; status: string }>;
    advanceRefunds: Array<{ refund_amount: number }>;
    adjustmentTotal?: number;
  },
  options?: ComputeCustomerOutstandingOptions,
) => {
  const validSales = params.sales.filter(
    (s) =>
      s.is_cancelled !== true &&
      !["cancelled", "hold"].includes(String(s.payment_status || "").toLowerCase()),
  );

  const totalInvoiced = validSales.reduce((sum, s) => sum + Number(s.net_amount || 0), 0);

  const totalSaleReturnAdjust = validSales.reduce(
    (sum, s) => sum + Number(s.sale_return_adjust || 0),
    0,
  );

  const voucherCredit = (v: { total_amount?: number; discount_amount?: number | null }) =>
    Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));

  const useLedgerAlignedApps = options?.ledgerAlignedApplicationReceipts === true;
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

  const customerPaymentDebits = params.voucherEntries
    .filter(
      (v) =>
        String(v.voucher_type || "").toLowerCase() === "payment" &&
        String(v.reference_type || "").toLowerCase() === "customer",
    )
    .reduce((sum, v) => sum + Math.max(0, Number(v.total_amount || 0)), 0);

  const totalRealPayments = receiptCredits + creditNoteCredits;

  const totalAdvanceReceived = params.customerAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const totalAdvanceUsed = params.customerAdvances.reduce((sum, a) => sum + Number(a.used_amount || 0), 0);
  const advanceRefundedTotal = params.advanceRefunds.reduce(
    (sum, r) => sum + Number(r.refund_amount || 0),
    0,
  );
  const unusedAdvance = Math.max(
    0,
    totalAdvanceReceived - totalAdvanceUsed - advanceRefundedTotal,
  );

  const outstanding =
    Number(params.openingBalance || 0) +
    totalInvoiced -
    totalSaleReturnAdjust -
    totalRealPayments -
    customerPaymentDebits -
    totalAdvanceUsed -
    unusedAdvance +
    Number(params.adjustmentTotal || 0);
  // Applied + unused (net of refunds) = customer prepayments that reduce receivables.

  return {
    openingBalance: Number(params.openingBalance || 0),
    totalInvoiced,
    totalSaleReturnAdjust,
    /** Receipts + customer credit notes (settlements excluding advance-application receipts). */
    totalRealPayments,
    receiptCredits,
    creditNoteCredits,
    customerPaymentDebits,
    totalAdvanceReceived,
    totalAdvanceUsed,
    unusedAdvance,
    advanceRefundedTotal,
    adjustmentTotal: Number(params.adjustmentTotal || 0),
    outstanding,
  };
};
