/**
 * POS cart stock-status dot (v1).
 *
 * Simpler than Daily Sale Analysis (no days-of-stock / blue overstock).
 * Snapshot is scan-time only — no live refresh while the bill is open.
 * Out of scope for v1: blue/overstock, cart polling, mobile POS billing layout.
 */

/** Same default as Stock Report / Product Dashboard when settings omit a value. */
export const POS_CART_DEFAULT_LOW_STOCK_THRESHOLD = 10;

export type PosCartStockStatus = "green" | "yellow" | "red";

export type PosCartStockIndicator = {
  status: PosCartStockStatus;
  stockQty: number;
  remaining: number;
};

/**
 * Derive cart-row stock indicator from the add-time snapshot and live line qty.
 * Returns null when stock is not tracked / unknown (no badge).
 *
 * Edit mode: snapshot ignores freedQty — may show red when save-time checkStock would pass.
 */
export function getPosCartStockIndicator(
  stockQty: number | null | undefined,
  quantity: number,
  lowStockThreshold: number = POS_CART_DEFAULT_LOW_STOCK_THRESHOLD,
): PosCartStockIndicator | null {
  if (stockQty == null || !Number.isFinite(stockQty)) return null;

  const qty = Number(quantity) || 0;
  const remaining = stockQty - qty;
  const threshold = Number.isFinite(lowStockThreshold)
    ? lowStockThreshold
    : POS_CART_DEFAULT_LOW_STOCK_THRESHOLD;

  let status: PosCartStockStatus;
  if (remaining < 0 || stockQty <= 0) {
    status = "red";
  } else if (remaining <= threshold) {
    status = "yellow";
  } else {
    status = "green";
  }

  return { status, stockQty, remaining };
}
