import { supabase } from "@/integrations/supabase/client";
import { resolveVariantForIncomingPriceTier } from "@/utils/purchaseVariantPriceTierFork";

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

export type SyncVariantPriceResult = {
  /** Variant that received (or already had) the prices — may differ from input variantId after fork. */
  variantId: string;
  productId: string;
  forked: boolean;
} | null;

function parsePurchaseDate(purchaseDate?: string | null): string {
  if (purchaseDate && String(purchaseDate).trim()) {
    const trimmed = String(purchaseDate).trim();
    return new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed,
    ).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Sync purchase-line prices onto product_variants.
 * Updates both master prices AND last_purchase_* so POS/Sale do not show
 * Master ₹X vs Last Purchase ₹Y after a purchase-bill edit.
 *
 * When the incoming sale/MRP tier differs from the matched variant (universal
 * branded EAN at ₹729 vs ₹749), does NOT overwrite — forks a sibling SKU.
 */
export async function syncVariantPriceFromPurchase(
  params: SyncVariantPriceParams,
): Promise<SyncVariantPriceResult> {
  const { barcode, purPrice, salePrice, organizationId, variantId, mrp, purchaseDate } = params;

  if (!organizationId) return null;
  if (!variantId && !barcode) return null;
  if (purPrice <= 0 || salePrice <= 0) return null;

  const resolved = await resolveVariantForIncomingPriceTier({
    organizationId,
    variantId,
    barcode,
    incomingPurPrice: purPrice,
    incomingSalePrice: salePrice,
    incomingMrp: mrp,
    purchaseDate,
  });
  if (!resolved) return null;

  const lastPurchaseDate = parsePurchaseDate(purchaseDate);
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

  const { error } = await supabase
    .from("product_variants")
    .update(updates as never)
    .eq("organization_id", organizationId)
    .eq("id", resolved.variantId)
    .is("deleted_at", null);

  if (error) {
    console.warn(
      "[syncVariantPrice] Failed to sync price for barcode:",
      barcode || variantId,
      error.message,
    );
    return null;
  }

  return {
    variantId: resolved.variantId,
    productId: resolved.productId,
    forked: resolved.forked,
  };
}

export type SyncLastPurchaseBillItem = {
  sku_id?: string | null;
  product_id?: string | null;
  barcode?: string | null;
  pur_price: number;
  sale_price: number;
  mrp?: number | null;
  /** purchase_items.id — when set, repoint sku_id after tier fork. */
  purchaseItemId?: string | null;
  /** Skip master sync / tier fork — bill line keeps typed price on linked sku. */
  linkExistingSku?: boolean;
};

/**
 * After a purchase bill save/edit, force last_purchase_* (and master) to match
 * the bill lines for the given SKUs — covers the case where live master sync
 * already matched sale_price so the Price Update dialog was skipped.
 */
export async function syncLastPurchaseFromBillLines(opts: {
  organizationId: string;
  purchaseDate?: string | null;
  items: SyncLastPurchaseBillItem[];
}): Promise<number> {
  const { organizationId, purchaseDate, items } = opts;
  if (!organizationId || items.length === 0) return 0;

  const unique: SyncLastPurchaseBillItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.linkExistingSku) continue;
    const key = item.purchaseItemId || item.sku_id || item.barcode || "";
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
      chunk.map(async (item) => {
        const result = await syncVariantPriceFromPurchase({
          barcode: item.barcode || "",
          purPrice: Number(item.pur_price) || 0,
          salePrice: Number(item.sale_price) || 0,
          organizationId,
          variantId: item.sku_id || undefined,
          mrp: item.mrp != null ? Number(item.mrp) : undefined,
          purchaseDate,
        });

        if (
          result?.forked &&
          item.purchaseItemId &&
          result.variantId !== item.sku_id
        ) {
          const itemUpdates: Record<string, string> = { sku_id: result.variantId };
          if (item.product_id && result.productId !== item.product_id) {
            itemUpdates.product_id = result.productId;
          }
          const { error: repointErr } = await supabase
            .from("purchase_items")
            .update(itemUpdates as never)
            .eq("id", item.purchaseItemId);
          if (repointErr) {
            console.warn(
              "[syncVariantPrice] Failed to repoint purchase_items after tier fork:",
              item.purchaseItemId,
              repointErr.message,
            );
          }
        }
      }),
    );
  }
  return unique.length;
}

/**
 * Resolve line sku_id/product_id before purchase_items insert when bill lines
 * carry a different sale/MRP tier than the matched variant.
 */
export async function resolvePurchaseLineItemsForPriceTiers<T extends {
  sku_id: string;
  product_id: string;
  barcode?: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  linkExistingSku?: boolean;
}>(
  organizationId: string,
  items: T[],
  purchaseDate?: string | null,
): Promise<T[]> {
  const resolved: T[] = [];
  for (const item of items) {
    if (item.linkExistingSku) {
      resolved.push(item);
      continue;
    }
    if (!item.sku_id || item.sale_price <= 0 || item.pur_price <= 0) {
      resolved.push(item);
      continue;
    }
    const forked = await resolveVariantForIncomingPriceTier({
      organizationId,
      variantId: item.sku_id,
      barcode: item.barcode,
      incomingPurPrice: item.pur_price,
      incomingSalePrice: item.sale_price,
      incomingMrp: item.mrp,
      purchaseDate,
    });
    if (!forked || forked.variantId === item.sku_id) {
      resolved.push(item);
      continue;
    }
    resolved.push({
      ...item,
      sku_id: forked.variantId,
      product_id: forked.productId,
    });
  }
  return resolved;
}
