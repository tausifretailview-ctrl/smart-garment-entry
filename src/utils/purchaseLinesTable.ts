/**
 * Column spans for the Purchase Entry desktop lines table. The table always has 11 columns
 * (tick, SR NO, item, barcode, QTY, PUR.RATE, SALE.RATE, SUB TOTAL, TOTAL, remove, action) plus
 * SIZE, MRP, GST % and DISC % when shown. The inline search row and the Total row used fixed
 * spans that only fitted with SIZE shown: with SIZE hidden the QTY total sat under PUR.RATE.
 */
export type PurchaseLinesTableColumns = {
  showSize: boolean;
  showMrp: boolean;
  showGst: boolean;
  showDiscPercent: boolean;
};

export function purchaseLinesColumnCount(c: PurchaseLinesTableColumns): number {
  return 11 + Number(c.showSize) + Number(c.showMrp) + Number(c.showGst) + Number(c.showDiscPercent);
}

/** Inline search row: tick, SR NO, then the search box over item (+ size) + barcode, then the rest. */
export function purchaseInlineSearchRowSpans(c: PurchaseLinesTableColumns): { search: number; rest: number } {
  const search = 2 + Number(c.showSize);
  return { search, rest: purchaseLinesColumnCount(c) - 2 - search };
}

/** Total row: "Total:" over tick, SR NO, item (+ size); barcode blank; QTY total; then the rest. */
export function purchaseTotalRowSpans(c: PurchaseLinesTableColumns): { label: number; rest: number } {
  const label = 3 + Number(c.showSize);
  return { label, rest: purchaseLinesColumnCount(c) - label - 2 };
}

/** Arrow keys in the inline search box: move through the results and wrap at either end. */
export function nextInlineSearchIndex(key: "ArrowDown" | "ArrowUp", current: number, count: number): number {
  if (count <= 0) return current;
  if (key === "ArrowDown") return current < count - 1 ? current + 1 : 0;
  return current > 0 ? current - 1 : count - 1;
}
