export type MasterOnlyVariantDraft = {
  color: string;
  size: string;
  pur_price: number;
  sale_price: number;
  mrp: number | null;
  barcode: string;
  barcode_source?: "external" | "generated";
  active: boolean;
  opening_qty: number;
  purchase_qty?: number;
};

/**
 * Sale Order "Add New Product" shows size checkboxes, not a purchase qty grid.
 * Checked sizes are the variants to insert (0 stock). Existing rows keep
 * barcodes and prices the user already edited.
 */
export function buildMasterOnlySaleOrderVariants<T extends MasterOnlyVariantDraft>(input: {
  colors: string[];
  selectedSizes: string[];
  groupSizes: string[];
  customSizes?: string[];
  existing: T[];
  defaults: { pur_price: number; sale_price: number; mrp: number | null };
}): T[] {
  const colors = input.colors.map((color) => color.trim()).filter(Boolean);
  const colorsToUse = colors.length > 0 ? colors : [""];
  const groupSet = new Set(input.groupSizes);
  const selected = input.selectedSizes.filter((size) => groupSet.size === 0 || groupSet.has(size));
  const custom = (input.customSizes ?? []).filter((size) => size && !selected.includes(size));

  if (input.groupSizes.length > 0 && selected.length === 0 && custom.length === 0) {
    return [];
  }

  const sizes = [...selected, ...custom];
  if (sizes.length === 0) {
    return input.existing.filter((variant) => variant.active !== false);
  }

  const rows: T[] = [];
  for (const color of colorsToUse) {
    for (const size of sizes) {
      const existing = input.existing.find(
        (variant) => variant.size === size && (variant.color || "") === color,
      );
      if (existing) {
        if (existing.active === false) continue;
        rows.push({ ...existing, color, size });
        continue;
      }
      rows.push({
        color,
        size,
        pur_price: input.defaults.pur_price,
        sale_price: input.defaults.sale_price,
        mrp: input.defaults.mrp,
        barcode: "",
        active: true,
        opening_qty: 0,
        purchase_qty: 0,
      } as T);
    }
  }
  return rows;
}
