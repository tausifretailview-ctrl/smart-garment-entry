import { supabase } from "@/integrations/supabase/client";

export function normalizeProductSearchTerm(raw: string): string {
  return raw.replace(/[\r\n\t]/g, "").trim();
}

/** True when the term is likely a barcode / IMEI (not plain product words). */
export function looksLikeBarcodeSearch(term: string): boolean {
  const t = normalizeProductSearchTerm(term);
  if (t.length < 3) return false;
  return /^[A-Za-z0-9\-_.]+$/.test(t);
}

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** Resolve product ids whose variants match barcode (exact first, then partial). */
export async function fetchProductIdsByBarcodeSearch(
  organizationId: string,
  term: string,
): Promise<string[]> {
  const normalized = normalizeProductSearchTerm(term);
  if (!normalized) return [];

  const ids = new Set<string>();

  const { data: exact, error: exactErr } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("barcode", normalized);

  if (exactErr) {
    console.warn("[productDashboardBarcodeSearch] exact barcode lookup failed", exactErr.message);
  } else {
    (exact ?? []).forEach((row) => ids.add(row.product_id));
  }

  if (ids.size === 0) {
    const escaped = escapeIlike(normalized);
    const { data: partial, error: partialErr } = await supabase
      .from("product_variants")
      .select("product_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("barcode", `%${escaped}%`)
      .limit(100);

    if (partialErr) {
      console.warn("[productDashboardBarcodeSearch] partial barcode lookup failed", partialErr.message);
    } else {
      (partial ?? []).forEach((row) => ids.add(row.product_id));
    }
  }

  return [...ids];
}

export type ProductCatalogRowPayload = {
  product_id: string;
  product_name: string;
  product_type: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  image_url?: string | null;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number;
  default_sale_price: number;
  status: string;
  user_cancelled_at?: string | null;
  total_stock: number;
  variant_count: number;
};

/** Build catalog rows for product ids (used when barcode lookup finds products RPC missed). */
export async function fetchCatalogRowsForProductIds(
  organizationId: string,
  productIds: string[],
): Promise<ProductCatalogRowPayload[]> {
  if (!productIds.length) return [];

  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select(
      "id, product_name, product_type, category, brand, style, color, image_url, hsn_code, gst_per, default_pur_price, default_sale_price, status, user_cancelled_at",
    )
    .eq("organization_id", organizationId)
    .in("id", productIds)
    .is("deleted_at", null);

  if (productsErr) {
    console.warn("[productDashboardBarcodeSearch] products fetch failed", productsErr.message);
    return [];
  }
  if (!products?.length) return [];

  const { data: variants, error: variantsErr } = await supabase
    .from("product_variants")
    .select("product_id, stock_qty")
    .eq("organization_id", organizationId)
    .in("product_id", productIds)
    .is("deleted_at", null);

  if (variantsErr) {
    console.warn("[productDashboardBarcodeSearch] variants fetch failed", variantsErr.message);
  }

  const stockByProduct = new Map<string, { total_stock: number; variant_count: number }>();
  (variants ?? []).forEach((v) => {
    const prev = stockByProduct.get(v.product_id) ?? { total_stock: 0, variant_count: 0 };
    stockByProduct.set(v.product_id, {
      total_stock: prev.total_stock + Number(v.stock_qty ?? 0),
      variant_count: prev.variant_count + 1,
    });
  });

  return products.map((p) => {
    const agg = stockByProduct.get(p.id) ?? { total_stock: 0, variant_count: 0 };
    return {
      product_id: p.id,
      product_name: p.product_name || "",
      product_type: p.product_type || "",
      category: p.category || "",
      brand: p.brand || "",
      style: p.style || "",
      color: p.color || "",
      image_url: p.image_url,
      hsn_code: p.hsn_code || "",
      gst_per: p.gst_per || 0,
      default_pur_price: Number(p.default_pur_price) || 0,
      default_sale_price: Number(p.default_sale_price) || 0,
      status: p.status || "active",
      user_cancelled_at: p.user_cancelled_at ?? null,
      total_stock: agg.total_stock,
      variant_count: agg.variant_count,
    };
  });
}
