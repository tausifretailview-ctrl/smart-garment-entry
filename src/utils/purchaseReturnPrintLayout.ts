/** ~A4 portrait with 5mm margins — item caps tuned for PurchaseReturnPrint compact layout. */
export const PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS = 16;
export const PURCHASE_RETURN_CONTINUATION_PAGE_MAX_ITEMS = 22;
/** Pad empty grid rows on a single-page print only (not when paginated). */
export const PURCHASE_RETURN_SINGLE_PAGE_MIN_ROWS = 6;

export function paginatePurchaseReturnItems<T>(items: T[]): T[][] {
  if (items.length === 0) return [[]];
  if (items.length <= PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS) {
    return [items];
  }
  const pages: T[][] = [items.slice(0, PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS)];
  let idx = PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS;
  while (idx < items.length) {
    pages.push(items.slice(idx, idx + PURCHASE_RETURN_CONTINUATION_PAGE_MAX_ITEMS));
    idx += PURCHASE_RETURN_CONTINUATION_PAGE_MAX_ITEMS;
  }
  return pages;
}

export function purchaseReturnPadRowCount(itemCount: number, pageCount: number): number {
  if (pageCount !== 1) return 0;
  return Math.max(0, PURCHASE_RETURN_SINGLE_PAGE_MIN_ROWS - itemCount);
}
