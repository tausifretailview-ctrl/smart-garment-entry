import type { supabase as SupabaseClientInstance } from "@/integrations/supabase/client";

/** "-" and blanks mean "no colour" on purchase lines and variants. */
export function normalizePurchaseColor(value?: string | null): string {
  const trimmed = String(value ?? "").trim();
  return trimmed === "-" ? "" : trimmed;
}

/**
 * Purchase lines carry a colour (typed in Add Product, the IMEI rows, or the
 * Edit Product panel) that the bill and its print show. The Product Dashboard
 * reads colour from `product_variants` only, so a variant saved without one
 * shows no colour there. Returns, per colour, the variant ids whose colour is
 * blank but whose bill line has one. A colour already on the variant is never
 * overwritten (that change goes through the Edit Product panel).
 */
export function variantColorFillPlan(
  lines: Array<{ sku_id?: string | null; color?: string | null }>,
  variantColors: Map<string, string | null | undefined>,
): Map<string, string[]> {
  const colorBySku = new Map<string, string>();
  for (const line of lines) {
    const sku = String(line.sku_id ?? "").trim();
    const color = normalizePurchaseColor(line.color);
    if (!sku || !color || colorBySku.has(sku)) continue;
    colorBySku.set(sku, color);
  }
  const plan = new Map<string, string[]>();
  for (const [sku, color] of colorBySku) {
    if (!variantColors.has(sku)) continue;
    if (normalizePurchaseColor(variantColors.get(sku))) continue;
    const ids = plan.get(color) ?? [];
    ids.push(sku);
    plan.set(color, ids);
  }
  return plan;
}

const VARIANT_IN_CHUNK = 80;

/** Writes the bill line colour onto variants that have none. Returns how many were filled. */
export async function fillBlankVariantColorsFromPurchaseLines(
  supabase: typeof SupabaseClientInstance,
  organizationId: string,
  lines: Array<{ sku_id?: string | null; color?: string | null }>,
): Promise<number> {
  const skuIds = [
    ...new Set(
      lines
        .filter((l) => normalizePurchaseColor(l.color))
        .map((l) => String(l.sku_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (skuIds.length === 0) return 0;

  const variantColors = new Map<string, string | null>();
  for (let i = 0; i < skuIds.length; i += VARIANT_IN_CHUNK) {
    const chunk = skuIds.slice(i, i + VARIANT_IN_CHUNK);
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, color")
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; color: string | null }>) {
      variantColors.set(row.id, row.color);
    }
  }

  let filled = 0;
  for (const [color, ids] of variantColorFillPlan(lines, variantColors)) {
    for (let i = 0; i < ids.length; i += VARIANT_IN_CHUNK) {
      const chunk = ids.slice(i, i + VARIANT_IN_CHUNK);
      const update = (target: string[]) =>
        supabase
          .from("product_variants")
          .update({ color })
          .eq("organization_id", organizationId)
          .in("id", target)
          .or("color.is.null,color.eq.,color.eq.-");
      const { error } = await update(chunk);
      if (!error) {
        filled += chunk.length;
        continue;
      }
      // Unique (product, colour, size, barcode): a sibling already has this colour.
      // Fill the rest one by one and leave that variant as it is.
      if (error.code !== "23505") throw error;
      for (const id of chunk) {
        const { error: rowError } = await update([id]);
        if (!rowError) filled += 1;
        else if (rowError.code !== "23505") throw rowError;
      }
    }
  }
  return filled;
}
