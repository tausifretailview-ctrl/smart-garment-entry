/**
 * Krunal A4 — tax invoice laid out like the KRUNAL ENTERPRISES bill book:
 * Sl No · Item Description · HSN/SAC · Qty · Unit · Basic Rate · Gross Amount · Dis % · Dis. Amount ·
 * IGST (or CGST+SGST) Tax Per / Tax Amount · Amount. Printed as an ORIGINAL FOR RECIPIENT and a
 * DUPLICATE FOR SUPPLIER copy; every page repeats the shop header and Bill To / Ship To.
 *
 * Pure maths for the template (tested on its own).
 */
import { normalizeGstTaxType, getStateFromGSTIN } from "@/utils/gstRegisterUtils";
import {
  buildInvoiceGstBreakdown,
  roundInvoiceMoney,
  type InvoiceGstRateSlab,
} from "@/utils/invoiceGstRateSlabs";

export const KRUNAL_A4_COPY_LABELS = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR SUPPLIER"] as const;

export type KrunalItemInput = {
  particulars: string;
  size?: string | null;
  color?: string | null;
  hsn?: string | null;
  qty: number;
  rate: number;
  total: number;
  gstPercent?: number;
  discountPercent?: number;
  uom?: string | null;
};

export type KrunalLine = {
  sr: number;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  /** Rate before discount and before GST. */
  basicRate: number;
  /** Qty × Basic Rate. */
  gross: number;
  discPct: number;
  discAmt: number;
  /** Gross − discount (before GST). */
  taxable: number;
  taxPct: number;
  taxAmt: number;
  /** Taxable + GST. */
  amount: number;
};

export type KrunalTotals = {
  qty: number;
  gross: number;
  lineDiscount: number;
  taxable: number;
  tax: number;
  amount: number;
};

/** "KIDZELLO 1881 (12-30) OLIVE": size and colour once, even if the name already has them. */
export function krunalItemDescription(item: Pick<KrunalItemInput, "particulars" | "size" | "color">): string {
  let text = String(item.particulars || "").trim();
  const lower = () => text.toLowerCase();
  const size = String(item.size || "").trim();
  const color = String(item.color || "").trim();
  if (size && !/^(free|none|-)$/i.test(size) && !lower().includes(size.toLowerCase())) text += ` (${size})`;
  if (color && !lower().includes(color.toLowerCase())) text += ` ${color}`;
  return text;
}

/** "Maharashtra [27]" from a GSTIN; "" when there is none. */
export function krunalStateLabel(gstin?: string | null): string {
  const { name, code } = getStateFromGSTIN(gstin);
  if (name && code) return `${name} [${code}]`;
  return code || "";
}

const money = (n: number) => roundInvoiceMoney(n);

/**
 * Line columns. Taxable / GST come from the shared breakdown (same reading of inclusive and
 * exclusive bills as the other A4 formats); Basic Rate and Gross are the rate before discount,
 * taken out of GST when the bill's prices include it; the discount is Gross − Taxable.
 */
export function computeKrunalLines(
  items: readonly KrunalItemInput[],
  opts: {
    taxType?: string | null;
    grandTotal: number;
    saleReturnAdjust?: number;
    discount?: number;
    sellerGstin?: string | null;
    buyerGstin?: string | null;
  },
): { lines: KrunalLine[]; slabs: InvoiceGstRateSlab[]; isInterState: boolean; totals: KrunalTotals } {
  const billTaxType = normalizeGstTaxType(opts.taxType);
  const breakdown = buildInvoiceGstBreakdown({
    items: items.map((i) => ({ total: Number(i.total) || 0, gstPercent: i.gstPercent, qty: i.qty })),
    taxType: opts.taxType,
    grandTotal: opts.grandTotal,
    saleReturnAdjust: opts.saleReturnAdjust,
    discount: opts.discount,
    sellerGstin: opts.sellerGstin,
    buyerGstin: opts.buyerGstin,
  });

  const lines = items.map((item, i): KrunalLine => {
    const calc = breakdown.lines[i];
    const qty = Number(item.qty) || 0;
    const taxPct = calc.gstPercent;
    const taxable = calc.taxable;
    // The rate on the bill is in the bill's own mode: a GST-inclusive price on inclusive bills.
    const rate = Number(item.rate) || 0;
    const rateBeforeTax = billTaxType === "inclusive" && taxPct > 0 ? rate / (1 + taxPct / 100) : rate;
    let gross = rateBeforeTax * qty;
    // A line priced below its rate (or with no rate) never shows a negative discount.
    if (!(gross > taxable)) gross = taxable;
    const discAmt = gross - taxable;
    const discPct =
      Number(item.discountPercent) > 0
        ? Number(item.discountPercent)
        : gross > 0
          ? (discAmt / gross) * 100
          : 0;
    return {
      sr: i + 1,
      description: krunalItemDescription(item),
      hsn: String(item.hsn || "").trim(),
      qty,
      unit: String(item.uom || "").trim() || "Pcs",
      basicRate: money(qty > 0 ? gross / qty : gross),
      gross: money(gross),
      discPct: Math.round(discPct * 100) / 100,
      discAmt: money(discAmt),
      taxable: money(taxable),
      taxPct,
      taxAmt: money(calc.gst),
      amount: money(calc.amount),
    };
  });

  const sum = (pick: (l: KrunalLine) => number) => money(lines.reduce((s, l) => s + pick(l), 0));
  return {
    lines,
    slabs: breakdown.slabs,
    isInterState: breakdown.isInterState,
    totals: {
      qty: lines.reduce((s, l) => s + l.qty, 0),
      gross: sum((l) => l.gross),
      lineDiscount: sum((l) => l.discAmt),
      taxable: sum((l) => l.taxable),
      tax: sum((l) => l.taxAmt),
      amount: sum((l) => l.amount),
    },
  };
}

/** Item rows: ~5.2 mm for one line of description, +3.8 mm per extra wrapped line (≈34 chars). */
export function estimateKrunalRowMm(description: string): number {
  const lines = Math.max(1, Math.ceil(String(description || "").length / 34));
  return 5.2 + (lines - 1) * 3.8;
}

/** "RUPEES NINETY EIGHT THOUSAND FOUR HUNDRED SEVENTEEN ONLY". */
export function krunalAmountInWords(amount: number): string {
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE",
    "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  const two = (n: number): string => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n: number): string =>
    n >= 100 ? `${ones[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${two(n % 100)}` : ""}` : two(n);
  const words = (n: number): string => {
    if (n === 0) return "ZERO";
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${crore >= 100 ? words(crore) : two(crore)} CRORE`);
    if (lakh) parts.push(`${two(lakh)} LAKH`);
    if (thousand) parts.push(`${two(thousand)} THOUSAND`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const abs = Math.abs(roundInvoiceMoney(amount));
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  const text = `RUPEES ${words(rupees)}${paise ? ` AND ${two(paise)} PAISE` : ""} ONLY`;
  return amount < 0 ? `MINUS ${text}` : text;
}
