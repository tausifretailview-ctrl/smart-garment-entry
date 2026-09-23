import { supabase } from "@/integrations/supabase/client";

export type SameNameProductMatch = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
};

export const normalizeProductNameKey = (name: string, category?: string | null): string =>
  `${(name || "").trim().toLowerCase()}|${(category || "").trim().toLowerCase()}`;

/**
 * Name-dupe gate lookup: existing org products whose name AND category match
 * case/whitespace-insensitively. Narrowed server-side with ilike, matched
 * exactly in memory (ilike alone would also match substrings).
 */
export async function findSameNameProductsInOrg(
  organizationId: string,
  name: string,
  category?: string | null,
): Promise<SameNameProductMatch[]> {
  const trimmed = (name || "").trim().replace(/[%_,]/g, "");
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, brand, category")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("product_name", `%${trimmed}%`)
    .limit(10);
  if (error || !data) return [];
  const want = normalizeProductNameKey(name, category);
  return (data as SameNameProductMatch[]).filter(
    (p) => normalizeProductNameKey(p.product_name || "", p.category) === want,
  );
}
