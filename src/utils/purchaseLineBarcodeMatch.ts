/**
 * Purchase-line barcode → live SKU matching.
 *
 * A bill line that already carries barcode X must stock the live
 * product_variants row that holds X. Price-tier forking may still create
 * manufacturer-EAN siblings (same barcode). It must never mint a new
 * product / generated barcode while X already exists in the org.
 */

export type PurchaseLineBarcodeHit = {
  id: string;
  product_id: string;
  barcode?: string | null;
  barcode_source?: string | null;
  size?: string | null;
  mrp?: number | null;
  sale_price?: number | null;
  created_at?: string | null;
};

function trimBarcode(value?: string | null): string {
  return (value || "").trim();
}

function createdAtMs(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/**
 * Choose which live row should receive stock for a line whose barcode
 * already exists. Tier match wins; otherwise the oldest live row (the
 * pre-existing item, not a just-inserted duplicate).
 */
export function pickLiveVariantForExistingLineBarcode(
  hits: PurchaseLineBarcodeHit[],
  opts?: {
    lineSize?: string | null;
    tierMatchIds?: ReadonlySet<string>;
  },
): PurchaseLineBarcodeHit | null {
  const live = hits.filter((row) => trimBarcode(row.barcode).length > 0);
  if (live.length === 0) return null;

  const tierIds = opts?.tierMatchIds;
  if (tierIds && tierIds.size > 0) {
    const tierHits = live.filter((row) => tierIds.has(row.id));
    if (tierHits.length === 1) return tierHits[0];
    if (tierHits.length > 1) {
      return pickOldestPreferringSize(tierHits, opts?.lineSize);
    }
  }

  return pickOldestPreferringSize(live, opts?.lineSize);
}

function pickOldestPreferringSize(
  hits: PurchaseLineBarcodeHit[],
  lineSize?: string | null,
): PurchaseLineBarcodeHit {
  const wantSize = (lineSize || "").trim().toLowerCase();
  const ranked = [...hits].sort((a, b) => {
    if (wantSize) {
      const aSize = (a.size || "").trim().toLowerCase() === wantSize ? 0 : 1;
      const bSize = (b.size || "").trim().toLowerCase() === wantSize ? 0 : 1;
      if (aSize !== bSize) return aSize - bSize;
    }
    const byAge = createdAtMs(a.created_at) - createdAtMs(b.created_at);
    if (byAge !== 0) return byAge;
    return a.id.localeCompare(b.id);
  });
  return ranked[0];
}

/**
 * True when the incoming line barcode is non-empty and already lives on at
 * least one catalog row. Callers must still honour manufacturer-EAN reuse
 * (shouldReuseBarcodeOnPriceTierFork) — this only answers "does X exist?".
 */
export function lineBarcodeExistsOnLiveItem(
  lineBarcode?: string | null,
  hits?: PurchaseLineBarcodeHit[] | null,
): boolean {
  const barcode = trimBarcode(lineBarcode);
  if (!barcode) return false;
  return (hits ?? []).some((row) => trimBarcode(row.barcode) === barcode);
}

/**
 * Generated / org-series barcodes are unique per SKU. If the line already
 * carries such a live barcode, attach to that row — never fork a new
 * product and never overwrite the live barcode with a freshly generated one.
 *
 * Manufacturer EANs (reuseBarcodeOnFork = true) still go through the
 * existing same-barcode price-tier sibling path.
 */
export function shouldAttachPurchaseLineToExistingBarcode(args: {
  lineBarcode?: string | null;
  liveHits: PurchaseLineBarcodeHit[];
  reuseBarcodeOnFork: boolean;
}): boolean {
  if (args.reuseBarcodeOnFork) return false;
  return lineBarcodeExistsOnLiveItem(args.lineBarcode, args.liveHits);
}

/**
 * Client/server guard: a saved line barcode must equal the barcode of the
 * variant that will receive stock. Empty line barcodes are not guarded
 * (new / IMEI-pending rows).
 */
export function purchaseLineBarcodeDivergesFromSku(args: {
  lineBarcode?: string | null;
  skuBarcode?: string | null;
}): boolean {
  const line = trimBarcode(args.lineBarcode);
  if (!line) return false;
  return line !== trimBarcode(args.skuBarcode);
}

export type PurchaseLineForBarcodeAlign = {
  sku_id?: string | null;
  barcode?: string | null;
  product_name?: string | null;
};

export type PurchaseLineBarcodeCorrection = {
  productName: string;
  from: string;
  to: string;
};

export type PurchaseLineBarcodeAlignPlan<T> = {
  lines: T[];
  /** Empty SKUs that must receive the line barcode before the bill is inserted. */
  writes: Array<{ skuId: string; barcode: string }>;
  /** Lines whose barcode was replaced with the barcode already on stock. */
  corrections: PurchaseLineBarcodeCorrection[];
  conflict: string | null;
};

/**
 * One stocked item, one barcode.
 * - SKU already has a barcode → the line uses that barcode.
 * - SKU barcode is empty and the line has one → write the line barcode onto the SKU.
 * - Two lines for the same empty SKU with different barcodes → do not save.
 */
export function planPurchaseBillBarcodeAlign<T extends PurchaseLineForBarcodeAlign>(
  lines: T[],
  skuBarcodeById: ReadonlyMap<string, string>,
): PurchaseLineBarcodeAlignPlan<T> {
  const writes = new Map<string, string>();
  const corrections: PurchaseLineBarcodeCorrection[] = [];
  const next = lines.map((line) => ({ ...line }));

  for (let index = 0; index < next.length; index++) {
    const line = next[index];
    const skuId = trimBarcode(line.sku_id);
    if (!skuId || !skuBarcodeById.has(skuId)) continue;

    const skuBarcode = skuBarcodeById.get(skuId) || "";
    const lineBarcode = trimBarcode(line.barcode);
    const productName = trimBarcode(line.product_name) || "This item";

    if (skuBarcode) {
      if (lineBarcode === skuBarcode) continue;
      next[index] = { ...line, barcode: skuBarcode };
      corrections.push({ productName, from: lineBarcode, to: skuBarcode });
      continue;
    }

    if (!lineBarcode) continue;
    const pending = writes.get(skuId);
    if (pending && pending !== lineBarcode) {
      return {
        lines,
        writes: [],
        corrections: [],
        conflict: `${productName} has two barcodes on this bill (${pending} and ${lineBarcode}). Each stock item keeps one barcode. Split the lines onto separate items, then save.`,
      };
    }
    writes.set(skuId, lineBarcode);
  }

  return {
    lines: next,
    writes: [...writes.entries()].map(([skuId, barcode]) => ({ skuId, barcode })),
    corrections,
    conflict: null,
  };
}
