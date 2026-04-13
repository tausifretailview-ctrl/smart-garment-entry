import { SupabaseClient } from "@supabase/supabase-js";

interface CeilingResult {
  valid: boolean;
  reason?: string;
  currentStock?: number;
  maxAllowed?: number;
}

/**
 * Stock Ceiling Validation
 * Ensures stock_qty + proposed addition never exceeds
 * total purchased - total purchase-returned for a variant.
 *
 * @param supabase  - Supabase client
 * @param variantId - product_variants.id (sku_id)
 * @param qtyToAdd  - quantity being added to stock
 * @param operation - label for error messages (e.g. "Sale Return")
 */
export const validateStockCeiling = async (
  supabase: SupabaseClient,
  variantId: string,
  qtyToAdd: number,
  operation: string
): Promise<CeilingResult> => {
  try {
    // 1. Current stock
    const { data: variant, error: vErr } = await supabase
      .from("product_variants")
      .select("stock_qty, products(product_type)")
      .eq("id", variantId)
      .single();

    if (vErr) throw vErr;

    // Services / combos don't track stock
    const productType = (variant.products as any)?.product_type;
    if (productType === "service" || productType === "combo") {
      return { valid: true };
    }

    const currentStock = variant.stock_qty ?? 0;

    // 2. Total purchased qty for this variant (active rows only)
    const { data: purchaseRows, error: pErr } = await supabase
      .from("purchase_items")
      .select("qty")
      .eq("sku_id", variantId)
      .is("deleted_at", null);

    if (pErr) throw pErr;

    const totalPurchased = (purchaseRows ?? []).reduce(
      (sum: number, r: any) => sum + (Number(r.qty) || 0),
      0
    );

    // 3. Total purchase-returned qty for this variant (active rows only)
    const { data: returnRows, error: rErr } = await supabase
      .from("purchase_return_items")
      .select("qty")
      .eq("sku_id", variantId)
      .is("deleted_at", null);

    if (rErr) throw rErr;

    const totalPurchaseReturned = (returnRows ?? []).reduce(
      (sum: number, r: any) => sum + (Number(r.qty) || 0),
      0
    );

    // 4. Ceiling = purchased - purchase-returned
    const maxAllowed = totalPurchased - totalPurchaseReturned;
    const projectedStock = currentStock + qtyToAdd;

    if (projectedStock > maxAllowed) {
      return {
        valid: false,
        currentStock,
        maxAllowed,
        reason:
          `[${operation}] Stock ceiling exceeded. ` +
          `Current: ${currentStock}, Adding: +${qtyToAdd}, ` +
          `Projected: ${projectedStock}, Max allowed: ${maxAllowed} ` +
          `(Purchased: ${totalPurchased}, Returned: ${totalPurchaseReturned})`,
      };
    }

    return { valid: true, currentStock, maxAllowed };
  } catch (err) {
    console.error("[StockCeiling] validation error:", err);
    // On error, allow the operation (don't block business)
    return { valid: true };
  }
};

/**
 * Batch-validate multiple items against the stock ceiling.
 * Returns array of failing items (empty = all OK).
 */
export const validateBatchStockCeiling = async (
  supabase: SupabaseClient,
  items: Array<{ variantId: string; qtyToAdd: number; label?: string }>,
  operation: string
): Promise<Array<{ label: string; reason: string }>> => {
  const failures: Array<{ label: string; reason: string }> = [];

  for (const item of items) {
    if (!item.variantId) continue; // custom sizes
    const result = await validateStockCeiling(
      supabase,
      item.variantId,
      item.qtyToAdd,
      operation
    );
    if (!result.valid) {
      failures.push({
        label: item.label || item.variantId,
        reason: result.reason || "Stock ceiling exceeded",
      });
    }
  }

  return failures;
};
