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

/** Product name OR brand prefix (Trendzo: brand "J" + name "JEANS"). */
export function posQuickCodeProductMatches(
  product: { product_name?: string | null; brand?: string | null } | null | undefined,
  letters: string,
): boolean {
  if (!product) return false;
  return (
    posProductNameMatchesQuickLetters(product.product_name, letters) ||
    posProductNameMatchesQuickLetters(product.brand, letters)
  );
}

/** Variant sale price, falling back to product master default when SKU price is unset. */
export function posVariantEffectiveSalePrice(
  variant: { sale_price?: unknown },
  product?: { default_sale_price?: unknown } | null,
): number {
  const variantSale = posQuickPriceRupees(variant.sale_price);
  if (variantSale > 0) return variantSale;
  return posQuickPriceRupees(product?.default_sale_price);
}

export function posVariantEffectiveMrp(
  variant: { sale_price?: unknown; mrp?: unknown },
  product?: { default_sale_price?: unknown } | null,
): number {
  const mrp = posQuickPriceRupees(variant.mrp);
  if (mrp > 0) return mrp;
  return posVariantEffectiveSalePrice(variant, product);
}

/** Typed rupees match effective sale price or MRP — not last-purchase history. */
export function posVariantMatchesQuickPrice(
  variant: {
    sale_price?: unknown;
    mrp?: unknown;
  },
  price: number,
  product?: { default_sale_price?: unknown; product_name?: string | null; brand?: string | null } | null,
): boolean {
  const want = posQuickPriceRupees(price);
  if (want <= 0) return false;
  const effectiveSale = posVariantEffectiveSalePrice(variant, product);
  const effectiveMrp = posVariantEffectiveMrp(variant, product);
  return effectiveSale === want || effectiveMrp === want;
}

/** When the SKU row has no sale_price, bill from product default / typed code. */
export function resolvePosQuickPriceCartOverride(
  product: { default_sale_price?: unknown },
  variant: { sale_price?: unknown; mrp?: unknown },
  typedPrice: number,
): { sale_price: number; mrp: number } | undefined {
  const want = posQuickPriceRupees(typedPrice);
  if (want <= 0) return undefined;
  if (!posVariantMatchesQuickPrice(variant, want, product)) return undefined;

  const variantSale = posQuickPriceRupees(variant.sale_price);
  const billSale = variantSale > 0 ? variantSale : want;
  const billMrp = posVariantEffectiveMrp(variant, product) || billSale;
  if (variantSale === billSale && variantSale === want) return undefined;
  if (variantSale === want) return undefined;
  return { sale_price: billSale, mrp: Math.max(billMrp, billSale) };
}

/**
 * Same half-open band as Math.round for positive rupees: [n - 0.5, n + 0.5).
 * 299.50 → 300, 300.50 → 301. The old 0.49 lower bound dropped common *.50 costs.
 */
export function posQuickPriceRupeeWindow(price: number): { lo: number; hi: number } {
  const want = posQuickPriceRupees(price);
  return { lo: want - 0.5, hi: want + 0.5 };
}

/** Half-open rupee window so 300.00 / 299.50 match typed 300 without using last-purchase. */
export function posQuickPricePostgrestOr(price: number): string {
  const { lo, hi } = posQuickPriceRupeeWindow(price);
  return `and(sale_price.gte.${lo},sale_price.lt.${hi}),and(mrp.gte.${lo},mrp.lt.${hi})`;
}

/** Name-prefix product cap. Must not be shared with per-SKU size/color rows. */
export const POS_QUICK_PRICE_NAME_PRODUCT_LIMIT = 80;
/** Variants at the SQL price window across those products. */
export const POS_QUICK_PRICE_VARIANT_LIMIT = 1000;

export function filterPosQuickPriceCodeRows<
  T extends {
    products?: { product_name?: string | null; brand?: string | null; default_sale_price?: unknown } | null;
    sale_price?: unknown;
    mrp?: unknown;
  },
>(rows: T[] | null | undefined, letters: string, price: number): T[] {
  return (rows || []).filter((row) => {
    return (
      posQuickCodeProductMatches(row.products, letters) &&
      posVariantMatchesQuickPrice(row, price, row.products)
    );
  });
}

export async function fetchPosQuickPriceCodeMatches(
  orgId: string,
  letters: string,
  price: number,
  variantSelect: string,
): Promise<Array<{ product: Record<string, unknown>; variant: Record<string, unknown> }>> {
  const want = posQuickPriceRupees(price);
  if (want <= 0) return [];
  const prefix = `${letters}%`;

  // Product ids first — match name OR brand prefix (e.g. brand "J", name "JEANS").
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .or(`product_name.ilike.${prefix},brand.ilike.${prefix}`)
    .limit(POS_QUICK_PRICE_NAME_PRODUCT_LIMIT);
  if (productError) throw productError;
  if (!products?.length) return [];

  const productIds = products.map((p: { id: string }) => p.id);
  // Load all variants for matched products — filter by effective price in JS so
  // product default_sale_price (Product Dashboard "Selling Price") counts even when
  // SKU sale_price was never copied onto variants (Trendzo-style entry).
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
    .limit(POS_QUICK_PRICE_VARIANT_LIMIT);
  if (variantError) throw variantError;

  const matched = filterPosQuickPriceCodeRows(
    (variants || []) as Array<{
      products?: {
        product_name?: string | null;
        brand?: string | null;
        default_sale_price?: unknown;
      } | null;
      sale_price?: unknown;
      mrp?: unknown;
    }>,
    letters,
    want,
  );

  const out: Array<{ product: Record<string, unknown>; variant: Record<string, unknown> }> = [];
  for (const row of matched) {
    const product = row.products as Record<string, unknown> | undefined;
    if (!product) continue;
    out.push({ product, variant: row as unknown as Record<string, unknown> });
  }
  return out;
}
