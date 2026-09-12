/**
 * Trendzo 80mm item column: product details + barcode on one line.
 * POS names are joined as name-style-brand-category (hyphens). Those hyphens
 * wrap into 4 rows under word-break, which wastes thermal paper.
 */

export function formatTrendzoThermalItemLine(
  particulars: string,
  barcode?: string | null,
): string {
  const name = String(particulars || "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bc = String(barcode || "").trim();
  if (!name) return bc;
  if (!bc) return name;
  if (name.includes(bc)) return name;
  return `${name} ${bc}`;
}
