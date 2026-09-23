/** Line 1 = segment before first '-'; line 2 = rest (+ optional notes) on one row. */
export function splitVastrakalaParticulars(
  particulars: string,
  itemNotes?: string,
): { head: string; detailLine: string } {
  const raw = (particulars || "").trim();
  const notes = (itemNotes || "").trim();
  if (!raw) {
    return { head: "", detailLine: notes };
  }
  const dash = raw.indexOf("-");
  if (dash <= 0) {
    return { head: raw, detailLine: notes };
  }
  const head = raw.slice(0, dash).trim();
  // Short prefix before '-' is usually a style code (GC-RAY), not a category (KURTI-GC-RAY).
  if (head.length < 5) {
    return { head: raw, detailLine: notes };
  }
  let detailLine = raw.slice(dash + 1).trim();
  if (notes && !detailLine.includes(notes)) {
    detailLine = detailLine ? `${detailLine} ${notes}` : notes;
  }
  return { head, detailLine };
}

function appendParticularNotes(line: string, itemNotes?: string): string {
  const notes = (itemNotes || "").trim();
  if (!notes || line.includes(notes)) return line;
  return line ? `${line} ${notes}` : notes;
}

/** One line on receipt: style/code (e.g. GC-RAY), not the category prefix (KURTI). */
export function vastrakalaParticularsPrimaryLine(
  particulars: string,
  itemNotes?: string,
): string {
  const raw = (particulars || "").trim();
  if (!raw) return appendParticularNotes("", itemNotes);

  // "KURTI GC-RAY" — category and style separated by space
  const spaceCat = raw.match(/^([A-Za-z][A-Za-z0-9]{1,11})\s+(.+)$/);
  if (spaceCat && /-/.test(spaceCat[2])) {
    return appendParticularNotes(spaceCat[2].trim(), itemNotes);
  }

  const { head, detailLine } = splitVastrakalaParticulars(particulars, itemNotes);
  if (detailLine) return detailLine;
  return appendParticularNotes(head || raw, itemNotes);
}
