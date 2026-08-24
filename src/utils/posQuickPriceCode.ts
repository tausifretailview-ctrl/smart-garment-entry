import { supabase } from "@/integrations/supabase/client";

/**
 * Fast-counter shorthand for no-barcode shops: "J300" -> first letters "j", price 300.
 * Requires at least 2 price digits so it cannot collide with 1–9 quick-service codes.
 */
export function parsePosQuickPriceCode(term: string): { letters: string; price: number } | null {
  const m = String(term || "")
    .trim()
    .match(/^([A-Za-z]{1,6})\s*(\d{2,6})$/);
  if (!m) return null;
  const price = Number(m[2]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { letters: m[1].toLowerCase(), price };
}

export function posQuickPriceRupees(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function posProductNameMatchesQuickLetters(
  productName: string | null | undefined,
  letters: string,
): boolean {
  const name = String(productName || "").trim().toLowerCase();
  const prefix = String(letters || "").trim().toLowerCase();
  return Boolean(name && prefix && name.startsWith(prefix));
}

/** Typed rupees match sale price or MRP (POS may bill from either column). */
export function posVariantMatchesQuickPrice(
  variant: {
    sale_price?: unknown;
    mrp?: unknown;
    last_purchase_sale_price?: unknown;
  },
  price: number,
): boolean {
  const want = posQuickPriceRupees(price);
  if (want <= 0) return false;
  return (
    posQuickPriceRupees(variant.sale_price) === want ||
    posQuickPriceRupees(variant.mrp) === want ||
    posQuickPriceRupees(variant.last_purchase_sale_price) === want
  );
}

export function filterPosQuickPriceCodeRows<
  T extends {
    products?: { product_name?: string | null } | null;
    sale_price?: unknown;
    mrp?: unknown;
    last_purchase_sale_price?: unknown;
  },
>(rows: T[] | null | undefined, letters: string, price: number): T[] {
  return (rows || []).filter((row) => {
    return (
      posProductNameMatchesQuickLetters(row.products?.product_name, letters) &&
      posVariantMatchesQuickPrice(row, price)
    );
  });
}

export async function fetchPosQuickPriceCodeMatches(
  orgId: string,
  letters: string,
  price: number,
  variantSelect: string,
): Promise<Array<{ product: Record<string, unknown>; variant: Record<string, unknown> }>> {
  const prefix = `${letters}%`;
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .ilike("product_name", prefix)
    .limit(80);
  if (productError) throw productError;
  if (!products?.length) return [];

  const productIds = products.map((p: { id: string }) => p.id);
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select(variantSelect)
    .eq("organization_id", orgId)
    .in("product_id", productIds)
    .is("deleted_at", null)
    .is("products.deleted_at", null)
    .eq("products.organization_id", orgId)
    .eq("products.status", "active")
    .order("stock_qty", { ascending: false })
    .limit(200);
  if (variantError) throw variantError;

  const matched = filterPosQuickPriceCodeRows(
    (variants || []) as Array<{
      products?: { product_name?: string | null } | null;
      sale_price?: unknown;
      mrp?: unknown;
      last_purchase_sale_price?: unknown;
    }>,
    letters,
    price,
  );

  const out: Array<{ product: Record<string, unknown>; variant: Record<string, unknown> }> = [];
  for (const row of matched) {
    const product = row.products as Record<string, unknown> | undefined;
    if (!product) continue;
    out.push({ product, variant: row as unknown as Record<string, unknown> });
  }
  return out;
}
