/**
 * Trendzo 80mm item text: POS cart names are joined with hyphens
 * (name-style-brand-category). Those hyphens wrap into four stacked rows.
 * Flatten to spaces and keep the barcode on the same phrase.
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
  return `${name}\u00a0${bc}`;
}
