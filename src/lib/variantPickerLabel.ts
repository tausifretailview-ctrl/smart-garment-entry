/** An item (size) picked in Repack / Wastage, and how it is named on screen. */
export type PickedVariant = {
  id: string;
  barcode: string | null;
  size: string | null;
  stock_qty: number | null;
  pur_price: number | null;
  products: { product_name: string; uom: string | null } | null;
};

export function variantPickerLabel(it: PickedVariant): string {
  const size = it.size && it.size !== "None" ? ` (${it.size})` : "";
  return `${it.products?.product_name ?? "Item"}${size}`;
}
