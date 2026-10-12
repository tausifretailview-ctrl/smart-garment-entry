/**
 * Trendzo 80mm item text: POS cart names are joined with hyphens
 * (name-style-brand-category). Those hyphens wrap into four stacked rows.
 * Flatten to spaces and keep the barcode on the same phrase. A plain space (not a
 * no-break space) joins the barcode: gluing it to the last word made one long "word"
 * that the narrow ITEM column split mid-barcode ("BLACK 15001256" / "5").
 */
export function formatTrendzoThermalItemLine(
  particulars: string,
  barcode?: string | null,
): string {
  const name = String(particulars || "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bc = String(barcode || "").trim();
  if (!name) return bc;
  if (!bc) return name;
  if (name.includes(bc)) return name;
  return `${name} ${bc}`;
}
