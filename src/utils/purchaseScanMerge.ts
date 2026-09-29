import { PURCHASE_PRICE_TIER_TOLERANCE } from "@/utils/purchaseVariantPriceTierFork";

type ScanLine = {
  sku_id?: string | null;
  barcode?: string | null;
  sale_price?: number | null;
  mrp?: number | null;
};

const samePrice = (a: number | null | undefined, b: number | null | undefined) =>
  Math.abs((Number(a) || 0) - (Number(b) || 0)) <= PURCHASE_PRICE_TIER_TOLERANCE;

/**
 * Purchase scan: which bill line gets qty +1.
 * - A line that has a SKU matches only that SKU. One universal barcode picked at
 *   ₹749 (SKU A) and then at ₹729 (SKU B) is two lines, not one line at ₹749.
 * - The barcode alone matches only lines without a SKU yet.
 * - With a picked price (`requirePrice`, e.g. "New price"), the line must also be
 *   at that sale price and MRP. Without it, a line whose rate the user edited
 *   still gets the +1, as before.
 */
export function findPurchaseScanMergeIndex(
  lines: ScanLine[],
  scan: { skuId: string; barcode?: string | null; salePrice: number; mrp?: number | null; requirePrice?: boolean },
): number {
  const barcode = (scan.barcode || "").trim();
  return lines.findIndex((line) => {
    const sameItem = line.sku_id
      ? line.sku_id === scan.skuId
      : !!barcode && (line.barcode || "").trim() === barcode;
    if (!sameItem) return false;
    if (!scan.requirePrice) return true;
    return samePrice(line.sale_price, scan.salePrice) && samePrice(line.mrp, scan.mrp);
  });
}

/** Serialised (IMEI) re-scan check: same unit on the bill at any price. */
export function findPurchaseScanSameUnitIndex(
  lines: ScanLine[],
  scan: { skuId: string; barcode?: string | null },
): number {
  const barcode = (scan.barcode || "").trim();
  return lines.findIndex(
    (line) => line.sku_id === scan.skuId || (!!barcode && (line.barcode || "").trim() === barcode),
  );
}
