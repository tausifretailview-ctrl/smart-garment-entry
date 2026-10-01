import {
  PREPRINTED_LETTERHEAD_TEMPLATES,
  isPosSaleDocument,
  resolvePosInvoiceTemplate,
  resolvePrintLogoOnPreprintedLetterhead,
  resolveSaleInvoiceTemplate,
} from "@/utils/invoicePrintFormat";

const CN_EPSILON = 0.5;

export interface SaleReturnPrintRedeemedBill {
  saleNumber: string;
  amount: number;
}

export type SaleReturnCreditPrintState =
  | "pending"
  | "partially_adjusted"
  | "adjusted"
  | "refunded";

export interface SaleReturnCreditPrintInfo {
  state: SaleReturnCreditPrintState;
  /** Uppercase heading shown on the print (e.g. "PENDING"). */
  label: string;
  creditAmount: number;
  adjustedAmount: number;
  balanceAmount: number;
  redeemedBills: SaleReturnPrintRedeemedBill[];
}

export interface SaleReturnCreditPrintInput {
  net_amount: number;
  refund_type?: string | null;
  credit_status?: string | null;
  /** Live spendable CN amount (same value the dashboard uses for Refund / Adjust). */
  availableAmount: number;
  actual_adjusted_amt?: number | null;
  redeemedBills?: SaleReturnPrintRedeemedBill[];
}

/**
 * CN status block for the sale-return print: pending (unused), partially adjusted or adjusted.
 * Cash-refund vouchers are not credit notes, so they get no block.
 */
export function buildSaleReturnCreditPrintInfo(
  input: SaleReturnCreditPrintInput,
): SaleReturnCreditPrintInfo | null {
  if (input.refund_type === "cash_refund") return null;

  const net = Math.max(0, Number(input.net_amount) || 0);
  const redeemedBills = (input.redeemedBills ?? []).filter((b) => b.saleNumber);

  if (input.credit_status === "refunded") {
    return {
      state: "refunded",
      label: "REFUNDED TO CUSTOMER",
      creditAmount: net,
      adjustedAmount: 0,
      balanceAmount: 0,
      redeemedBills,
    };
  }

  if (input.credit_status === "adjusted_outstanding") {
    return {
      state: "adjusted",
      label: "ADJUSTED",
      creditAmount: net,
      adjustedAmount: net,
      balanceAmount: 0,
      redeemedBills,
    };
  }

  const available = Math.min(net, Math.max(0, Number(input.availableAmount) || 0));
  const reportedAdjusted = Math.max(0, Number(input.actual_adjusted_amt) || 0);
  const adjusted = Math.min(net, Math.max(reportedAdjusted, net - available));

  let state: SaleReturnCreditPrintState;
  if (adjusted <= CN_EPSILON) state = "pending";
  else if (net - adjusted <= CN_EPSILON || available <= CN_EPSILON) state = "adjusted";
  else state = "partially_adjusted";

  const label =
    state === "pending" ? "PENDING" : state === "adjusted" ? "ADJUSTED" : "PARTIALLY ADJUSTED";

  return {
    state,
    label,
    creditAmount: net,
    adjustedAmount: state === "pending" ? 0 : adjusted,
    balanceAmount: state === "adjusted" ? 0 : available,
    redeemedBills,
  };
}

/**
 * Shop logo on the return print. Preprinted-letterhead templates already carry the
 * letterhead, so the logo stays off unless the org opted in (same rule as invoices).
 */
export function shouldShowSaleReturnLogo(opts: {
  logoUrl?: string | null;
  originalSaleNumber?: string | null;
  saleSettings?: {
    invoice_template?: string | null;
    pos_invoice_template?: string | null;
    print_logo_on_preprinted_letterhead?: boolean | null;
  } | null;
}): boolean {
  if (!String(opts.logoUrl || "").trim()) return false;
  const fromPos =
    !opts.originalSaleNumber || isPosSaleDocument({ sale_number: opts.originalSaleNumber });
  const template = fromPos
    ? resolvePosInvoiceTemplate(opts.saleSettings)
    : resolveSaleInvoiceTemplate(opts.saleSettings);
  if (PREPRINTED_LETTERHEAD_TEMPLATES.has(template)) {
    return resolvePrintLogoOnPreprintedLetterhead(opts.saleSettings);
  }
  return true;
}
