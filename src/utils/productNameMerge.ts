import { supabase } from "@/integrations/supabase/client";

/**
 * Product name as it should be stored: invisible characters removed, odd spaces
 * made normal, trimmed, runs of spaces collapsed. Letter case is kept.
 */
export function cleanProductName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[   　]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Compare key: two names with the same key are the same name for reports. */
export function productNameMergeKey(value: string | null | undefined): string {
  return cleanProductName(value).toLowerCase();
}

export type ProductNameDuplicateGroup = {
  key: string;
  /** Spelling every product in the group is renamed to (most used, cleaned). */
  canonical: string;
  /** Raw stored spellings, most used first. */
  variants: string[];
  productCount: number;
};

/** Pure grouping step (tested): names that collapse to one key but are stored differently. */
export function groupDuplicateProductNames(names: Array<string | null | undefined>): ProductNameDuplicateGroup[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const raw of names) {
    if (raw == null) continue;
    const key = productNameMergeKey(raw);
    if (!key) continue;
    const counts = byKey.get(key) ?? new Map<string, number>();
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    byKey.set(key, counts);
  }

  const groups: ProductNameDuplicateGroup[] = [];
  for (const [key, counts] of byKey) {
    const variants = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
    const canonical = cleanProductName(variants[0]);
    // One stored spelling that is already clean → nothing to merge.
    if (variants.length === 1 && variants[0] === canonical) continue;
    groups.push({
      key,
      canonical,
      variants,
      productCount: [...counts.values()].reduce((sum, n) => sum + n, 0),
    });
  }
  return groups.sort((a, b) => b.productCount - a.productCount || a.canonical.localeCompare(b.canonical));
}

const PAGE = 1000;

/** All product names of the org (paged past the 1000-row API cap). */
async function fetchOrgProductNames(organizationId: string): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) names.push(row.product_name ?? "");
    if (!data || data.length < PAGE) break;
  }
  return names;
}

export async function findDuplicateProductNameGroups(organizationId: string): Promise<ProductNameDuplicateGroup[]> {
  return groupDuplicateProductNames(await fetchOrgProductNames(organizationId));
}

/**
 * Rename every stored spelling in each group to its canonical name. Only
 * products.product_name changes (a label): products, variants, stock and bills
 * stay as they are.
 */
export async function mergeDuplicateProductNames(
  organizationId: string,
  groups: ProductNameDuplicateGroup[],
): Promise<{ groupsMerged: number; productsUpdated: number }> {
  let productsUpdated = 0;
  for (const group of groups) {
    for (const raw of group.variants) {
      if (raw === group.canonical) continue;
      const { data, error } = await supabase
        .from("products")
        .update({ product_name: group.canonical })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .eq("product_name", raw)
        .select("id");
      if (error) throw error;
      productsUpdated += data?.length ?? 0;
    }
  }
  return { groupsMerged: groups.length, productsUpdated };
}
