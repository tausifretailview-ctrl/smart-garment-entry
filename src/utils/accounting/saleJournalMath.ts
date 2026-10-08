import { splitGstTotal, type GstBreakdown } from "@/utils/accounting/gstBreakdown";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Sale returns created from this instant credit the customer (Accounts Receivable) for every
 * refund type that is not paid out, exchange included, and a sale's S/R adjust consumes that
 * credit (Dr Accounts Receivable). Documents created earlier keep the old posting so a re-post
 * of an old bill cannot double-count a return whose own journal was never written (old
 * exchange returns posted nothing; their sale's S/R adjust line debited Sales Returns).
 */
export const RETURN_CREDIT_VIA_RECEIVABLE_FROM = "2026-10-10T00:00:00+05:30";

export function isOnOrAfterReturnCreditCutover(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  const t = Date.parse(String(createdAt));
  if (Number.isNaN(t)) return true;
  return t >= Date.parse(RETURN_CREDIT_VIA_RECEIVABLE_FROM);
}

export type SaleGstLine = {
  line_total?: number | null;
  gst_percent?: number | null;
};

export type SaleRevenueBreakdown = {
  /** Taxable value before the bill-level (flat) discount. */
  grossTaxable: number;
  /** Taxable value of the flat discount (Dr Trade Discount). */
  flatDiscountTaxable: number;
  /** Output GST on the discounted value. */
  gst: GstBreakdown;
};

/**
 * Revenue and output GST for a sale from its lines.
 *
 * - POS bills with GST-exclusive pricing store `line_total` before tax (GST is added on top);
 *   every other bill stores it tax-inclusive (Sales Invoice "exclusive" bills add GST into
 *   line_total). See computePosBillTotals / SalesInvoice calculateLineTotal.
 * - The flat bill discount is shared across lines by line value and GST is charged on the
 *   discounted value (computePosBillGst, SalesInvoice totalGST), so output GST matches the bill
 *   and GSTR. On exclusive bills the flat discount is a pre-tax amount; on inclusive bills it
 *   includes tax.
 */
export function computeSaleRevenueBreakdown(
  items: SaleGstLine[],
  opts: { taxType?: string | null; saleType?: string | null; flatDiscount?: number | null },
): SaleRevenueBreakdown {
  const taxType = String(opts.taxType || "inclusive").toLowerCase();
  const exclusive = taxType === "exclusive";
  const lineTotalIsPreTax = exclusive && String(opts.saleType || "").toLowerCase() === "pos";
  const noGst = taxType === "no_gst";

  const lines = items.map((item) => {
    const lineTotal = Math.max(0, Number(item.line_total ?? 0));
    const rate = noGst ? 0 : Math.max(0, Number(item.gst_percent ?? 0));
    const taxable = lineTotalIsPreTax ? lineTotal : lineTotal / (1 + rate / 100);
    // Value the flat discount is shared on, in the same terms as the discount itself.
    const discountBase = exclusive ? taxable : lineTotal;
    return { rate, taxable, discountBase };
  });
  const baseSum = lines.reduce((s, l) => s + l.discountBase, 0);
  const flat = round2(Math.max(0, Math.min(Number(opts.flatDiscount ?? 0), baseSum)));

  let grossTaxable = 0;
  let flatDiscountTaxable = 0;
  let totalGst = 0;
  for (const line of lines) {
    const share = baseSum > 0 ? (line.discountBase / baseSum) * flat : 0;
    const shareTaxable = exclusive ? share : share / (1 + line.rate / 100);
    grossTaxable += line.taxable;
    flatDiscountTaxable += shareTaxable;
    totalGst += ((line.taxable - shareTaxable) * line.rate) / 100;
  }

  const gstTotal = round2(totalGst);
  return {
    grossTaxable: round2(grossTaxable),
    flatDiscountTaxable: round2(flatDiscountTaxable),
    gst: {
      taxableAmount: round2(grossTaxable - flatDiscountTaxable),
      totalGst: gstTotal,
      ...splitGstTotal(gstTotal),
    },
  };
}

/**
 * Part of `sales.paid_amount` that is counter tender taken on the bill itself.
 *
 * paid_amount (compute_sale_settlement) also includes later receipts and credit-note
 * applications beyond the S/R adjust. Receipts that carry their own journal already debit
 * Cash/Bank and credit Receivable; a credit note was credited to Receivable by its return.
 * Re-posting the sale with the full paid_amount as cash would count that money twice.
 */
export function counterTenderInSaleJournal(params: {
  paidAmount: number;
  journaledReceiptTotal: number;
  creditNoteVoucherTotal: number;
  saleReturnAdjust: number;
}): number {
  const genuineCreditNote = Math.max(0, params.creditNoteVoucherTotal - params.saleReturnAdjust);
  return round2(
    Math.max(0, Number(params.paidAmount || 0) - params.journaledReceiptTotal - genuineCreditNote),
  );
}
