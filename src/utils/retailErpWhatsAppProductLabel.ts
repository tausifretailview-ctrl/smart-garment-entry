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

/**
 * Size cell for Retail ERP invoices (print + WhatsApp PDF).
 * Hide placeholder sizes ("None", "Standard", etc.); print real sizes/IMEI labels only.
 */
export function formatRetailErpInvoiceSize(size?: string | null): string {
  const s = (size || "").replace(/\u00a0/g, " ").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (
    lower === "none" ||
    lower === "standard" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "-" ||
    lower === "--" ||
    lower === "."
  ) {
    return "";
  }
  return s;
}
