const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type GstBreakdown = {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
};

/** GST embedded in a tax-inclusive line (Indian GST % on line). */
export function gstFromInclusiveLine(lineTotal: number, gstPercent: number): { taxable: number; gst: number } {
  const total = round2(lineTotal);
  const pct = Number(gstPercent) || 0;
  if (total <= 0 || pct <= 0) return { taxable: total, gst: 0 };
  const taxable = round2(total / (1 + pct / 100));
  return { taxable, gst: round2(total - taxable) };
}

/** Split total GST into CGST/SGST (intra-state). IGST reserved for future inter-state rules. */
export function splitGstTotal(totalGst: number, useIgst = false): Pick<GstBreakdown, "cgst" | "sgst" | "igst"> {
  const gst = round2(Math.max(0, totalGst));
  if (gst <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (useIgst) return { cgst: 0, sgst: 0, igst: gst };
  const half = round2(gst / 2);
  const other = round2(gst - half);
  return { cgst: half, sgst: other, igst: 0 };
}

export function aggregateInclusiveLines(
  lines: Array<{ line_total: number; gst_percent?: number | null; gst_per?: number | null }>
): GstBreakdown {
  let taxableAmount = 0;
  let totalGst = 0;
  for (const row of lines) {
    const gstPct = Number(row.gst_percent ?? row.gst_per ?? 0);
    const { taxable, gst } = gstFromInclusiveLine(Number(row.line_total ?? 0), gstPct);
    taxableAmount = round2(taxableAmount + taxable);
    totalGst = round2(totalGst + gst);
  }
  const split = splitGstTotal(totalGst);
  return {
    taxableAmount,
    totalGst,
    ...split,
  };
}

/** Purchase bill header GST (single total) → CGST/SGST split. */
export function breakdownPurchaseHeaderGst(gstAmount: number): GstBreakdown {
  const totalGst = round2(Math.max(0, gstAmount));
  const split = splitGstTotal(totalGst);
  return {
    taxableAmount: 0,
    totalGst,
    ...split,
  };
}

/** When only header gross + gst are known (returns), derive taxable. */
export function breakdownFromGrossAndGst(grossAmount: number, gstAmount: number): GstBreakdown {
  const gst = breakdownPurchaseHeaderGst(gstAmount);
  const gross = round2(grossAmount);
  const taxableAmount = round2(Math.max(0, gross - gst.totalGst));
  return { ...gst, taxableAmount };
}
