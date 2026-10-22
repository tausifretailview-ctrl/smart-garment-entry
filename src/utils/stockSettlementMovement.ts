/**
 * Stock Settlement (physical count) writes 'reconciliation' stock movements, the
 * same type as the Stock Adjustment tool. Its notes start with "Stock Settlement"
 * (older rows: "Stock settlement", "Physical Count", "Reversal: Physical Count"),
 * which is how reports tell the two apart.
 */
const SETTLEMENT_NOTE = /^\s*(stock settlement|physical count|reversal: physical count)/i;

export const STOCK_SETTLEMENT_LABEL = "Stock Settlement";

export function isStockSettlementMovement(movementType: string | null | undefined, notes: string | null | undefined): boolean {
  return movementType === "reconciliation" && SETTLEMENT_NOTE.test(notes ?? "");
}

/** movement_type, or "stock_settlement" for settlement rows — use as a label-map key. */
export function movementLabelKey(movementType: string, notes: string | null | undefined): string {
  return isStockSettlementMovement(movementType, notes) ? "stock_settlement" : movementType;
}

/** PostgREST `.or()` filter on notes matching settlement rows (use with movement_type = reconciliation). */
export const STOCK_SETTLEMENT_NOTES_OR_FILTER =
  "notes.ilike.Stock Settlement*,notes.ilike.Physical Count*,notes.ilike.Reversal: Physical Count*";
