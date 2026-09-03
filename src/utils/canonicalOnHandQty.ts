/**
 * Authoritative on-hand quantity is product_variants.stock_qty.
 * current_stock is legacy/derived — only used when stock_qty is null.
 * 0 is a real quantity and must not fall through to current_stock.
 */
export function canonicalOnHandQty(row: {
  stock_qty?: unknown;
  current_stock?: unknown;
}): number {
  if (row.stock_qty != null && row.stock_qty !== "") {
    const n = Number(row.stock_qty);
    if (Number.isFinite(n)) return Math.round(n);
  }
  const legacy = Number(row.current_stock);
  return Number.isFinite(legacy) ? Math.round(legacy) : 0;
}
