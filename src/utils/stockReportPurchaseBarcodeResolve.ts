/**
 * When Stock Report search misses a barcode that still exists on purchase_items
 * (denormalized snapshot), resolve to the live product_variants row.
 *
 * Purchase Bills searches purchase_items.barcode; get_stock_report searches
 * product_variants.barcode with active / non-deleted gates. After merges
 * (e.g. KS Footwear duplicate masters) those can diverge.
 */

export const PURCHASE_BARCODE_STOCK_RESOLVE_SELECT =
  "sku_id, barcode, purchase_bills!inner(organization_id)" as const;

export type PurchaseBarcodeStockClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "purchase_items" | "product_variants") => any;
};

export type PurchaseBarcodeStockResolution = {
  purchaseBarcode: string;
  skuId: string;
  liveBarcode: string | null;
  productName: string | null;
  stockQty: number | null;
  /** Non-null ⇒ row cannot appear in get_stock_report base CTE */
  excludeReason: string | null;
};

export function isStockReportBarcodeLikeSearch(term: string): boolean {
  const t = term.trim();
  return t.length >= 4 && /^\d+$/.test(t);
}

/**
 * Org-scoped purchase_items → sku_id for a barcode fragment.
 */
export async function fetchPurchaseBarcodeSkuIds(
  client: PurchaseBarcodeStockClient,
  organizationId: string,
  barcode: string,
): Promise<Array<{ skuId: string; purchaseBarcode: string }>> {
  if (!organizationId || !barcode.trim()) return [];

  const { data, error } = await client
    .from("purchase_items")
    .select(PURCHASE_BARCODE_STOCK_RESOLVE_SELECT)
    .eq("purchase_bills.organization_id", organizationId)
    .is("purchase_bills.deleted_at", null)
    .ilike("barcode", `%${barcode.trim()}%`)
    .not("sku_id", "is", null)
    .is("deleted_at", null)
    .limit(50);

  if (error) throw error;

  const out: Array<{ skuId: string; purchaseBarcode: string }> = [];
  const seen = new Set<string>();
  for (const row of data || []) {
    const skuId = row.sku_id as string | null;
    const purchaseBarcode = String(row.barcode || "");
    if (!skuId || seen.has(skuId)) continue;
    seen.add(skuId);
    out.push({ skuId, purchaseBarcode });
  }
  return out;
}

/**
 * Load live variant/product gates for sku_ids (Stock Report eligibility).
 */
export async function resolvePurchaseBarcodesForStockReport(
  client: PurchaseBarcodeStockClient,
  organizationId: string,
  barcode: string,
): Promise<PurchaseBarcodeStockResolution[]> {
  const links = await fetchPurchaseBarcodeSkuIds(client, organizationId, barcode);
  if (links.length === 0) return [];

  const skuIds = links.map((l) => l.skuId);
  const { data, error } = await client
    .from("product_variants")
    .select(
      "id, barcode, stock_qty, active, deleted_at, products!inner(product_name, deleted_at, product_type)",
    )
    .eq("organization_id", organizationId)
    .in("id", skuIds);

  if (error) throw error;

  const byId = new Map<string, any>();
  for (const row of data || []) byId.set(row.id, row);

  return links.map(({ skuId, purchaseBarcode }) => {
    const pv = byId.get(skuId);
    if (!pv) {
      return {
        purchaseBarcode,
        skuId,
        liveBarcode: null,
        productName: null,
        stockQty: null,
        excludeReason: "Purchase line sku_id has no product_variants row",
      };
    }
    const product = Array.isArray(pv.products) ? pv.products[0] : pv.products;
    let excludeReason: string | null = null;
    if (pv.deleted_at) {
      excludeReason = "Variant is soft-deleted (Stock Report hides deleted variants)";
    } else if (pv.active === false) {
      excludeReason = "Variant is inactive (Stock Report requires active=true)";
    } else if (product?.deleted_at) {
      excludeReason =
        "Product master is soft-deleted (Stock Report requires an active product)";
    } else if (product?.product_type === "service") {
      excludeReason = "Product is a service (excluded from Stock Report)";
    }

    return {
      purchaseBarcode,
      skuId,
      liveBarcode: pv.barcode != null ? String(pv.barcode) : null,
      productName: product?.product_name != null ? String(product.product_name) : null,
      stockQty: pv.stock_qty != null ? Number(pv.stock_qty) : null,
      excludeReason,
    };
  });
}

/** Live barcodes to re-query get_stock_report with when purchase barcode ≠ master. */
export function liveBarcodesForStockReportRetry(
  resolutions: PurchaseBarcodeStockResolution[],
  searchedBarcode: string,
): string[] {
  const searched = searchedBarcode.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of resolutions) {
    if (r.excludeReason) continue;
    const live = (r.liveBarcode || "").trim();
    if (!live) continue;
    const key = live.toLowerCase();
    if (seen.has(key)) continue;
    // Prefer retry when live differs OR when live equals search (RPC should have
    // found it — still allow retry for pagination/filter edge cases).
    seen.add(key);
    out.push(live);
  }
  // If every live barcode equals the search term, retry is pointless for "empty RPC".
  if (out.length === 1 && out[0].toLowerCase() === searched) return [];
  if (out.every((b) => b.toLowerCase() === searched)) return [];
  return out;
}
