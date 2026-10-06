export type InvoiceDescriptionSequence = "product_first" | "brand_first";

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
 * Tally GST A4 description. Off keeps the saved line.
 * On rebuilds it as brand then product name, or product name then the rest.
 */
export function formatInvoiceProductDescription(
  parts: InvoiceDescriptionParts,
  options: { enabled: boolean; sequence: InvoiceDescriptionSequence },
): string {
  const saved = cleanPart(parts.particulars);
  if (!options.enabled) return saved;

  const productName = cleanPart(parts.productName);
  const brand = cleanPart(parts.brand);
  const category = cleanPart(parts.category);
  const style = cleanPart(parts.style);
  const color = cleanPart(parts.color);
  if (!productName && !brand) return saved;

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
