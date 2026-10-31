/**
 * Per-rate GST slabs for invoice print.
 *
 * InvoiceWrapper.calculateGSTBreakup only buckets 5/12/18/28 and then sums
 * CGST/SGST into one blended pair for most A4 templates. Retail ERP / Ezzy A5
 * already regroup by item.gstPercent. This helper is the shared version of that
 * regroup — any gstPercent on the bill becomes its own CGST/SGST (or IGST) row.
 */

import {
  isInterState as classifyInterState,
  normalizeGstTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";

export type InvoiceGstLineInput = {
  total: number;
  gstPercent?: number;
  qty?: number;
  hsn?: string;
  particulars?: string;
  uom?: string;
  size?: string;
  color?: string;
};

export type InvoiceGstLineComputation = {
  gstPercent: number;
  qty: number;
  taxable: number;
  gst: number;
  amount: number;
  unitRate: number;
};

export type InvoiceGstRateSlab = {
  gstPercent: number;
  halfRate: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export function roundInvoiceMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Sale exclusive often stores tax-inclusive line_total (net ≈ Σ lines).
 * POS exclusive stores taxable line_total (net ≈ Σ lines + GST).
 */
export function resolveInvoiceLineTaxMode(opts: {
  taxType?: string | null;
  items: Array<{ total: number; gstPercent?: number }>;
  grandTotal: number;
  saleReturnAdjust?: number;
  /** Bill discount (pre-GST basis on exclusive bills). */
  discount?: number;
}): "inclusive" | "exclusive" | "no_gst" {
  const taxType = normalizeGstTaxType(opts.taxType);
  if (taxType === "no_gst") return "no_gst";
  const linesSum = opts.items.reduce((s, i) => s + Number(i.total || 0), 0);
  if (taxType !== "exclusive") return "inclusive";
  const netTarget = Number(opts.grandTotal || 0) + Number(opts.saleReturnAdjust || 0);
  if (Math.abs(netTarget - linesSum) < 1) return "inclusive";

  // A flat bill discount breaks the simple "net ≈ Σ lines" test. The discount is on
  // the pre-GST basis, so for each reading of the lines work out the net it gives
  // (lines − discount, with GST on the discounted part) and keep the closer one.
  // Sales Invoice exclusive: 6 × ₹230 + 5% lines saved as 241.50 etc (Σ 945),
  // 5% flat disc ₹45 → net 855 + 42.75 = 898, so the lines already hold GST.
  const discount = Number(opts.discount || 0);
  if (discount > 0.005 && linesSum > 0) {
    let embedTaxable = 0;
    let exclAmount = 0;
    for (const i of opts.items) {
      const total = Number(i.total || 0);
      const g = Number(i.gstPercent || 0);
      embedTaxable += g > 0 ? total / (1 + g / 100) : total;
      exclAmount += g > 0 ? total * (1 + g / 100) : total;
    }
    const embedNet = embedTaxable > 0 ? linesSum - discount * (linesSum / embedTaxable) : linesSum;
    const exclNet = exclAmount - discount * (exclAmount / linesSum);
    if (Math.abs(netTarget - embedNet) < Math.abs(netTarget - exclNet)) return "inclusive";
  }
  return "exclusive";
}

export function computeInvoiceGstLine(
  item: InvoiceGstLineInput,
  mode: "inclusive" | "exclusive" | "no_gst",
): InvoiceGstLineComputation {
  const gstPercent = mode === "no_gst" ? 0 : Number(item.gstPercent || 0);
  const qty = Number(item.qty || 0);
  const safeQty = qty > 0 ? qty : 1;
  const lineTotal = Number(item.total || 0);

  if (mode === "no_gst" || gstPercent <= 0) {
    return {
      gstPercent: 0,
      qty,
      taxable: lineTotal,
      gst: 0,
      amount: lineTotal,
      unitRate: lineTotal / safeQty,
    };
  }

  if (mode === "exclusive") {
    const taxable = lineTotal;
    const gst = (taxable * gstPercent) / 100;
    return {
      gstPercent,
      qty,
      taxable,
      gst,
      amount: taxable + gst,
      unitRate: taxable / safeQty,
    };
  }

  const gst = (lineTotal * gstPercent) / (100 + gstPercent);
  const taxable = lineTotal - gst;
  return {
    gstPercent,
    qty,
    taxable,
    gst,
    amount: lineTotal,
    unitRate: taxable / safeQty,
  };
}

export function buildInvoiceGstRateSlabs(
  lines: InvoiceGstLineComputation[],
  opts?: { isInterState?: boolean },
): InvoiceGstRateSlab[] {
  const interState = Boolean(opts?.isInterState);
  const map = new Map<number, InvoiceGstRateSlab>();

  for (const line of lines) {
    if (line.gstPercent <= 0) continue;
    const cur = map.get(line.gstPercent) || {
      gstPercent: line.gstPercent,
      halfRate: line.gstPercent / 2,
      taxable: 0,
      gst: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    cur.taxable += line.taxable;
    cur.gst += line.gst;
    if (interState) {
      cur.igst += line.gst;
    } else {
      cur.cgst += line.gst / 2;
      cur.sgst += line.gst / 2;
    }
    map.set(line.gstPercent, cur);
  }

  return Array.from(map.values())
    .sort((a, b) => a.gstPercent - b.gstPercent)
    .map((slab) => ({
      gstPercent: slab.gstPercent,
      halfRate: slab.halfRate,
      taxable: roundInvoiceMoney(slab.taxable),
      gst: roundInvoiceMoney(slab.gst),
      cgst: roundInvoiceMoney(slab.cgst),
      sgst: roundInvoiceMoney(slab.sgst),
      igst: roundInvoiceMoney(slab.igst),
    }));
}

export function buildInvoiceGstBreakdown(opts: {
  items: InvoiceGstLineInput[];
  taxType?: string | null;
  grandTotal: number;
  saleReturnAdjust?: number;
  sellerGstin?: string | null;
  buyerGstin?: string | null;
  taxTypeHint?: GstTaxType | string | null;
  /** Bill discount; lets an exclusive bill with a flat discount be read correctly. */
  discount?: number;
}): {
  mode: "inclusive" | "exclusive" | "no_gst";
  isInterState: boolean;
  lines: InvoiceGstLineComputation[];
  slabs: InvoiceGstRateSlab[];
  taxableTotal: number;
  taxTotal: number;
} {
  const mode = resolveInvoiceLineTaxMode({
    taxType: opts.taxType ?? opts.taxTypeHint,
    items: opts.items,
    grandTotal: opts.grandTotal,
    saleReturnAdjust: opts.saleReturnAdjust,
    discount: opts.discount,
  });
  const isInterState = classifyInterState(opts.sellerGstin || null, opts.buyerGstin || null);
  const lines = opts.items.map((item) => computeInvoiceGstLine(item, mode));
  const slabs = buildInvoiceGstRateSlabs(lines, { isInterState });
  const taxableTotal = roundInvoiceMoney(lines.reduce((s, l) => s + l.taxable, 0));
  const taxTotal = roundInvoiceMoney(lines.reduce((s, l) => s + l.gst, 0));
  return { mode, isInterState, lines, slabs, taxableTotal, taxTotal };
}

export function formatGstHalfRateLabel(gstPercent: number): string {
  return `${(gstPercent / 2).toFixed(1)}%`;
}
