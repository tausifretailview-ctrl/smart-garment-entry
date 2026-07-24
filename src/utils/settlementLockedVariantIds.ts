/**
 * PersistQueryClient JSON-encodes query data. A `Set` becomes `{}`, so calling
 * `.has` after restore throws and POS barcode add surfaces as "Lookup failed".
 * Normalize any hydrated shape back to a real Set before use.
 */
export function toLockedVariantIdSet(data: unknown): Set<string> {
  if (data instanceof Set) {
    return data as Set<string>;
  }
  if (Array.isArray(data)) {
    return new Set(data.filter((id): id is string => typeof id === "string" && id.length > 0));
  }
  return new Set<string>();
}

export function getSettlementLockedCartItems<
  T extends { variantId?: string | null; productName?: string; barcode?: string | null },
>(items: T[], lockedVariantIds: Set<string> | unknown): T[] {
  const locked = toLockedVariantIdSet(lockedVariantIds);
  return items.filter((item) => !!item.variantId && locked.has(item.variantId));
}
