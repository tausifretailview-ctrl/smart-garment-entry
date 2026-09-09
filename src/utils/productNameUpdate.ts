import { supabase } from "@/integrations/supabase/client";
import { canonicalizeProductBrand } from "@/utils/productBrandUtils";

export function normalizeProductNameForUniqueness(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Rename one product master (org-scoped) and cascade the name to purchase/sale line items.
 * Caller must preflight uniqueness — unique index is LOWER(TRIM(product_name)) per org.
 */
export async function renameOrgProductName(
  organizationId: string,
  productId: string,
  newName: string,
  client: { from: (table: string) => any } = supabase,
): Promise<string> {
  const name = newName.trim();
  if (!organizationId) throw new Error("Select an organization");
  if (!productId) throw new Error("Select a product");
  if (!name) throw new Error("Product name is required");

  const { error } = await client
    .from("products")
    .update({ product_name: name })
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (error) throw error;

  const { error: purchaseErr } = await client
    .from("purchase_items")
    .update({ product_name: name })
    .eq("product_id", productId)
    .eq("organization_id", organizationId);
  if (purchaseErr) throw purchaseErr;

  const { error: saleErr } = await client
    .from("sale_items")
    .update({ product_name: name })
    .eq("product_id", productId)
    .eq("organization_id", organizationId);
  if (saleErr) throw saleErr;

  return name;
}

/** Rename a brand spelling on every live product in the org (and purchase line items). */
export async function renameOrgBrand(
  organizationId: string,
  currentBrand: string,
  newBrand: string,
  client: { from: (table: string) => any } = supabase,
): Promise<string> {
  if (!organizationId) throw new Error("Select an organization");
  const from = currentBrand.trim();
  const to = canonicalizeProductBrand(newBrand);
  if (!from) throw new Error("Select a brand");
  if (!to) throw new Error("New brand name is required");
  if (canonicalizeProductBrand(from) === to && from === to) {
    return to;
  }

  const { error } = await client
    .from("products")
    .update({ brand: to })
    .eq("organization_id", organizationId)
    .eq("brand", from)
    .is("deleted_at", null);
  if (error) throw error;

  const { error: purchaseErr } = await client
    .from("purchase_items")
    .update({ brand: to })
    .eq("organization_id", organizationId)
    .eq("brand", from);
  if (purchaseErr) throw purchaseErr;

  return to;
}
