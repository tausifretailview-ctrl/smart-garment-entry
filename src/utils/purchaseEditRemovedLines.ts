/**
 * Editing a saved purchase bill deletes every saved line that is no longer in the
 * grid. Gurukrupa (PUR/26-27/124, 2026-10-21): an edit save kept only the 8 newly
 * added lines and silently deleted the 7 saved ones, so their printed barcodes had
 * no bill and no stock. Ask before an edit save removes saved lines.
 */

export type PurchaseEditLine = {
  temp_id: string;
  qty: number;
  product_name?: string | null;
  barcode?: string | null;
};

export function findRemovedSavedPurchaseLines<T extends PurchaseEditLine>(
  originalLines: T[],
  currentLines: PurchaseEditLine[],
): T[] {
  const current = new Set(currentLines.map((line) => line.temp_id));
  return originalLines.filter((line) => !current.has(line.temp_id));
}

const MAX_LISTED = 5;

export function removedSavedPurchaseLinesMessage(
  billNo: string,
  removed: PurchaseEditLine[],
  originalCount: number,
): string {
  const qty = removed.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const listed = removed
    .slice(0, MAX_LISTED)
    .map((line) => {
      const name = String(line.product_name || "Item").trim();
      const code = String(line.barcode || "").trim();
      return `• ${name}${code ? ` (${code})` : ""} × ${Number(line.qty) || 0}`;
    });
  if (removed.length > MAX_LISTED) {
    listed.push(`• …and ${removed.length - MAX_LISTED} more`);
  }
  const billLabel = billNo.trim() || "this bill";
  const head =
    removed.length >= originalCount
      ? `This save will REMOVE ALL ${originalCount} saved line(s) (${qty} qty) from ${billLabel} and reduce their stock.`
      : `This save will remove ${removed.length} saved line(s) (${qty} qty) from ${billLabel} and reduce their stock.`;
  return [
    head,
    "",
    ...listed,
    "",
    "Press OK only if you removed these lines on purpose. Press Cancel to keep them (reopen the bill from Purchase Bills).",
  ].join("\n");
}
