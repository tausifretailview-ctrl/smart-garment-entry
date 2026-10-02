/**
 * When Stock Report search misses a barcode that still exists on purchase_items
 * (denormalized snapshot), resolve to the live product_variants row.
 *
 * Purchase Bills searches purchase_items.barcode; get_stock_report searches
 * product_variants.barcode with active / non-deleted gates. After merges
 * (e.g. KS Footwear duplicate masters) those can diverge.
 */

export const PURCHASE_BARCODE_STOCK_RESOLVE_SELECT =
  "sku_id, barcode, product_name, size, purchase_bills!inner(organization_id)" as const;

export type PurchaseBarcodeStockClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "purchase_items" | "product_variants") => any;
};

export type PurchaseBarcodeStockResolution = {
  purchaseBarcode: string;
  skuId: string;
  liveBarcode: string | null;
  productName: string | null;
  /** Product name printed on the purchase line (snapshot at bill time). */
  purchaseProductName?: string | null;
  /** Size on the purchase line / on the live variant (KS Footwear: same name, many sizes). */
  purchaseSize?: string | null;
  liveSize?: string | null;
  stockQty: number | null;
  /** Live variant found by name + size because the line's own SKU was deleted. */
  viaTwin?: boolean;
  /** Non-null ⇒ row cannot appear in get_stock_report base CTE */
  excludeReason: string | null;
};

export function isStockReportBarcodeLikeSearch(term: string): boolean {
  const t = term.trim();
  return t.length >= 4 && /^\d+$/.test(t);
}

export type PurchaseLineLink = {
  skuId: string;
  purchaseBarcode: string;
  purchaseProductName: string | null;
  purchaseSize: string | null;
};

/**
 * Org-scoped purchase_items → sku_id for a barcode fragment.
 */
export async function fetchPurchaseBarcodeSkuIds(
  client: PurchaseBarcodeStockClient,
  organizationId: string,
  barcode: string,
  options?: { exactOnly?: boolean },
): Promise<PurchaseLineLink[]> {
  if (!organizationId || !barcode.trim()) return [];

  const trimmed = barcode.trim();
  let query = client
    .from("purchase_items")
    .select(PURCHASE_BARCODE_STOCK_RESOLVE_SELECT)
    .eq("purchase_bills.organization_id", organizationId)
    .is("purchase_bills.deleted_at", null)
    .not("sku_id", "is", null)
    .is("deleted_at", null)
    .limit(50);

  if (options?.exactOnly) {
    query = query.eq("barcode", trimmed);
  } else {
    query = query.ilike("barcode", `%${trimmed}%`);
  }

  const { data, error } = await query;

  const out: PurchaseLineLink[] = [];
  const seen = new Set<string>();
  for (const row of data || []) {
    const skuId = row.sku_id as string | null;
    const purchaseBarcode = String(row.barcode || "");
    if (!skuId || seen.has(skuId)) continue;
    seen.add(skuId);
    const purchaseProductName = row.product_name != null ? String(row.product_name) : null;
    const purchaseSize = row.size != null ? String(row.size) : null;
    out.push({ skuId, purchaseBarcode, purchaseProductName, purchaseSize });
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
  options?: { exactOnly?: boolean },
): Promise<PurchaseBarcodeStockResolution[]> {
  const links = await fetchPurchaseBarcodeSkuIds(client, organizationId, barcode, options);
  if (links.length === 0) return [];

  const skuIds = links.map((l) => l.skuId);
  const { data, error } = await client
    .from("product_variants")
    .select(
      "id, barcode, size, stock_qty, active, deleted_at, products!inner(product_name, deleted_at, product_type)",
    )
    .eq("organization_id", organizationId)
    .in("id", skuIds);

  if (error) throw error;

  const byId = new Map<string, any>();
  for (const row of data || []) byId.set(row.id, row);

  const resolutions: PurchaseBarcodeStockResolution[] = links.map(({ skuId, purchaseBarcode, purchaseProductName, purchaseSize }) => {
    const pv = byId.get(skuId);
    if (!pv) {
      return {
        purchaseBarcode,
        purchaseProductName,
        purchaseSize,
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
      purchaseProductName,
      purchaseSize,
      skuId,
      liveBarcode: pv.barcode != null ? String(pv.barcode) : null,
      liveSize: pv.size != null ? String(pv.size) : null,
      productName: product?.product_name != null ? String(product.product_name) : null,
      stockQty: pv.stock_qty != null ? Number(pv.stock_qty) : null,
      excludeReason,
    };
  });

  // The line's own SKU was deleted (duplicate masters cleaned up): add the live variant of
  // the same product name + size so a box sticker still opens the item that holds the stock.
  if (!resolutions.some((r) => !r.excludeReason)) {
    try {
      resolutions.push(...(await findLiveTwinsForDeletedLines(client, organizationId, resolutions)));
    } catch {
      /* lookup failure: keep today's behaviour */
    }
  }
  return resolutions;
}

function isDeletedLine(r: PurchaseBarcodeStockResolution): boolean {
  return /soft-deleted|no product_variants row/.test(r.excludeReason ?? "");
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

/**
 * Live variants with the same product name (and size, when the line has one) as purchase
 * lines whose own SKU was deleted. Returned as extra resolutions marked viaTwin.
 */
export async function findLiveTwinsForDeletedLines(
  client: PurchaseBarcodeStockClient,
  organizationId: string,
  resolutions: PurchaseBarcodeStockResolution[],
): Promise<PurchaseBarcodeStockResolution[]> {
  const deleted = resolutions.filter((r) => isDeletedLine(r) && normName(r.purchaseProductName));
  if (!deleted.length) return [];
  const out: PurchaseBarcodeStockResolution[] = [];
  const seen = new Set<string>();
  const names = Array.from(new Set(deleted.map((r) => (r.purchaseProductName ?? "").trim())));
  for (const name of names.slice(0, 5)) {
    const { data } = await client
      .from("product_variants")
      .select("id, barcode, size, stock_qty, created_at, products!inner(product_name, deleted_at, product_type)")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .is("deleted_at", null)
      .is("products.deleted_at", null)
      .ilike("products.product_name", escapeIlike(name))
      .limit(50);
    for (const line of deleted.filter((r) => (r.purchaseProductName ?? "").trim() === name)) {
      for (const pv of data || []) {
        const product = Array.isArray(pv.products) ? pv.products[0] : pv.products;
        if (product?.product_type === "service") continue;
        if (normName(product?.product_name) !== normName(name)) continue;
        if (!sizesMatch(line.purchaseSize, pv.size)) continue;
        if (seen.has(pv.id)) continue;
        seen.add(pv.id);
        out.push({
          purchaseBarcode: line.purchaseBarcode,
          purchaseProductName: line.purchaseProductName,
          purchaseSize: line.purchaseSize,
          skuId: pv.id,
          liveBarcode: pv.barcode != null ? String(pv.barcode) : null,
          liveSize: pv.size != null ? String(pv.size) : null,
          productName: product?.product_name != null ? String(product.product_name) : null,
          stockQty: pv.stock_qty != null ? Number(pv.stock_qty) : null,
          excludeReason: null,
          viaTwin: true,
        });
      }
    }
  }
  return out;
}

/** True when the variant's current barcode is the one that was scanned. */
export function liveBarcodeMatchesScan(
  liveBarcode: string | null | undefined,
  scanned: string,
): boolean {
  const live = (liveBarcode || "").trim().toLowerCase();
  const scan = scanned.trim().toLowerCase();
  return Boolean(live) && Boolean(scan) && live === scan;
}

function normName(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The purchase line and the linked item carry the same product name. */
export function isSameItemAsPurchaseLine(
  r: Pick<PurchaseBarcodeStockResolution, "productName" | "purchaseProductName">,
): boolean {
  const a = normName(r.purchaseProductName);
  return Boolean(a) && a === normName(r.productName);
}

function normSize(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, "").trim().toLowerCase();
}

/** Sizes agree; a line without a size (or a free-size item) matches on name alone. */
export function sizesMatch(lineSize: string | null | undefined, liveSize: string | null | undefined): boolean {
  const a = normSize(lineSize);
  if (!a || a === "none" || a === "freesize" || a === "free") return true;
  return a === normSize(liveSize);
}

/**
 * SKUs a scanned barcode may open. A SKU whose live barcode is the scanned one always counts.
 * A label printed from a purchase bill (item later holds another barcode) counts when the bill
 * line names the same product and the same size. Several such SKUs are duplicates of one item
 * (e.g. KS Footwear masters entered twice): the one with the most stock is used. A different
 * product or size is never guessed.
 */
export function skuIdsServingScan(
  resolutions: PurchaseBarcodeStockResolution[],
  scanned: string,
): string[] {
  const usable = resolutions.filter((r) => !r.excludeReason && r.skuId);
  const exact = usable.filter((r) => liveBarcodeMatchesScan(r.liveBarcode, scanned));
  if (exact.length > 0) return Array.from(new Set(exact.map((r) => r.skuId)));
  const sameItem = usable.filter(
    (r) => (r.liveBarcode || "").trim() && isSameItemAsPurchaseLine(r) && sizesMatch(r.purchaseSize, r.liveSize),
  );
  if (!sameItem.length) return [];
  const best = [...sameItem].sort((a, b) => (Number(b.stockQty) || 0) - (Number(a.stockQty) || 0))[0];
  return [best.skuId];
}

export type DivergentPurchaseBarcode = {
  scanned: string;
  liveBarcode: string;
  productName: string | null;
};

/**
 * Purchase line still has the scanned barcode, but the linked SKU now carries
 * a different barcode (another product after a merge / re-barcode). That SKU
 * must not be sold or shown as if it were the scanned barcode.
 */
export function firstDivergentPurchaseBarcode(
  resolutions: PurchaseBarcodeStockResolution[],
  scanned: string,
): DivergentPurchaseBarcode | null {
  const serving = new Set(skuIdsServingScan(resolutions, scanned));
  for (const row of resolutions) {
    if (row.excludeReason || !row.skuId || serving.has(row.skuId)) continue;
    const live = (row.liveBarcode || "").trim();
    if (!live || liveBarcodeMatchesScan(live, scanned)) continue;
    return {
      scanned: scanned.trim(),
      liveBarcode: live,
      productName: row.productName,
    };
  }
  return null;
}

export function divergentPurchaseBarcodeMessage(info: DivergentPurchaseBarcode): {
  title: string;
  description: string;
} {
  const name = info.productName?.trim();
  const who = name ? `${name} is not stocked under ${info.scanned}` : `No product is stocked under barcode ${info.scanned}`;
  return {
    title: `Barcode ${info.scanned} is not available`,
    description: `${who}. The linked item uses barcode ${info.liveBarcode}. Scan ${info.liveBarcode} for that item.`,
  };
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

export type StockReportPurchaseMissHint = {
  title: string;
  description: string;
};

/**
 * Shop-facing copy when a barcode is on a purchase bill but Stock Report
 * still has no row. Returns null when a toast would not help (eligible SKU,
 * same live barcode as the search — the empty table is enough).
 */
export function stockReportPurchaseMissHint(
  resolutions: PurchaseBarcodeStockResolution[],
): StockReportPurchaseMissHint | null {
  const blocked = resolutions.find((r) => r.excludeReason);
  if (!blocked?.excludeReason) return null;

  const barcode = blocked.purchaseBarcode.trim();
  const name = blocked.productName?.trim();
  const named = name ? ` (${name})` : "";
  const label = barcode ? `Barcode ${barcode}${named}` : `This item${named}`;
  const reason = blocked.excludeReason;

  if (reason.includes("inactive")) {
    return {
      title: "Product is inactive",
      description: `${label} is on a purchase bill, but the product is inactive so Stock Report hides it.`,
    };
  }
  if (reason.includes("Variant is soft-deleted")) {
    return {
      title: "Product was deleted",
      description: `${label} is on a purchase bill, but this SKU is in Recycle Bin.`,
    };
  }
  if (reason.includes("Product master is soft-deleted")) {
    return {
      title: "Product was deleted",
      description: `${label} is on a purchase bill, but the product master is in Recycle Bin.`,
    };
  }
  if (reason.includes("service")) {
    return {
      title: "Service item",
      description: `${label} is a service, so it is not listed in Stock Report.`,
    };
  }
  if (reason.includes("no product_variants")) {
    return {
      title: "Product missing from master",
      description: `${label} is on a purchase bill, but the linked product is gone from master.`,
    };
  }

  return {
    title: "Not shown in Stock Report",
    description: `${label} is on a purchase bill, but Stock Report cannot show it.`,
  };
}

/**
 * Stock Report miss with no purchase-bill trail: the barcode may sit on a variant of a product
 * that was deleted (or on an inactive variant). Returns a hint for that case, else null.
 */
export async function findHiddenVariantHintByBarcode(
  client: PurchaseBarcodeStockClient,
  organizationId: string,
  barcode: string,
): Promise<StockReportPurchaseMissHint | null> {
  const trimmed = barcode.trim();
  if (!organizationId || !trimmed) return null;
  const { data, error } = await client
    .from("product_variants")
    .select("barcode, active, deleted_at, products!inner(product_name, deleted_at)")
    .eq("organization_id", organizationId)
    .eq("barcode", trimmed)
    .limit(5);
  if (error || !data?.length) return null;
  for (const row of data) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const name = product?.product_name ? ` (${String(product.product_name).trim()})` : "";
    if (product?.deleted_at || row.deleted_at) {
      return {
        title: "Product was deleted",
        description: `Barcode ${trimmed}${name} belongs to a deleted product. Restore it from Recycle Bin to see it in Stock Report.`,
      };
    }
    if (row.active === false) {
      return {
        title: "Product is inactive",
        description: `Barcode ${trimmed}${name} is inactive, so Stock Report hides it.`,
      };
    }
  }
  return null;
}
