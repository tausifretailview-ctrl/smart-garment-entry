/** A size typed in the sale-order grid that is not an existing variant yet. */
export function isSaleOrderCustomGridVariant(variant: {
  isCustomSize?: boolean;
  id?: string | null;
}): boolean {
  if (variant.isCustomSize) return true;
  return String(variant.id || "").startsWith("custom-");
}

export type SaleOrderGridSibling = {
  color?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  sale_price?: number | null;
  mrp?: number | null;
  pur_price?: number | null;
};

export type SaleOrderNewVariantPlan = {
  productId: string;
  productName: string;
  size: string;
  color: string | null;
  salePrice: number;
  mrp: number;
  purPrice: number;
};

function colorKey(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function positive(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * New size on an existing colour stays on that colour's product (grouped
 * search rows are separate products). A brand-new colour uses the grid's
 * primary product. Prices copy from a sibling when the grid did not type one.
 */
export function planSaleOrderNewVariant(input: {
  size: string;
  color?: string | null;
  fallbackProductId: string;
  fallbackProductName?: string | null;
  existingVariants: SaleOrderGridSibling[];
  enteredSalePrice?: number | null;
  enteredMrp?: number | null;
  enteredPurPrice?: number | null;
}): SaleOrderNewVariantPlan | null {
  const size = input.size.trim();
  if (!size || !input.fallbackProductId) return null;

  const wanted = colorKey(input.color);
  const sibling =
    input.existingVariants.find(
      (v) => colorKey(v.color) === wanted && v.product_id,
    ) || input.existingVariants.find((v) => v.product_id);

  const salePrice =
    positive(input.enteredSalePrice) ??
    positive(sibling?.sale_price) ??
    0;
  const mrp =
    positive(input.enteredMrp) ??
    positive(sibling?.mrp) ??
    salePrice;
  const purPrice =
    positive(input.enteredPurPrice) ??
    positive(sibling?.pur_price) ??
    0;

  const color = String(input.color || "").trim();
  return {
    productId: sibling && wanted && colorKey(sibling.color) === wanted
      ? String(sibling.product_id)
      : input.fallbackProductId,
    productName:
      (sibling && wanted && colorKey(sibling.color) === wanted
        ? sibling.product_name
        : null) ||
      input.fallbackProductName ||
      "",
    size,
    color: color || null,
    salePrice,
    mrp,
    purPrice,
  };
}
