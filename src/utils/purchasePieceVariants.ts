import { supabase } from "@/integrations/supabase/client";
import { generateNextBarcodes } from "@/lib/data/barcodeSeries";
import {
  ensureFreshGeneratedBarcode,
  ensureFreshGeneratedBarcodes,
  isBarcodeCollisionError,
} from "@/utils/barcodeCollisionGuard";
import { reuseOrRecycleGeneratedSkusOnProduct } from "@/utils/recycleUnusedGeneratedBarcode";

/**
 * Settings > Purchase "Individual barcode for every piece": one size with qty 65 becomes 65
 * SKUs, each with its own generated barcode. Doing that one piece at a time cost 4–6 requests
 * per piece (leftover check, barcode, freshness check, insert), so 65 pieces took about a
 * minute and the lines appeared on the bill one by one.
 *
 * Here all pieces of one size are made together: at most one leftover SKU reused, all
 * barcodes in one request (generate_next_barcodes), one freshness lookup, one insert.
 * Same barcode series and order as separate calls.
 */
export interface PieceVariantsRequest {
  organizationId: string;
  productId: string;
  size: string;
  color: string | null;
  pur_price: number;
  sale_price: number;
  mrp: number;
  /** How many pieces (SKUs) to return. */
  count: number;
  /** Reuse one unused leftover SKU of this size/colour first (fork path), as before. */
  reuseLeftover: boolean;
  /** SKUs already on the bill / created for this draft — never reused or recycled. */
  excludeSkuIds: string[];
}

export interface PieceVariant {
  id: string;
  barcode: string;
  reused?: boolean;
}

export async function createPieceVariantsInBulk(req: PieceVariantsRequest): Promise<PieceVariant[]> {
  const { organizationId: orgId, count } = req;
  if (!orgId || !req.productId || count <= 0) return [];
  const out: PieceVariant[] = [];

  if (req.reuseLeftover) {
    const { reusable } = await reuseOrRecycleGeneratedSkusOnProduct({
      organizationId: orgId,
      productId: req.productId,
      size: req.size,
      color: req.color,
      excludeSkuIds: req.excludeSkuIds,
    });
    if (reusable) out.push({ ...reusable, reused: true });
  }

  const need = count - out.length;
  if (need <= 0) return out.slice(0, count);

  const claimed = new Set(out.map((p) => p.barcode).filter(Boolean));
  const candidates = await generateNextBarcodes(orgId, need);
  const barcodes = await ensureFreshGeneratedBarcodes(orgId, candidates, claimed);

  const rows = barcodes.map((barcode) => ({
    organization_id: orgId,
    product_id: req.productId,
    size: req.size || "",
    color: req.color,
    barcode,
    barcode_source: "generated",
    pur_price: req.pur_price || 0,
    sale_price: req.sale_price || 0,
    mrp: req.mrp || 0,
    stock_qty: 0,
    active: true,
  }));

  const insert = () =>
    supabase.from("product_variants").insert(rows as never).select("id, barcode");

  let { data, error } = await insert();
  if (error && isBarcodeCollisionError(error)) {
    // Another till took one of these numbers between the check and the insert: re-check each.
    const retryClaimed = new Set(out.map((p) => p.barcode).filter(Boolean));
    for (const row of rows) {
      row.barcode = await ensureFreshGeneratedBarcode(orgId, row.barcode, retryClaimed);
    }
    ({ data, error } = await insert());
  }
  if (error) throw error;

  const byBarcode = new Map(
    ((data as { id: string; barcode: string | null }[] | null) ?? []).map((r) => [String(r.barcode ?? "").trim(), r.id]),
  );
  for (const row of rows) {
    const id = byBarcode.get(row.barcode.trim());
    if (!id) throw new Error(`Piece barcode ${row.barcode} was not saved`);
    out.push({ id, barcode: row.barcode });
  }
  return out;
}
