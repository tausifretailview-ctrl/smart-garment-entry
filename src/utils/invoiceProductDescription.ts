export type InvoiceDescriptionSequence = "product_first" | "brand_first";

/** Parts the shop can leave off the printed description (product name always prints). */
export type InvoiceDescriptionField = "brand" | "category" | "style" | "color";
export type InvoiceDescriptionFields = Partial<Record<InvoiceDescriptionField, boolean>>;

export const INVOICE_DESCRIPTION_FIELDS: ReadonlyArray<{ key: InvoiceDescriptionField; label: string }> = [
  { key: "category", label: "Category" },
  { key: "style", label: "Style" },
  { key: "brand", label: "Brand" },
  { key: "color", label: "Colour" },
];

/** Settings → Sale `invoice_description_fields`; a part prints unless it is set to false. */
export function readInvoiceDescriptionFields(value: unknown): InvoiceDescriptionFields {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: InvoiceDescriptionFields = {};
  for (const { key } of INVOICE_DESCRIPTION_FIELDS) out[key] = v[key] !== false;
  return out;
}

export interface InvoiceDescriptionParts {
  /** Line text already saved on the bill. Used when the sequence is off. */
  particulars: string;
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
}

function cleanPart(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Tally GST A4 / Wholesale Size-wise A4 description. Off keeps the saved line.
 * On rebuilds it as brand then product name, or product name then the rest, leaving out the
 * parts the shop switched off.
 */
export function formatInvoiceProductDescription(
  parts: InvoiceDescriptionParts,
  options: { enabled: boolean; sequence: InvoiceDescriptionSequence; fields?: InvoiceDescriptionFields },
): string {
  const saved = cleanPart(parts.particulars);
  if (!options.enabled) return saved;

  const on = (key: InvoiceDescriptionField) => options.fields?.[key] !== false;
  const productName = cleanPart(parts.productName);
  const rawBrand = cleanPart(parts.brand);
  if (!productName && !rawBrand) return saved;
  // Without a product name the brand stands in for it, so it is kept.
  const brand = on("brand") || !productName ? rawBrand : "";
  const category = on("category") ? cleanPart(parts.category) : "";
  const style = on("style") ? cleanPart(parts.style) : "";
  const color = on("color") ? cleanPart(parts.color) : "";

  const ordered =
    options.sequence === "brand_first"
      ? [brand, productName, category, style, color]
      : [productName, category, style, brand, color];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of ordered) {
    if (!part || part === "-") continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.length > 0 ? out.join("-") : saved;
}
