/**
 * Purchase size grid: sizes of the product's size group that the product has no
 * variant for yet.
 *
 * The grid used to show only the product's saved variants, so after a size group
 * was edited (Product Entry > Edit Size Group) a new purchase of a product in that
 * group still offered only its old sizes (RELAXO kids PSB01 kept 2-5 after the
 * group became 8 S … 5 S). Each missing group size is added per colour as a new
 * size, so it gets its own SKU + barcode on confirm. Existing variants are untouched.
 */

import { sizeGridNewSizePrices } from "@/utils/sizeGridNewSizePrices";

export type GridVariantLike = {
  id: string;
  size: string;
  color?: string;
  pur_price?: number;
  sale_price?: number;
  mrp?: number;
};

export type GroupSizePlaceholder = {
  id: string;
  size: string;
  color: string;
  pur_price: number;
  sale_price: number;
  mrp: number;
  barcode: string;
  barcode_source: string;
  stock_qty: number;
  isCustomSize: true;
};

const sizeKey = (size: string) => size.trim().toLowerCase();

export function missingGroupSizePlaceholders(args: {
  /** Sizes shown in the grid (one MRP tier in Purchase); prices come from these. */
  variants: GridVariantLike[];
  /** Every saved size of the product, all tiers: a size here is never offered as new. */
  savedVariants?: Array<Pick<GridVariantLike, "size" | "color">>;
  groupSizes: unknown;
  productPurPrice?: number | null;
  productSalePrice?: number | null;
}): GroupSizePlaceholder[] {
  const groupSizes = Array.isArray(args.groupSizes)
    ? args.groupSizes
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (groupSizes.length === 0) return [];

  const colors = [...new Set(args.variants.map((v) => (v.color || "").trim()))];
  if (colors.length === 0) colors.push("");

  const out: GroupSizePlaceholder[] = [];
  for (const color of colors) {
    const colorVariants = args.variants.filter((v) => (v.color || "").trim() === color);
    const have = new Set(
      [...colorVariants, ...(args.savedVariants ?? [])]
        .filter((v) => (v.color || "").trim() === color)
        .map((v) => sizeKey(v.size || "")),
    );
    const prices = sizeGridNewSizePrices({
      colorVariants,
      allVariants: args.variants,
      productPurPrice: args.productPurPrice,
      productSalePrice: args.productSalePrice,
    });
    for (const size of groupSizes) {
      const key = sizeKey(size);
      if (have.has(key)) continue;
      have.add(key);
      out.push({
        id: `group-size::${color}::${size}`,
        size,
        color,
        pur_price: prices.pur_price,
        sale_price: prices.sale_price,
        mrp: prices.mrp,
        barcode: "",
        barcode_source: "generated",
        stock_qty: 0,
        isCustomSize: true,
      });
    }
  }
  return out;
}
