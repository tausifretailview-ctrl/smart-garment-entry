import { normalizeBrand as normalizeBrandBase } from "@/utils/customerBrandDiscountLookup";
import { supabase } from "@/integrations/supabase/client";

/** Strip zero-width / odd spaces so "BIN HANIF" duplicates collapse. */
function scrubBrandText(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Compare key: scrub + lowercase (extends discount normalizeBrand). */
export function normalizeBrand(s: string | null | undefined): string {
  return normalizeBrandBase(scrubBrandText(s || ""));
}

/** Canonical brand stored on products: trim, collapse spaces, UPPERCASE. */
export function canonicalizeProductBrand(s: string | null | undefined): string {
  return scrubBrandText(s || "").toUpperCase();
}

export type BrandDuplicateGroup = {
  key: string;
  canonical: string;
  variants: string[];
  productCount: number;
};

/**
 * Find brands that differ only by spacing/case within an org.
 * Used for "Merge duplicate brands" preview.
 */
export async function findDuplicateBrandGroups(
  organizationId: string,
): Promise<BrandDuplicateGroup[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, brand")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("brand", "is", null);

  if (error) throw error;

  const byKey = new Map<string, { rawCounts: Map<string, number>; total: number }>();
  for (const row of data || []) {
    const raw = (row.brand || "").trim();
    if (!raw) continue;
    const key = normalizeBrand(raw);
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { rawCounts: new Map(), total: 0 };
      byKey.set(key, entry);
    }
    entry.total += 1;
    entry.rawCounts.set(raw, (entry.rawCounts.get(raw) || 0) + 1);
  }

  const groups: BrandDuplicateGroup[] = [];
  for (const [key, entry] of byKey) {
    if (entry.rawCounts.size < 2) continue;
    const variants = [...entry.rawCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
    const top = variants[0];
    groups.push({
      key,
      canonical: canonicalizeProductBrand(top),
      variants,
      productCount: entry.total,
    });
  }

  return groups.sort((a, b) => b.productCount - a.productCount || a.canonical.localeCompare(b.canonical));
}

export type ConsolidateBrandsResult = {
  groupsMerged: number;
  productsUpdated: number;
  discountsUpdated: number;
};

/**
 * Merge duplicate brand spellings for one org onto a single canonical string.
 * Updates products.brand (drives stock reports) and customer_brand_discounts.brand.
 */
export async function consolidateDuplicateBrands(
  organizationId: string,
  groups?: BrandDuplicateGroup[],
): Promise<ConsolidateBrandsResult> {
  const toMerge = groups ?? (await findDuplicateBrandGroups(organizationId));
  let productsUpdated = 0;
  let discountsUpdated = 0;

  for (const group of toMerge) {
    const allRaw = group.variants.filter((v) => v !== group.canonical);

    for (const raw of allRaw) {
      const { data: updatedProducts, error: prodErr } = await supabase
        .from("products")
        .update({ brand: group.canonical })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .eq("brand", raw)
        .select("id");
      if (prodErr) throw prodErr;
      productsUpdated += updatedProducts?.length || 0;

      const { data: updatedDiscounts, error: discErr } = await supabase
        .from("customer_brand_discounts")
        .update({ brand: group.canonical })
        .eq("organization_id", organizationId)
        .eq("brand", raw)
        .select("id");
      if (discErr) {
        console.warn("customer_brand_discounts brand merge skipped:", discErr.message);
      } else {
        discountsUpdated += updatedDiscounts?.length || 0;
      }
    }
  }

  return {
    groupsMerged: toMerge.length,
    productsUpdated,
    discountsUpdated,
  };
}
