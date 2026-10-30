import { aggregateInclusiveLines, splitGstTotal, type GstBreakdown } from "@/utils/accounting/gstBreakdown";

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

/**
 * Split the counter tender of a sale between Cash in Hand and Bank.
 *
 * Only a Mix (`multiple`) bill is split: its `cash_amount` is the cash actually applied
 * at the counter, the rest (UPI / card / cheque / transfer) went to the bank. Every other
 * method keeps its single cash-or-bank routing, so the whole tender is returned as `other`.
 */
export function splitMixCounterTender(params: {
  paymentMethod: string | null | undefined;
  counterPaid: number;
  cashAmount: number | null | undefined;
}): { cash: number; other: number } {
  const paid = round2(Math.max(0, Number(params.counterPaid || 0)));
  const pm = String(params.paymentMethod || "").toLowerCase().trim();
  if (pm !== "multiple") return { cash: 0, other: paid };
  const cash = round2(Math.min(paid, Math.max(0, Number(params.cashAmount || 0))));
  return { cash, other: round2(paid - cash) };
}

export type SaleDiscountLine = {
  unit_price?: number | null;
  mrp?: number | null;
  quantity?: number | null;
  line_total?: number | null;
  gst_percent?: number | null;
};

/**
 * Header `discount_amount` that is not already inside the line totals or the flat discount.
 *
 * Line totals are net of every line-level discount. POS saves the header discount against
 * MRP (percent + amount + "selling rate below MRP"), Sales Invoice against the selling rate,
 * and POS Delivery Challan stores the flat discount there. Measuring the line discounts
 * against the higher of MRP and rate, and taking the flat discount off the header, leaves
 * only a discount that no other line of the journal carries. Booking more than that debited
 * Trade Discount twice and pushed the same amount into Round Off.
 */
export function saleOrphanHeaderDiscount(
  items: SaleDiscountLine[],
  headerDiscount: number | null | undefined,
  flatDiscount: number | null | undefined,
  opts: { taxType?: string | null; saleType?: string | null } = {},
): number {
  // GST-exclusive bills other than POS add GST into line_total while the rate is pre-tax
  // (same rule as computeSaleRevenueBreakdown), so compare the rate with the pre-tax line.
  const taxType = String(opts.taxType || "inclusive").toLowerCase();
  const lineTotalHasGstOnTop = taxType === "exclusive" && String(opts.saleType || "").toLowerCase() !== "pos";
  const inLines = items.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 0);
    const rate = Math.max(Number(item.unit_price ?? 0), Number(item.mrp ?? 0));
    const gstRate = Math.max(0, Number(item.gst_percent ?? 0));
    const lineTotal = Number(item.line_total ?? 0) / (lineTotalHasGstOnTop ? 1 + gstRate / 100 : 1);
    return sum + Math.max(0, round2(rate * qty) - round2(lineTotal));
  }, 0);
  return round2(
    Math.max(0, Number(headerDiscount ?? 0) - round2(inLines) - Math.max(0, Number(flatDiscount ?? 0))),
  );
}

export type SaleReturnGstInput = {
  netAmount: number;
  headerGst: number;
  items: Array<{ line_total?: number | null; gst_percent?: number | null }>;
};

/**
 * Taxable value and GST of a sale return.
 *
 * GST-exclusive returns save line totals before tax and GST on the header
 * (net = Σ line_total + gst_amount). Backing GST out of those pre-tax lines as if they were
 * tax-inclusive under-reversed output GST. When the header shows that shape, use its GST;
 * otherwise the lines are tax-inclusive and GST is extracted from each line.
 */
export function saleReturnGstBreakdown(input: SaleReturnGstInput): GstBreakdown {
  const net = round2(input.netAmount);
  const headerGst = round2(Math.max(0, Number(input.headerGst || 0)));
  const lineSum = round2(input.items.reduce((s, i) => s + Number(i.line_total ?? 0), 0));
  const linesArePreTax =
    input.items.length > 0 && headerGst > 0.005 && headerGst < net && Math.abs(lineSum + headerGst - net) <= 1;
  if (linesArePreTax) {
    return { taxableAmount: round2(net - headerGst), totalGst: headerGst, ...splitGstTotal(headerGst) };
  }
  return aggregateInclusiveLines(
    input.items.map((i) => ({ line_total: Number(i.line_total ?? 0), gst_percent: i.gst_percent })),
  );
}
