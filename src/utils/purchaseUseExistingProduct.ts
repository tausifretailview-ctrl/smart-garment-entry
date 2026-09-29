import { PURCHASE_PRICE_TIER_TOLERANCE } from "@/utils/purchaseVariantPriceTierFork";

/** Prices the user typed in ProductEntryDialog before choosing an existing SKU. */
export type UseExistingProductPayload = {
  barcode: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
};

/**
 * "Product already exists?" (same name + category) → "Use existing instead":
 * the size rows the user already typed in the Add Product grid, to be put on
 * the bill against the existing product's variants.
 */
export type UseExistingProductSizesPayload = {
  productId: string;
  rows: Array<{
    size: string;
    color: string;
    qty: number;
    pur_price: number;
    sale_price: number;
    mrp: number | null;
    /** Barcode / IMEI typed or scanned on this row (blank when none). */
    barcode?: string;
    barcode_source?: string;
  }>;
};

export type PurchaseLinePriceSnapshot = {
  pur_price: number;
  sale_price: number;
  mrp?: number;
};

export function purchaseLinePricesDiffer(
  typed: PurchaseLinePriceSnapshot,
  stored: PurchaseLinePriceSnapshot,
  tolerance = PURCHASE_PRICE_TIER_TOLERANCE,
): boolean {
  if (Math.abs(Number(typed.sale_price) - Number(stored.sale_price)) > tolerance) {
    return true;
  }
  if (Math.abs(Number(typed.pur_price) - Number(stored.pur_price)) > tolerance) {
    return true;
  }
  const typedMrp = Number(typed.mrp) || 0;
  const storedMrp = Number(stored.mrp) || 0;
  if (typedMrp > 0 && storedMrp > 0 && Math.abs(typedMrp - storedMrp) > tolerance) {
    return true;
  }
  return false;
}

/** Bill line prices: user-typed override wins; links to existing variant id elsewhere. */
export function purchaseLinePricesFromUseExisting(
  payload: UseExistingProductPayload,
  stored: PurchaseLinePriceSnapshot,
): PurchaseLinePriceSnapshot {
  return {
    pur_price:
      Number(payload.pur_price) > 0
        ? Number(payload.pur_price)
        : Number(stored.pur_price) || 0,
    sale_price:
      Number(payload.sale_price) > 0
        ? Number(payload.sale_price)
        : Number(stored.sale_price) || 0,
    mrp:
      payload.mrp != null && Number(payload.mrp) > 0
        ? Number(payload.mrp)
        : Number(stored.mrp) || 0,
  };
}

export function formatInrPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Brief copy for the duplicate-barcode "Use existing product" confirmation. */
export function buildUseExistingProductConfirmMessage(
  stored: PurchaseLinePriceSnapshot,
  typed: PurchaseLinePriceSnapshot,
): string {
  const storedSale = formatInrPrice(Number(stored.sale_price) || 0);
  const typedSale = formatInrPrice(Number(typed.sale_price) || 0);
  return (
    `This will link to the existing product. Its current sale price is ${storedSale} — ` +
    `your entered ${typedSale} will be recorded on this purchase line but won't change ` +
    `the product's stored price unless you also update it.`
  );
}

const sizeGridMatchKey = (value: unknown): string => String(value ?? "").trim().toLowerCase();

/**
 * Pick the existing variant for a typed size row: same size, same colour (a
 * blank colour on either side matches), preferring the same MRP tier.
 * Returns null when the existing product has no such size/colour yet.
 */
export function matchExistingVariantForSizeRow<
  V extends { size?: string | null; color?: string | null; mrp?: number | null },
>(
  variants: V[],
  row: { size: string; color: string; mrp: number | null },
  productColor?: string | null,
): V | null {
  const size = sizeGridMatchKey(row.size);
  const color = sizeGridMatchKey(row.color);
  const candidates = variants.filter((v) => {
    if (sizeGridMatchKey(v.size) !== size) return false;
    const vColor = sizeGridMatchKey(v.color || productColor);
    return !color || !vColor || vColor === color;
  });
  if (candidates.length === 0) return null;
  const rowMrp = Number(row.mrp) || 0;
  if (rowMrp > 0) {
    const sameMrp = candidates.find(
      (v) => Math.abs((Number(v.mrp) || 0) - rowMrp) <= PURCHASE_PRICE_TIER_TOLERANCE,
    );
    if (sameMrp) return sameMrp;
  }
  // Exact colour match beats a blank-colour match.
  return candidates.find((v) => sizeGridMatchKey(v.color || productColor) === color) ?? candidates[0];
}

/**
 * Barcode the user scanned or typed on an Add Product row (e.g. a 14-digit Jockey
 * EAN), or "" when the row only carries an app-generated series code. The
 * use-existing path must keep this code on the bill line instead of generating one.
 */
export function typedExternalBarcode(row: {
  barcode?: string | null;
  barcode_source?: string | null;
}): string {
  if ((row.barcode_source || "").trim().toLowerCase() === "generated") return "";
  return String(row.barcode ?? "").trim();
}
