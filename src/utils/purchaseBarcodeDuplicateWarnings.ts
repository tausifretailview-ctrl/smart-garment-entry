import { classifyBarcodeSource, type OrgSeriesShape } from "@/utils/barcodeChecksum";

export type PurchaseBarcodeSeriesOrg = OrgSeriesShape;

export type BarcodeDuplicateMatch = {
  variant_id: string;
  product_name: string;
  size: string;
  color: string | null;
  stock_qty: number;
  barcode: string;
};

export type BarcodeCheckLineItem = {
  temp_id: string;
  barcode?: string;
  sku_id?: string;
  barcode_source?: string;
};

/**
 * Purchase bills may restock the same manufacturer EAN (Jockey etc.) across
 * bills and price tiers. Duplicate warnings apply only to THIS org's generated
 * series — those values must stay unique.
 */
export function shouldFlagPurchaseBarcodeDuplicate(
  barcode: string | null | undefined,
  org: PurchaseBarcodeSeriesOrg = {},
  barcodeSource?: string | null,
): boolean {
  const code = String(barcode ?? "").trim();
  if (code.length <= 6) return false;

  const classified = classifyBarcodeSource(code, org);
  if (classified.reason === "gtin-check-digit") return false;
  if (classified.reason === "non-numeric") return false;
  if (classified.reason === "org-series") return true;
  if (classified.reason === "imei-luhn") return true;
  if ((barcodeSource || "").trim().toLowerCase() === "generated") return true;
  return false;
}

/** In-memory conflict rules — in-bill dups and cross-master matches, org-series only. */
export function buildBarcodeDuplicateWarnings(
  lineItems: BarcodeCheckLineItem[],
  barcodeLookup: Map<string, BarcodeDuplicateMatch[]>,
  isEditMode: boolean,
  originalLineItems: BarcodeCheckLineItem[],
  org: PurchaseBarcodeSeriesOrg = {},
): Map<string, string> {
  const warnings = new Map<string, string>();
  const barcodesToCheck = lineItems.filter((item) => item.barcode && item.barcode.length > 6);

  const allBillSkuIds = new Set(lineItems.map((i) => i.sku_id).filter(Boolean));

  const billBarcodeMap = new Map<string, { temp_id: string; sku_id: string }>();
  const inBillDuplicates = new Set<string>();
  for (const item of lineItems) {
    if (!item.barcode) continue;
    if (!shouldFlagPurchaseBarcodeDuplicate(item.barcode, org, item.barcode_source)) {
      continue;
    }
    const existing = billBarcodeMap.get(item.barcode);
    if (existing) {
      if (existing.sku_id !== item.sku_id) {
        inBillDuplicates.add(item.temp_id);
        inBillDuplicates.add(existing.temp_id);
      }
    } else {
      billBarcodeMap.set(item.barcode, { temp_id: item.temp_id, sku_id: item.sku_id ?? "" });
    }
  }

  const originalSkuIds = new Set(
    (isEditMode ? originalLineItems : []).map((i) => i.sku_id).filter(Boolean),
  );

  for (const item of barcodesToCheck) {
    if (!shouldFlagPurchaseBarcodeDuplicate(item.barcode, org, item.barcode_source)) {
      continue;
    }

    if (inBillDuplicates.has(item.temp_id)) {
      warnings.set(
        item.temp_id,
        `⚠️ Duplicate barcode in this bill — same barcode assigned to multiple items`,
      );
      continue;
    }

    const matches = barcodeLookup.get(item.barcode!) ?? [];
    const afterExclude = matches.filter((d) => !item.sku_id || d.variant_id !== item.sku_id);
    const realConflicts = afterExclude.filter(
      (d) => !allBillSkuIds.has(d.variant_id) && !originalSkuIds.has(d.variant_id),
    );
    if (realConflicts.length > 0) {
      const existing = realConflicts[0];
      warnings.set(
        item.temp_id,
        `⚠️ Barcode already used: "${existing.product_name}" ${existing.size}${existing.color ? " / " + existing.color : ""} (Stock: ${existing.stock_qty})`,
      );
    }
  }

  return warnings;
}
