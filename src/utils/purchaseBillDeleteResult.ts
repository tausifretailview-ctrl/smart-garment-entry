export type PurchaseBillDeleteResult = {
  autoDeletedProducts: number;
  zeroStockRemaining: number;
};

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * soft_delete_purchase_bill historically returned a bare integer (zero-stock
 * product count). The restored new-product cleanup returns jsonb:
 *   { auto_deleted_product_count, zero_stock_remaining_count }
 */
export function parsePurchaseBillDeleteResult(data: unknown): PurchaseBillDeleteResult {
  if (typeof data === "number") {
    return { autoDeletedProducts: 0, zeroStockRemaining: asCount(data) };
  }
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    return {
      autoDeletedProducts: asCount(row.auto_deleted_product_count),
      zeroStockRemaining: asCount(
        row.zero_stock_remaining_count ?? row.zero_stock_product_count,
      ),
    };
  }
  return { autoDeletedProducts: 0, zeroStockRemaining: 0 };
}
