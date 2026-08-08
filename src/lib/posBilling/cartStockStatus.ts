/**
 * POS cart stock-status dot.
 *
 * Color rules based on scan-time `stockQty` snapshot:
 *   red    = stock 0–2, or overselling this bill (remaining < 0)
 *   yellow = stock 3–5
 *   green  = stock > 5
 * Snapshot is add-time only — not refreshed while the bill is open.
 */

/** Critical band: stock of 0, 1, or 2 (also treat oversell as red). */
export const POS_CART_CRITICAL_STOCK_MAX = 2;

/** Low band upper bound: stock 3–5 → yellow; above this → green. */
export const POS_CART_LOW_STOCK_MAX = 5;

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
): PosCartStockIndicator | null {
  if (stockQty == null || !Number.isFinite(stockQty)) return null;

  const qty = Number(quantity) || 0;
  const remaining = stockQty - qty;

  let status: PosCartStockStatus;
  if (remaining < 0 || stockQty <= POS_CART_CRITICAL_STOCK_MAX) {
    status = "red";
  } else if (stockQty <= POS_CART_LOW_STOCK_MAX) {
    status = "yellow";
  } else {
    status = "green";
  }

  return { status, stockQty, remaining };
}
