import { supabase } from "@/integrations/supabase/client";
import { canonicalOnHandQty } from "@/utils/canonicalOnHandQty";
import {
  lookupVariantRowsByScan,
  pickBestVariantScanRow,
} from "@/utils/lookupVariantByScan";

export type BarcodeStockMatch = {
  variantId: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  size: string;
  color: string | null;
  barcode: string | null;
  currentStock: number;
  salePrice: number;
  mrp: number;
  purPrice: number;
};

const VARIANT_STOCK_SELECT =
  "id, barcode, size, color, current_stock, stock_qty, sale_price, mrp, pur_price, product_id, products!inner(id, product_name, brand, category, style, organization_id, deleted_at)";

function mapStockRow(row: Record<string, unknown>, organizationId: string): BarcodeStockMatch | null {
  const p = row.products as Record<string, unknown> | null | undefined;
  if (!p || p.deleted_at || p.organization_id !== organizationId) return null;

  return {
    variantId: String(row.id),
    productId: String(row.product_id),
    productName: String(p.product_name),
    brand: p.brand != null ? String(p.brand) : null,
    category: p.category != null ? String(p.category) : null,
    style: p.style != null ? String(p.style) : null,
    size: String(row.size ?? "—"),
    color: row.color != null ? String(row.color) : null,
    barcode: row.barcode != null ? String(row.barcode) : null,
    currentStock: canonicalOnHandQty(row),
    salePrice: Number(row.sale_price) || 0,
    mrp: Number(row.mrp) || 0,
    purPrice: Number(row.pur_price) || 0,
  };
}

/**
 * Look up product variant(s) by barcode for quick stock check (mobile scan).
 * Uses canonical scan resolution: doubled-read candidates + purchase_items fallback.
 */
export async function lookupBarcodeStock(
  organizationId: string,
  barcode: string,
): Promise<BarcodeStockMatch[]> {
  if (!barcode.trim() || !organizationId) return [];

  const lookup = await lookupVariantRowsByScan(organizationId, barcode, VARIANT_STOCK_SELECT, supabase);
  if (!lookup.rows.length) return [];

  return lookup.rows
    .map((row) => mapStockRow(row, organizationId))
    .filter((m): m is BarcodeStockMatch => m != null);
}

export { lookupVariantRowsByScan, pickBestVariantScanRow };
