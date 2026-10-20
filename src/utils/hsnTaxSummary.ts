/**
 * HSN-wise tax summary for A4 invoices: one row per HSN + GST rate with
 * taxable value, CGST/SGST (or IGST) and total tax.
 *
 * Line totals on the invoice are before the bill-level discount, while the
 * totals box prints GST after it. Rows are scaled so the summary's total tax
 * equals the tax the bill already prints (targetTax).
 */

import {
  buildInvoiceGstBreakdown,
  roundInvoiceMoney,
  type InvoiceGstLineInput,
} from "@/utils/invoiceGstRateSlabs";

export type HsnTaxSummaryRow = {
  hsn: string;
  gstPercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
};

export type HsnTaxSummary = {
  isInterState: boolean;
  rows: HsnTaxSummaryRow[];
  total: Omit<HsnTaxSummaryRow, "hsn" | "gstPercent">;
};

export function buildHsnTaxSummary(opts: {
  items: InvoiceGstLineInput[];
  taxType?: string | null;
  grandTotal: number;
  saleReturnAdjust?: number;
  isInterState: boolean;
  /** Total GST printed on the bill (CGST + SGST + IGST). */
  targetTax?: number;
}): HsnTaxSummary {
  const breakdown = buildInvoiceGstBreakdown({
    items: opts.items,
    taxType: opts.taxType,
    grandTotal: opts.grandTotal,
    saleReturnAdjust: opts.saleReturnAdjust,
  });

  const rawTax = breakdown.lines.reduce((s, l) => s + l.gst, 0);
  const target = Number(opts.targetTax || 0);
  // Ignore paise rounding gaps; only a real discount gap rescales the rows.
  const scale = rawTax > 0 && target > 0 && Math.abs(target - rawTax) > 0.05 ? target / rawTax : 1;

  const map = new Map<string, { hsn: string; gstPercent: number; taxable: number; tax: number }>();
  breakdown.lines.forEach((line, i) => {
    if (line.gstPercent <= 0 || line.gst <= 0) return;
    const hsn = String(opts.items[i]?.hsn ?? "").trim() || "-";
    const key = `${hsn}|${line.gstPercent}`;
    const cur = map.get(key) || { hsn, gstPercent: line.gstPercent, taxable: 0, tax: 0 };
    cur.taxable += line.taxable * scale;
    cur.tax += line.gst * scale;
    map.set(key, cur);
  });

  const rows: HsnTaxSummaryRow[] = Array.from(map.values()).map((r) => {
    // CGST and SGST are each rounded, like the totals box; total tax is their sum.
    const half = opts.isInterState ? 0 : roundInvoiceMoney(r.tax / 2);
    const igst = opts.isInterState ? roundInvoiceMoney(r.tax) : 0;
    return {
      hsn: r.hsn,
      gstPercent: r.gstPercent,
      taxable: roundInvoiceMoney(r.taxable),
      cgst: half,
      sgst: half,
      igst,
      tax: opts.isInterState ? igst : roundInvoiceMoney(half * 2),
    };
  });

  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "tax") =>
    roundInvoiceMoney(rows.reduce((s, r) => s + r[k], 0));

  return {
    isInterState: opts.isInterState,
    rows,
    total: {
      taxable: sum("taxable"),
      cgst: sum("cgst"),
      sgst: sum("sgst"),
      igst: sum("igst"),
      tax: sum("tax"),
    },
  };
}
