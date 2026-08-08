import { supabase } from "@/integrations/supabase/client";

interface SyncVariantPriceParams {
  barcode: string;
  purPrice: number;
  salePrice: number;
  organizationId: string;
  /** Preferred key — barcode is not org-unique in DB (composite index is product+color+size+barcode). */
  variantId?: string;
  /** Optional MRP — when set, also syncs master + last_purchase MRP. */
  mrp?: number;
  /**
   * Purchase bill date (yyyy-MM-dd or ISO). Used for last_purchase_date so POS
   * "Last Purchase Price" matches this bill, not only master sale_price.
   */
  purchaseDate?: string | null;
}

/**
 * Sync purchase-line prices onto product_variants.
 * Updates both master prices AND last_purchase_* so POS/Sale do not show
 * Master ₹X vs Last Purchase ₹Y after a purchase-bill edit.
 */
export async function syncVariantPriceFromPurchase({
  barcode,
  purPrice,
  salePrice,
  organizationId,
  variantId,
  mrp,
  purchaseDate,
}: SyncVariantPriceParams): Promise<void> {
  if (!organizationId) return;
  if (!variantId && !barcode) return;
  if (purPrice <= 0 || salePrice <= 0) return;

  const lastPurchaseDate =
    purchaseDate && String(purchaseDate).trim()
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(String(purchaseDate).trim())
            ? `${String(purchaseDate).trim()}T12:00:00`
            : purchaseDate,
        ).toISOString()
      : new Date().toISOString();

  const updates: Record<string, number | string> = {
    pur_price: purPrice,
    sale_price: salePrice,
    last_purchase_pur_price: purPrice,
    last_purchase_sale_price: salePrice,
    last_purchase_date: lastPurchaseDate,
  };

  const mrpVal = Number(mrp);
  if (Number.isFinite(mrpVal) && mrpVal > 0) {
    updates.mrp = mrpVal;
    updates.last_purchase_mrp = mrpVal;
  }

  let query = supabase
    .from("product_variants")
    .update(updates)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (variantId) {
    query = query.eq("id", variantId);
  } else {
    query = query.eq("barcode", barcode);
  }

  const { error } = await query;

  if (error) {
    console.warn(
      "[syncVariantPrice] Failed to sync price for barcode:",
      barcode,
      error.message,
    );
  }
}

/**
 * After a purchase bill save/edit, force last_purchase_* (and master) to match
 * the bill lines for the given SKUs — covers the case where live master sync
 * already matched sale_price so the Price Update dialog was skipped.
 */
export async function syncLastPurchaseFromBillLines(opts: {
  organizationId: string;
  purchaseDate?: string | null;
  items: Array<{
    sku_id?: string | null;
    barcode?: string | null;
    pur_price: number;
    sale_price: number;
    mrp?: number | null;
  }>;
}): Promise<number> {
  const { organizationId, purchaseDate, items } = opts;
  if (!organizationId || items.length === 0) return 0;

  const unique: typeof items = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.sku_id || item.barcode || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const purPrice = Number(item.pur_price) || 0;
    const salePrice = Number(item.sale_price) || 0;
    if (purPrice <= 0 || salePrice <= 0) continue;
    unique.push(item);
  }

  const CHUNK = 10;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((item) =>
        syncVariantPriceFromPurchase({
          barcode: item.barcode || "",
          purPrice: Number(item.pur_price) || 0,
          salePrice: Number(item.sale_price) || 0,
          organizationId,
          variantId: item.sku_id || undefined,
          mrp: item.mrp != null ? Number(item.mrp) : undefined,
          purchaseDate,
        }),
      ),
    );
  }
  return unique.length;
}
