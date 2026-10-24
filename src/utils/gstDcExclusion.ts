/**
 * DC (No GST) lines stay out of the GST reports.
 *
 * A DC line is a sale / sale-return line of a product bought on a "DC Purchase (No GST)"
 * bill (`is_dc_item`). A bill whose lines are all DC is left out of the GST registers;
 * a mixed bill keeps only its non-DC lines.
 */

export type DcFlaggedLine = { is_dc_item?: boolean | null };

export function isDcLine(line: DcFlaggedLine | null | undefined): boolean {
  return line?.is_dc_item === true;
}

/** True when the bill has lines and every one of them is a DC line. */
export function isAllDcDocument(lines: readonly DcFlaggedLine[] | null | undefined): boolean {
  return !!lines && lines.length > 0 && lines.every(isDcLine);
}

export function withoutDcLines<T extends DcFlaggedLine>(lines: readonly T[] | null | undefined): T[] {
  return (lines || []).filter((l) => !isDcLine(l));
}

/** Ids of bills whose lines are all DC. `idKey` is the line's bill / return id column. */
export function allDcDocumentIds<T extends DcFlaggedLine>(
  lines: readonly T[] | null | undefined,
  idKey: keyof T,
): Set<string> {
  const byDoc = new Map<string, boolean>();
  for (const line of lines || []) {
    const id = String(line[idKey] ?? "");
    if (!id) continue;
    byDoc.set(id, (byDoc.get(id) ?? true) && isDcLine(line));
  }
  const out = new Set<string>();
  byDoc.forEach((allDc, id) => {
    if (allDc) out.add(id);
  });
  return out;
}

type ReturnLine = DcFlaggedLine & {
  line_total?: number | string | null;
  gst_percent?: number | string | null;
};

/**
 * Sale return header amounts without the DC lines.
 * Net is reduced by the DC share of line totals, GST by the DC share of line GST
 * (line GST read as tax-inclusive, the ratio is the same for exclusive bills).
 * Returns null when every line is DC (leave the return out). No lines / no DC: unchanged.
 */
export function saleReturnAmountsWithoutDc(
  header: { net_amount?: number | null; gst_amount?: number | null },
  lines: readonly ReturnLine[] | null | undefined,
): { net_amount: number; gst_amount: number } | null {
  const net = Number(header.net_amount) || 0;
  const gst = Number(header.gst_amount) || 0;
  const all = lines || [];
  if (all.length === 0 || !all.some(isDcLine)) return { net_amount: net, gst_amount: gst };
  if (isAllDcDocument(all)) return null;

  let totalAll = 0;
  let totalKeep = 0;
  let gstAll = 0;
  let gstKeep = 0;
  for (const line of all) {
    const lt = Number(line.line_total) || 0;
    const rate = Number(line.gst_percent) || 0;
    const lineGst = rate > 0 ? (lt * rate) / (100 + rate) : 0;
    totalAll += lt;
    gstAll += lineGst;
    if (!isDcLine(line)) {
      totalKeep += lt;
      gstKeep += lineGst;
    }
  }
  const netShare = totalAll > 0 ? totalKeep / totalAll : 1;
  const gstShare = gstAll > 0 ? gstKeep / gstAll : netShare;
  return {
    net_amount: Math.round(net * netShare * 100) / 100,
    gst_amount: Math.round(gst * gstShare * 100) / 100,
  };
}

/** True when a query failed only because `is_dc_item` is not on the table yet (SQL not run). */
export function isMissingDcColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42703" || /is_dc_item/i.test(String(e.message || ""));
}
