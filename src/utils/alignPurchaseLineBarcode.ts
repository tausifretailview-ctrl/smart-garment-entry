import { supabase } from "@/integrations/supabase/client";
import { isBarcodeCollisionError } from "@/utils/barcodeCollisionGuard";
import {
  planPurchaseBillBarcodeAlign,
  type PurchaseLineBarcodeAlignPlan,
  type PurchaseLineForBarcodeAlign,
} from "@/utils/purchaseLineBarcodeMatch";

const ID_CHUNK = 200;

/**
 * Write `barcode` onto a variant only while its barcode is still empty.
 * Returns the barcode that is on the variant afterwards (the one written, or
 * the one that won a concurrent fill).
 */
export async function writeBarcodeOntoEmptySku(
  organizationId: string,
  skuId: string,
  barcode: string,
): Promise<string> {
  const next = barcode.trim();
  if (!organizationId || !skuId || !next) return next;

  const { data: row, error: readError } = await supabase
    .from("product_variants")
    .select("barcode")
    .eq("id", skuId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw readError;

  const live = (row?.barcode || "").trim();
  if (live) return live;

  const { error: writeError } = await supabase
    .from("product_variants")
    .update({ barcode: next })
    .eq("id", skuId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (writeError) {
    if (isBarcodeCollisionError(writeError)) {
      throw new Error(
        `Barcode ${next} is already used on this size and color. The bill was not saved with a different barcode.`,
      );
    }
    throw writeError;
  }
  return next;
}

/**
 * Before purchase_items are written, the line barcode and the stocked SKU
 * barcode are the same number. A non-empty SKU barcode replaces a different
 * line barcode. An empty SKU receives the line barcode.
 */
export async function alignPurchaseBillLinesToStockedBarcodes<
  T extends PurchaseLineForBarcodeAlign,
>(
  organizationId: string,
  lines: T[],
): Promise<PurchaseLineBarcodeAlignPlan<T>> {
  const skuIds = [
    ...new Set(lines.map((line) => (line.sku_id || "").trim()).filter(Boolean)),
  ];
  if (!organizationId || skuIds.length === 0) {
    return { lines, writes: [], corrections: [], conflict: null };
  }

  const skuBarcodeById = new Map<string, string>();
  for (let offset = 0; offset < skuIds.length; offset += ID_CHUNK) {
    const chunk = skuIds.slice(offset, offset + ID_CHUNK);
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, barcode")
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      skuBarcodeById.set(row.id, (row.barcode || "").trim());
    }
  }

  const plan = planPurchaseBillBarcodeAlign(lines, skuBarcodeById);
  if (plan.conflict) return plan;

  for (const write of plan.writes) {
    let stocked = write.barcode;
    try {
      stocked = await writeBarcodeOntoEmptySku(organizationId, write.skuId, write.barcode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not store the line barcode on the stocked item.";
      return { lines, writes: [], corrections: [], conflict: message };
    }
    if (stocked === write.barcode) continue;
    plan.lines = plan.lines.map((line) =>
      (line.sku_id || "").trim() === write.skuId ? { ...line, barcode: stocked } : line,
    );
    const sample = lines.find((line) => (line.sku_id || "").trim() === write.skuId);
    plan.corrections.push({
      productName: (sample?.product_name || "").trim() || "This item",
      from: write.barcode,
      to: stocked,
    });
  }

  return plan;
}

/**
 * After a variant barcode change, purchase lines for that SKU follow it.
 * purchase_items has no organization_id; the rows are chosen through
 * purchase_bills.organization_id, then updated by those ids.
 */
export async function syncPurchaseItemBarcodesForSku(
  organizationId: string,
  skuId: string,
  barcode: string,
): Promise<number> {
  const next = barcode.trim();
  if (!organizationId || !skuId || !next) return 0;

  const ids: string[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("purchase_items")
      .select("id, barcode, purchase_bills!inner(organization_id)")
      .eq("sku_id", skuId)
      .eq("purchase_bills.organization_id", organizationId)
      .is("deleted_at", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      if ((row.barcode || "").trim() !== next) ids.push(row.id);
    }
    if (rows.length < pageSize) break;
  }

  let updated = 0;
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    const chunk = ids.slice(offset, offset + ID_CHUNK);
    const { error } = await supabase
      .from("purchase_items")
      .update({ barcode: next })
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    updated += chunk.length;
  }
  return updated;
}
