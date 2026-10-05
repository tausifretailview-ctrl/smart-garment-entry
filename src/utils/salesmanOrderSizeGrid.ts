import {
  mergeSizeColorVariantsForGrid,
  type MergedSizeGridVariant,
  type SizeGridProductInfo,
  type SizeGridVariantSource,
} from "@/utils/mergeSizeColorVariantsForGrid";

/**
 * Salesman order size grid. Same size+colour from several barcodes or MRP
 * rows is one box, with stock added together — the desktop sale order grid.
 */
export function variantsForSalesmanSizeGrid(
  variants: SizeGridVariantSource[],
  options?: {
    cartQtyByVariant?: Map<string, number>;
    products?: SizeGridProductInfo[];
    defaultColor?: string;
  },
): MergedSizeGridVariant[] {
  return mergeSizeColorVariantsForGrid(variants, options);
}

/** How many size boxes the grid will show, not how many stock rows exist. */
export function salesmanSizeBoxCount(
  variants: Array<{ size?: string | null; color?: string | null }>,
): number {
  return variantsForSalesmanSizeGrid(variants).length;
}
