import { supabase } from "@/integrations/supabase/client";
import { expandBarcodeScanCandidates } from "@/utils/barcodeScanResolve";
import { lookupVariantRowsByScan } from "@/utils/lookupVariantByScan";

const VARIANT_SELECT =
  "id, product_id, size, color, sale_price, stock_qty, barcode, active, deleted_at, products(id, product_name, brand, category, hsn_code, gst_per, status, deleted_at)";

export type SaleReturnLookupProduct = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  hsn_code: string | null;
};

export type SaleReturnLookupVariant = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  sale_price: number;
  stock_qty: number;
  barcode: string | null;
  gst_per: number;
};

export type SaleReturnBarcodeMatch = {
  product: SaleReturnLookupProduct;
  variant: SaleReturnLookupVariant;
  scannedBarcode: string;
  /** True when sale_items.barcode is not the live variant barcode (merge remap). */
  resolvedViaSaleLine: boolean;
};

type VariantLookupRow = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  sale_price: number | null;
  stock_qty: number | null;
  barcode: string | null;
  active: boolean | null;
  deleted_at: string | null;
  products?: {
    id: string;
    product_name: string;
    brand: string | null;
    category: string | null;
    hsn_code: string | null;
    gst_per: number | null;
    status: string | null;
    deleted_at: string | null;
  } | null;
};

export function isLiveSaleReturnVariant(row: {
  deleted_at?: string | null;
  active?: boolean | null;
  products?: { deleted_at?: string | null; status?: string | null } | null;
}): boolean {
  if (row.deleted_at) return false;
  if (row.active === false) return false;
  const product = row.products;
  if (!product) return false;
  if (product.deleted_at) return false;
  if (product.status && product.status !== "active") return false;
  return true;
}

export function mapSaleReturnLookupRow(
  row: VariantLookupRow,
  scannedBarcode: string,
  resolvedViaSaleLine: boolean,
): SaleReturnBarcodeMatch | null {
  if (!isLiveSaleReturnVariant(row) || !row.products) return null;
  const p = row.products;
  return {
    product: {
      id: p.id,
      product_name: p.product_name,
      brand: p.brand,
      category: p.category,
      hsn_code: p.hsn_code,
    },
    variant: {
      id: row.id,
      product_id: row.product_id,
      size: row.size,
      color: row.color,
      sale_price: row.sale_price || 0,
      stock_qty: row.stock_qty || 0,
      barcode: scannedBarcode || row.barcode,
      gst_per: p.gst_per || 0,
    },
    scannedBarcode,
    resolvedViaSaleLine,
  };
}

function asVariantRow(row: Record<string, unknown>): VariantLookupRow {
  return row as unknown as VariantLookupRow;
}

/**
 * Resolve a sale-return scan the same way invoice search does: sale_items.barcode
 * first when the live variant barcode was remapped (KS Footwear merge).
 */
export async function lookupSoldVariantForSaleReturn(
  organizationId: string,
  raw: string,
): Promise<SaleReturnBarcodeMatch | null> {
  const scanned = raw.trim();
  if (!organizationId || !scanned) return null;

  const candidates = expandBarcodeScanCandidates(scanned);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("product_variants")
      .select(VARIANT_SELECT)
      .eq("organization_id", organizationId)
      .eq("barcode", candidate)
      .eq("active", true)
      .is("deleted_at", null)
      .limit(10);
    if (error) throw error;

    for (const row of (data || []) as unknown as VariantLookupRow[]) {
      const mapped = mapSaleReturnLookupRow(row, candidate, false);
      if (!mapped) continue;
      const sold = await variantHasSales(organizationId, mapped.variant.id, candidate);
      if (sold) return mapped;
    }
  }

  const saleVariantIds = await fetchSaleLineVariantIds(organizationId, candidates);
  if (saleVariantIds.length) {
    const { data: byId, error: byIdErr } = await supabase
      .from("product_variants")
      .select(VARIANT_SELECT)
      .eq("organization_id", organizationId)
      .in("id", saleVariantIds)
      .limit(25);
    if (byIdErr) throw byIdErr;

    const live = ((byId || []) as unknown as VariantLookupRow[]).find((row) =>
      isLiveSaleReturnVariant(row),
    );
    if (live) {
      const mapped = mapSaleReturnLookupRow(live, scanned, true);
      if (mapped) return mapped;
    }
  }

  const scan = await lookupVariantRowsByScan(
    organizationId,
    scanned,
    VARIANT_SELECT,
    supabase,
    { exactOnly: true },
  );
  for (const row of scan.rows) {
    const mapped = mapSaleReturnLookupRow(asVariantRow(row), scanned, true);
    if (!mapped) continue;
    const sold = await variantHasSales(organizationId, mapped.variant.id, scanned);
    if (sold) return mapped;
  }

  return null;
}

async function fetchSaleLineVariantIds(
  organizationId: string,
  candidates: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("variant_id, sales!sale_items_sale_id_fkey!inner(organization_id, deleted_at)")
      .eq("sales.organization_id", organizationId)
      .is("sales.deleted_at", null)
      .is("deleted_at", null)
      .eq("barcode", candidate)
      .not("variant_id", "is", null)
      .limit(50);
    if (error) throw error;
    for (const row of data || []) {
      if (row.variant_id) ids.add(row.variant_id);
    }
  }
  return Array.from(ids);
}

async function variantHasSales(
  organizationId: string,
  variantId: string,
  barcode: string,
): Promise<boolean> {
  const { sold } = await countSoldAndReturnedForSaleReturn(organizationId, variantId, barcode);
  return sold > 0;
}

/** Org-scoped sold − already returned, matching remapped sku or sale-line barcode. */
export async function countSoldAndReturnedForSaleReturn(
  organizationId: string,
  variantId: string,
  barcode: string,
): Promise<{ sold: number; returned: number; maxReturnable: number }> {
  const { data: soldRows, error: soldErr } = await supabase
    .from("sale_items")
    .select("quantity, variant_id, barcode, sales!sale_items_sale_id_fkey!inner(organization_id, deleted_at)")
    .eq("sales.organization_id", organizationId)
    .is("sales.deleted_at", null)
    .is("deleted_at", null)
    .or(`variant_id.eq.${variantId},barcode.eq.${barcode}`);
  if (soldErr) throw soldErr;

  const sold = (soldRows || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const { data: retRows, error: retErr } = await supabase
    .from("sale_return_items")
    .select("quantity, variant_id, barcode, sale_returns!inner(organization_id, deleted_at)")
    .eq("sale_returns.organization_id", organizationId)
    .is("sale_returns.deleted_at", null)
    .is("deleted_at", null)
    .or(`variant_id.eq.${variantId},barcode.eq.${barcode}`);
  if (retErr) throw retErr;

  const returned = (retRows || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  return { sold, returned, maxReturnable: sold - returned };
}

/** Qty of a variant on a loaded sale, matching sku or line barcode. */
export function soldQtyOnLoadedSaleReturnBill(
  billItems: Array<{ variant_id: string; barcode?: string | null; quantity?: number | null }>,
  variantId: string,
  barcode: string | null,
): number {
  return billItems
    .filter((bi) => bi.variant_id === variantId || (barcode && bi.barcode === barcode))
    .reduce((sum, bi) => sum + (Number(bi.quantity) || 0), 0);
}

export type SaleReturnQtyBlock = "ok" | "not-sold" | "over-limit";

/** Bill-scoped: must have been on this sale, and cart qty cannot exceed that sale's sold qty. */
export function gateSaleReturnAgainstBillSold(
  soldQty: number,
  proposedTotalCartQty: number,
): SaleReturnQtyBlock {
  if (soldQty <= 0) return "not-sold";
  if (proposedTotalCartQty > soldQty) return "over-limit";
  return "ok";
}

/** No bill loaded: must have sold > 0 org-wide, and cart qty cannot exceed sold − already returned. */
export function gateSaleReturnAgainstHistory(
  sold: number,
  maxReturnable: number,
  proposedTotalCartQty: number,
): SaleReturnQtyBlock {
  if (sold <= 0) return "not-sold";
  if (proposedTotalCartQty > maxReturnable) return "over-limit";
  return "ok";
}

