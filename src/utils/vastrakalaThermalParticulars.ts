/**
 * Vastrakala 80mm thermal — particulars split for a 2-line print block.
 *
 * Line 1 sits in the narrow column before QTY (single line, no wrap).
 * Line 2 spans the wide band through MRP (before AMOUNT) for the remainder
 * plus optional pack notes (e.g. "3 PC").
 */

function splitBeforeQtyColumn(text: string, maxLine1Chars: number): { head: string; tail: string } {
  const t = text.trim();
  if (!t || t.length <= maxLine1Chars) return { head: t, tail: "" };
  let breakAt = t.lastIndexOf(" ", maxLine1Chars);
  if (breakAt <= 0) breakAt = t.lastIndexOf("-", maxLine1Chars);
  if (breakAt <= 0) breakAt = maxLine1Chars;
  return {
    head: t.slice(0, breakAt).trim(),
    tail: t.slice(breakAt).trim(),
  };
}

export function vastrakalaParticularsLines(
  particulars: string,
  itemNotes?: string,
  opts?: { narrowMaxChars?: number },
): { line1: string; line2: string } {
  const maxLine1 = opts?.narrowMaxChars ?? 24;
  const full = (particulars || "").trim();
  const notes = (itemNotes || "").trim();

  if (!full) return { line1: "", line2: notes };

  const { head, tail } = splitBeforeQtyColumn(full, maxLine1);
  const noteExtra = notes && !full.includes(notes) ? notes : "";
  const tailParts = [tail, noteExtra].filter(Boolean).join(" ").trim();

  if (!tailParts) return { line1: head, line2: "" };
  return { line1: head, line2: tailParts };
}

/** Per-item discount vs MRP (MRP × qty − line total). Null when the line has no discount. */
export function vastrakalaLineDiscount(item: { mrp?: number; qty: number; total: number }) {
  const mrp = Number(item.mrp) || 0;
  const gross = mrp * (Number(item.qty) || 0);
  const amount = gross - (Number(item.total) || 0);
  if (mrp <= 0 || gross <= 0 || amount < 0.5) return null;
  const pct = (amount / gross) * 100;
  const percentLabel = Math.abs(pct - Math.round(pct)) < 0.05 ? String(Math.round(pct)) : pct.toFixed(1);
  return { mrp, amount, percentLabel };
}
