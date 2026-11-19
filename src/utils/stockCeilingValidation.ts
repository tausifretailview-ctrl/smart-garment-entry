import { SupabaseClient } from "@supabase/supabase-js";

interface CeilingResult {
  valid: boolean;
  reason?: string;
  currentStock?: number;
  maxAllowed?: number;
}

/** Transfer states whose stock has left the sending shop (a rejected/cancelled one went back). */
export const TRANSFER_OUT_STATUSES = ["pending", "accepted"] as const;
/** Transfer state whose stock has arrived in the receiving shop. */
export const TRANSFER_IN_STATUS = "accepted";

/**
 * Most stock a variant can hold: what came in (opening, purchases, stock transfers received)
 * minus what went back out without a sale (purchase returns, stock transfers sent).
 * Same formula as the database trigger check_stock_ceiling_on_sale_return.
 */
export function stockCeilingMax(parts: {
  opening: number;
  purchased: number;
  purchaseReturned: number;
  transferredIn?: number;
  transferredOut?: number;
}): number {
  const n = (v: unknown) => Number(v) || 0;
  return (
    n(parts.opening) +
    n(parts.purchased) -
    n(parts.purchaseReturned) +
    n(parts.transferredIn) -
    n(parts.transferredOut)
  );
}

/**
 * Stock Ceiling Validation
 * Ensures stock_qty + proposed addition never exceeds
 * total purchased - total purchase-returned for a variant, counting stock transfers
 * between sibling shops (an item that arrived by transfer was never purchased there).
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
      .select("stock_qty, opening_qty, products(product_type)")
      .eq("id", variantId)
      .single();

    if (vErr) throw vErr;

    // Services / combos don't track stock
    const productType = (variant.products as any)?.product_type;
    if (productType === "service" || productType === "combo") {
      return { valid: true };
    }

    const currentStock = variant.stock_qty ?? 0;
    const openingQty = (variant as any).opening_qty ?? 0;

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

    // 4. Stock transfers: received here (accepted) and sent from here (not rejected/cancelled)
    const sumQty = (rows: Array<{ qty: unknown }> | null) =>
      (rows ?? []).reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const [inRes, outRes] = await Promise.all([
      supabase
        .from("stock_transfer_items")
        .select("qty, stock_transfers!inner(status)")
        .eq("to_variant_id", variantId)
        .eq("stock_transfers.status", TRANSFER_IN_STATUS),
      supabase
        .from("stock_transfer_items")
        .select("qty, stock_transfers!inner(status)")
        .eq("from_variant_id", variantId)
        .in("stock_transfers.status", [...TRANSFER_OUT_STATUSES]),
    ]);
    if (inRes.error) throw inRes.error;
    if (outRes.error) throw outRes.error;
    const transferredIn = sumQty(inRes.data as Array<{ qty: unknown }> | null);
    const transferredOut = sumQty(outRes.data as Array<{ qty: unknown }> | null);

    // 5. Ceiling = opening + purchased - purchase-returned + transferred in - transferred out
    const maxAllowed = stockCeilingMax({
      opening: openingQty,
      purchased: totalPurchased,
      purchaseReturned: totalPurchaseReturned,
      transferredIn,
      transferredOut,
    });
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
          `(Opening: ${openingQty}, Purchased: ${totalPurchased}, Returned: ${totalPurchaseReturned}` +
          `${transferredIn || transferredOut ? `, Transfer in: ${transferredIn}, Transfer out: ${transferredOut}` : ""})`,
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
