import { isNonStockTrackedProduct } from "@/utils/productStockDisplay";

/**
 * Sales Invoice dashboard → "Duplicate Invoice" (Settings → Sale → Duplicate invoice, off until
 * the shop turns it on). Opens a new Sale Bill filled from the chosen invoice; the user changes the
 * customer or products as needed. Lines short of stock show in red; on save, lines whose barcode
 * has no stock left are taken off the bill first.
 */
export const DUPLICATE_INVOICE_SETTING = "duplicate_invoice" as const;

export function isDuplicateInvoiceEnabled(saleSettings: unknown): boolean {
  if (!saleSettings || typeof saleSettings !== "object") return false;
  return (saleSettings as Record<string, unknown>)[DUPLICATE_INVOICE_SETTING] === true;
}

/** Lines of the source invoice worth copying: not deleted, with a product and a quantity. */
export function duplicableSaleItems<T extends { deleted_at?: string | null; product_id?: string | null; quantity?: number | null }>(
  items: readonly T[] | null | undefined,
): T[] {
  return (items ?? []).filter((it) => !it.deleted_at && !!it.product_id && (Number(it.quantity) || 0) > 0);
}

export type DuplicateStockLine = {
  id: string;
  variantId?: string | null;
  productType?: string | null;
  productName?: string | null;
  size?: string | null;
};

/**
 * Lines whose barcode has no stock now (0 or less). Services, combos and lines without a barcode
 * keep no stock and are never removed; a barcode whose stock could not be read is left alone.
 */
export function linesWithNoStock<T extends DuplicateStockLine>(
  lines: readonly T[],
  stockById: Readonly<Record<string, number>>,
): T[] {
  return lines.filter((l) => {
    if (!l.variantId || isNonStockTrackedProduct(l.productType)) return false;
    const stock = stockById[l.variantId];
    return typeof stock === "number" && Number.isFinite(stock) && stock <= 0;
  });
}

/** "SHIRT M, JEANS 32 and 2 more" for the notice. */
export function describeLines(lines: readonly DuplicateStockLine[], max = 3): string {
  const names = lines.slice(0, max).map((l) => [l.productName, l.size].filter(Boolean).join(" ").trim() || "item");
  const more = lines.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}
