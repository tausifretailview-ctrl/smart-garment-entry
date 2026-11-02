/**
 * Settings > Purchase > "Individual barcode for every piece" (purchase_settings.per_piece_barcode).
 *
 * When ON, a size row with qty N (e.g. S = 2) becomes N bill lines of qty 1, and each
 * piece gets its own product_variant + barcode (same product/size/colour, different
 * barcode — allowed by product_variants_active_product_color_size_barcode_idx, the same
 * model the roll-wise MTR entry uses). Default OFF.
 */

/** Above this many pieces in one row the row is kept as one line (too many barcodes at once). */
export const PER_PIECE_BARCODE_MAX_PIECES = 200;

export function isPerPieceBarcodeEnabled(purchaseSettings: unknown): boolean {
  return (purchaseSettings as { per_piece_barcode?: boolean } | null | undefined)?.per_piece_barcode === true;
}

/** Units sold by measure — qty is a length/weight, never split into pieces. */
const MEASURED_UOMS = new Set(["MTR", "KG", "GM", "LTR", "ML", "CM", "FT", "YARD", "YRD"]);

export function isPerPieceMeasuredUom(uom: unknown): boolean {
  return MEASURED_UOMS.has(String(uom ?? "").trim().toUpperCase());
}

/** Whole number of pieces worth splitting (2..max). Decimal qty (MTR, KG) is never split. */
export function pieceCountToSplit(qty: unknown): number {
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 2 || n > PER_PIECE_BARCODE_MAX_PIECES) return 0;
  return n;
}

/**
 * Expand every splittable row into qty-1 copies. `makePiece(row, index)` builds piece
 * `index` (0-based); rows that can't be split are kept as they are.
 */
export function expandRowsIntoPieces<T>(
  rows: T[],
  getQty: (row: T) => unknown,
  canSplit: (row: T) => boolean,
  makePiece: (row: T, index: number) => T,
): { rows: T[]; skippedTooMany: number } {
  const out: T[] = [];
  let skippedTooMany = 0;
  for (const row of rows) {
    const qty = getQty(row);
    const count = canSplit(row) ? pieceCountToSplit(qty) : 0;
    if (count === 0) {
      if (canSplit(row) && Number.isInteger(Number(qty)) && Number(qty) > PER_PIECE_BARCODE_MAX_PIECES) {
        skippedTooMany += 1;
      }
      out.push(row);
      continue;
    }
    for (let i = 0; i < count; i++) out.push(makePiece(row, i));
  }
  return { rows: out, skippedTooMany };
}
