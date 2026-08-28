import { PURCHASE_PRICE_TIER_TOLERANCE } from "@/utils/purchaseVariantPriceTierFork";

/** Prices the user typed in ProductEntryDialog before choosing an existing SKU. */
export type UseExistingProductPayload = {
  barcode: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
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
