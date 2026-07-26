/**
 * Short label for Retail ERP WhatsApp PDF description cells.
 * POS cart often stores productName as name-category-style-brand-color;
 * WhatsApp PDF should show only the product name field.
 */
export function retailErpWhatsAppProductLabel(
  particulars: string,
  productNameOnly?: string | null,
): string {
  const explicit = (productNameOnly || "").trim();
  if (explicit) return explicit;
  const full = (particulars || "").replace(/\u00a0/g, " ").trim();
  if (!full) return "";
  // Join convention in POSSales: product_name-category-style-brand-color
  const first = full.split("-")[0]?.trim();
  return first || full;
}
