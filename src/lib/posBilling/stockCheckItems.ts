/** Lines sent to the live stock check before a POS bill is saved (validateCartStock). */
export function posCartItemsForStockCheck<
  T extends { variantId: string; quantity: number; productName: string; size: string },
>(items: T[]): Array<{ variantId: string; quantity: number; productName: string; size: string }> {
  return items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
    productName: item.productName,
    size: item.size,
  }));
}
