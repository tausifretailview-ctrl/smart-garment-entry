import { websiteFrom } from "@/lib/websiteDb";

export type WebsiteSendProduct = { product_id: string; default_sale_price?: number | null };

type ExistingListing = { product_id: string; variant_id?: string | null; display_order?: number | null };

/**
 * Rows to add when products are sent from the Product Dashboard to the website.
 * They go in switched off: the owner checks photo, price and section in
 * Website → Catalogue and turns each one on to publish it. A product already on
 * the website is left exactly as it is.
 */
export function planWebsiteSend(
  orgId: string,
  existing: ExistingListing[],
  selected: WebsiteSendProduct[],
): { rows: Array<Record<string, unknown>>; already: number } {
  const listed = new Set(existing.filter((row) => !row.variant_id).map((row) => row.product_id));
  const maxOrder = existing.reduce((max, row) => Math.max(max, Number(row.display_order) || 0), 0);
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let already = 0;
  for (const product of selected) {
    if (!product.product_id || seen.has(product.product_id)) continue;
    seen.add(product.product_id);
    if (listed.has(product.product_id)) {
      already += 1;
      continue;
    }
    const price = Number(product.default_sale_price);
    rows.push({
      organization_id: orgId,
      product_id: product.product_id,
      variant_id: null,
      display_price: Number.isFinite(price) && price > 0 ? price : null,
      display_order: maxOrder + rows.length + 1,
      is_active: false,
    });
  }
  return { rows, already };
}

export async function sendProductsToWebsite(
  orgId: string,
  selected: WebsiteSendProduct[],
): Promise<{ added: number; already: number }> {
  const { data, error } = await websiteFrom("website_products")
    .select("product_id, variant_id, display_order")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  const { rows, already } = planWebsiteSend(orgId, (data || []) as ExistingListing[], selected);
  if (rows.length > 0) {
    const { error: insertError } = await websiteFrom("website_products").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  return { added: rows.length, already };
}
