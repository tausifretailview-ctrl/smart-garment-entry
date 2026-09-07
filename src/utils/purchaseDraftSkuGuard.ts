/**
 * Purchase-bill drafts hold generated SKUs (stock_qty = 0) that are not yet
 * in purchase_items. Recycle treats those as unused leftovers unless the
 * caller excludes them.
 *
 * React state (lineItems) is not updated until the next render, so a size-grid
 * confirm that forks size 5 then size 6 would recycle size 5's SKU mid-loop
 * (KS Footwear Line 2: variant not found on save).
 */

export function mergePurchaseDraftExcludeSkuIds(
  lineSkuIds: Array<string | null | undefined>,
  extraSkuIds: Iterable<string>,
): string[] {
  const out = new Set<string>();
  for (const id of lineSkuIds) {
    const trimmed = String(id || "").trim();
    if (trimmed) out.add(trimmed);
  }
  for (const id of extraSkuIds) {
    const trimmed = String(id || "").trim();
    if (trimmed) out.add(trimmed);
  }
  return [...out];
}

export function createPurchaseDraftSkuGuard() {
  const ids = new Set<string>();
  return {
    add(id: string | null | undefined) {
      const trimmed = String(id || "").trim();
      if (trimmed) ids.add(trimmed);
    },
    remove(id: string | null | undefined) {
      const trimmed = String(id || "").trim();
      if (trimmed) ids.delete(trimmed);
    },
    exclude(lineSkuIds: Array<string | null | undefined> = []): string[] {
      return mergePurchaseDraftExcludeSkuIds(lineSkuIds, ids);
    },
  };
}

export type PurchaseDraftSkuGuard = ReturnType<typeof createPurchaseDraftSkuGuard>;
