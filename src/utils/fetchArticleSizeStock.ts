import { supabase } from "@/integrations/supabase/client";
import {
  aggregateArticleStock,
  articleCodeKey,
  articleSizeStockList,
} from "@/utils/sizeWiseStockLookup";

export type ArticleProductMeta = {
  product_name: string;
  brand: string;
  style: string;
};

/**
 * Same family on-hand map as Sale Order → Print Available Stock / Convert.
 * Article code + brand + colour; sibling product rows merged.
 */
export async function fetchArticleSizeStockForProductIds(
  organizationId: string,
  productIds: string[],
): Promise<{
  productMeta: Map<string, ArticleProductMeta>;
  sizeWiseByGroup: Map<string, Map<string, number>>;
}> {
  const productMeta = new Map<string, ArticleProductMeta>();
  const empty = { productMeta, sizeWiseByGroup: new Map<string, Map<string, number>>() };
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!organizationId || ids.length === 0) return empty;

  const { data: baseProducts, error: baseErr } = await supabase
    .from("products")
    .select("id, product_name, brand, style")
    .in("id", ids);
  if (baseErr) throw baseErr;

  for (const p of baseProducts ?? []) {
    productMeta.set(p.id, {
      product_name: p.product_name || "",
      brand: p.brand || "",
      style: p.style || "",
    });
  }

  const names = [...new Set((baseProducts ?? []).map((p) => p.product_name).filter(Boolean))] as string[];
  const familyKey = (p: { product_name?: string | null; brand?: string | null }) =>
    `${articleCodeKey(p.product_name)}|${(p.brand || "").trim().toUpperCase()}`;
  const orderedFamilies = new Set((baseProducts ?? []).map(familyKey));

  let expandedIds = ids;
  const codes = [...new Set(names.map((n) => articleCodeKey(n)).filter(Boolean))];
  if (codes.length > 0) {
    const { data: sameName, error: nameErr } = await supabase
      .from("products")
      .select("id, product_name, brand, style")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(codes.map((c) => `product_name.ilike.${c}%`).join(","));
    if (nameErr) throw nameErr;
    const siblingsOfFamily = (sameName ?? []).filter((p) => orderedFamilies.has(familyKey(p)));
    for (const p of siblingsOfFamily) {
      productMeta.set(p.id, {
        product_name: p.product_name || "",
        brand: p.brand || "",
        style: p.style || "",
      });
    }
    expandedIds = [...new Set([...ids, ...siblingsOfFamily.map((p) => p.id)])];
  }

  const { data: siblings, error: sibErr } = await supabase
    .from("product_variants")
    .select("product_id, color, size, stock_qty")
    .eq("organization_id", organizationId)
    .in("product_id", expandedIds)
    .is("deleted_at", null)
    .eq("active", true);
  if (sibErr) throw sibErr;

  const sizeWiseByGroup = aggregateArticleStock(
    (siblings ?? []).map((v) => {
      const meta = productMeta.get(v.product_id);
      return {
        product_name: meta?.product_name,
        brand: meta?.brand,
        color: v.color,
        style: meta?.style,
        size: v.size,
        stock_qty: v.stock_qty,
      };
    }),
  );

  return { productMeta, sizeWiseByGroup };
}

export function sizeStockForLine(
  sizeWiseByGroup: Map<string, Map<string, number>>,
  productName?: string | null,
  brand?: string | null,
  color?: string | null,
): { size: string; qty: number }[] {
  return articleSizeStockList(sizeWiseByGroup, productName, brand, color);
}
