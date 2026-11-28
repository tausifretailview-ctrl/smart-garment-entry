/**
 * Buying in cases, selling in pieces (supermarket go-live, Nov 2026).
 *
 * An item's stock and rates stay in its own unit (pieces, kg). Its pack unit says how many
 * of them come in one case / box / bag (products.alt_uom + alt_uom_factor, set in Product
 * Entry → Units). On a purchase line the cashier can type cases and the case rate instead:
 * the line still saves pieces and the rate per piece, so stock, costing and every report
 * work as before.
 */
export type PackUnit = { uom: string; factor: number };

/** The pack unit of an item, or null when it has none (or a factor of 1 or less). */
export function packUnitOf(row: { alt_uom?: string | null; alt_uom_factor?: number | string | null } | null | undefined): PackUnit | null {
  const uom = String(row?.alt_uom ?? "").trim();
  const factor = Number(row?.alt_uom_factor);
  if (!uom || !Number.isFinite(factor) || factor <= 1) return null;
  return { uom, factor };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 5 cases of 24 → 120 pieces. */
export function piecesFromPacks(packs: number, unit: PackUnit): number {
  return round3(Math.max(0, packs) * unit.factor);
}

/** 120 pieces → 5 cases; 130 → 5.417 (shown as typed by the cashier). */
export function packsFromPieces(pieces: number, unit: PackUnit): number {
  return round3(Math.max(0, pieces) / unit.factor);
}

/** Case rate ₹480 for 24 → ₹20 a piece. */
export function pieceRateFromPackRate(packRate: number, unit: PackUnit): number {
  return round2(Math.max(0, packRate) / unit.factor);
}

export function packRateFromPieceRate(pieceRate: number, unit: PackUnit): number {
  return round2(Math.max(0, pieceRate) * unit.factor);
}
