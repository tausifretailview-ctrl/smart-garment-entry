/**
 * POS cart stock-status dot (v1).
 *
 * Color rules (cashier request): based on scan-time `stockQty` snapshot —
 *   red    = stock ≤ 2 (0, 1, or 2) or overselling this bill (remaining < 0)
 *   yellow = stock > 2
 * No green in this model. Snapshot is add-time only — not refreshed while the bill is open.
 * Out of scope: blue/overstock, cart polling, mobile POS billing layout.
 */

/** Critical band: stock of 1 or 2 (also treat 0 / oversell as red). */
export const POS_CART_CRITICAL_STOCK_MAX = 2;

export type PosCartStockStatus = "yellow" | "red";

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

  // Red: out / critical (≤2) or this bill would oversell. Yellow: stock greater than 2.
  const status: PosCartStockStatus =
    remaining < 0 || stockQty <= POS_CART_CRITICAL_STOCK_MAX ? "red" : "yellow";

  return { status, stockQty, remaining };
}
