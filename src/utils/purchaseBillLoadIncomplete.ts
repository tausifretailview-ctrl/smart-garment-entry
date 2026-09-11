/**
 * True when loaded purchase lines look truncated vs the bill header.
 * A qty-only gap with a matching line count is header drift (soft-deleted
 * rows still in total_qty), not missing lines.
 */
export function isPurchaseBillLoadIncomplete(args: {
  loadedQty: number;
  loadedLineCount: number;
  headerQty: number;
  headerLineCount?: number | null;
}): boolean {
  const loadedQty = Number(args.loadedQty) || 0;
  const loadedLineCount = Number(args.loadedLineCount) || 0;
  const headerQty = Number(args.headerQty) || 0;
  const headerLineCount = Number(args.headerLineCount) || 0;

  if (headerLineCount > 0 && loadedLineCount < headerLineCount) {
    return true;
  }
  if (headerLineCount > 0 && loadedLineCount >= headerLineCount) {
    return false;
  }
  return headerQty > 0 && Math.abs(loadedQty - headerQty) > 0.5;
}
