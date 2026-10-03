/** Client-side guards before Product Dashboard delete (server re-checks via soft_delete_orphaned_products). */

export type ProductRowStockSnapshot = {
  product_id: string;
  product_name: string;
  product_type: string;
  total_stock: number;
};

export function productHasBlockingStock(
  productType: string,
  totalStock: number,
  isService: (productType: string) => boolean,
): boolean {
  if (isService(productType)) return false;
  return totalStock > 0;
}

/** Products in `ids` that still show on-hand qty on the dashboard (non-service). */
export function collectProductsWithBlockingStock(
  rows: ProductRowStockSnapshot[],
  ids: string[],
  isService: (productType: string) => boolean,
): ProductRowStockSnapshot[] {
  const idSet = new Set(ids);
  return rows.filter(
    (row) =>
      idSet.has(row.product_id) &&
      productHasBlockingStock(row.product_type, row.total_stock, isService),
  );
}
