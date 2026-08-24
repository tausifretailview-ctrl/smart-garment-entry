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

/** Typed rupees match current sale price or MRP only — not last-purchase history. */
export function posVariantMatchesQuickPrice(
  variant: {
    sale_price?: unknown;
    mrp?: unknown;
  },
  price: number,
): boolean {
  const want = posQuickPriceRupees(price);
  if (want <= 0) return false;
  return posQuickPriceRupees(variant.sale_price) === want || posQuickPriceRupees(variant.mrp) === want;
}

/** Half-open rupee window so 300.00 matches typed 300 without using last-purchase. */
export function posQuickPricePostgrestOr(price: number): string {
  const want = posQuickPriceRupees(price);
  const lo = want - 0.49;
  const hi = want + 0.5;
  return `and(sale_price.gte.${lo},sale_price.lt.${hi}),and(mrp.gte.${lo},mrp.lt.${hi})`;
}

export function filterPosQuickPriceCodeRows<
  T extends {
    products?: { product_name?: string | null } | null;
    sale_price?: unknown;
    mrp?: unknown;
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
  const want = posQuickPriceRupees(price);
  if (want <= 0) return [];
  const prefix = `${letters}%`;
  const priceOr = posQuickPricePostgrestOr(want);

  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select(variantSelect)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .is("products.deleted_at", null)
    .eq("products.organization_id", orgId)
    .eq("products.status", "active")
    .ilike("products.product_name", prefix)
    .or(priceOr)
    .order("stock_qty", { ascending: false })
    .limit(50);
  if (variantError) throw variantError;

  const matched = filterPosQuickPriceCodeRows(
    (variants || []) as Array<{
      products?: { product_name?: string | null } | null;
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
