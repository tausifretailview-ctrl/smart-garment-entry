/**
 * Vastrakala 80mm thermal — particulars line splitting.
 *
 * Reference (shop's earlier POS print): the FULL product name prints on line 1
 * and wraps naturally, with the set/piece note (e.g. "3 PC") on line 2 — never
 * truncated with "..." and never stripped of its style-code prefix.
 *
 * So line 1 is always the complete `particulars` text; line 2 is `itemNotes`
 * only when it adds information not already contained in line 1. Both lines
 * wrap via CSS (`overflow-wrap: anywhere`) inside the 80mm grid column.
 */
export function vastrakalaParticularsLines(
  particulars: string,
  itemNotes?: string,
): { line1: string; line2: string } {
  const line1 = (particulars || "").trim();
  const notes = (itemNotes || "").trim();
  if (!line1) return { line1: "", line2: notes };
  if (!notes || line1.includes(notes)) return { line1, line2: "" };
  return { line1, line2: notes };
}
