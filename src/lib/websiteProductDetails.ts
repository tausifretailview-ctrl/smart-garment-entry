import type { PublicStorefrontProduct } from "@/lib/websiteTypes";

/**
 * Website-only product details (name shown on the store, description on the
 * product page). They live on website_products, not on the ERP product master,
 * so editing them never changes bills, barcodes or stock reports.
 */

export const WEBSITE_NAME_MAX = 120;
export const WEBSITE_DESCRIPTION_MAX = 2000;

export type WebsiteProductDetails = {
  display_name: string | null;
  description: string | null;
};

export function cleanWebsiteName(value: string | null | undefined): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, WEBSITE_NAME_MAX);
  return text || null;
}

export function cleanWebsiteDescription(value: string | null | undefined): string | null {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, WEBSITE_DESCRIPTION_MAX);
  return text || null;
}

/** True when the display_name / description columns have not been added yet. */
export function isMissingWebsiteDetailsColumns(message: string | null | undefined): boolean {
  const text = String(message || "");
  return /(display_name|description)/i.test(text) && /(column|schema cache|PGRST204|42703)/i.test(text);
}

/**
 * Overlay website name + description onto the public payload's products,
 * keyed by website_products.id. The ERP name is kept as erp_name so the
 * store can still derive a style code from it.
 */
export function applyWebsiteProductDetails(
  products: PublicStorefrontProduct[],
  rows: Array<{ id: string; display_name?: string | null; description?: string | null }>,
): PublicStorefrontProduct[] {
  if (rows.length === 0) return products;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return products.map((product) => {
    const row = byId.get(product.id);
    if (!row) return product;
    const name = cleanWebsiteName(row.display_name);
    const description = cleanWebsiteDescription(row.description);
    if (!name && !description) return product;
    return {
      ...product,
      erp_name: product.erp_name ?? product.name,
      name: name ?? product.name,
      description: description ?? product.description ?? null,
    };
  });
}
