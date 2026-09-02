import { posBarcodeMatchesNeedMrpPicker } from "@/utils/posScanPriceSelection";

export type BarcodePriceVariant = {
  mrp?: number | string | null;
  sale_price?: number | string | null;
  stock_qty?: number | string | null;
  id?: string;
};

export type BarcodeProductVariantMatch<P, V extends BarcodePriceVariant> = {
  product: P;
  variant: V;
};

export type BarcodeScanPickerResolution<T extends BarcodeProductVariantMatch<unknown, BarcodePriceVariant>> = {
  needMrpPicker: boolean;
  showMrpDialog: boolean;
  showProductPicker: boolean;
  mrpDialogChoices: T[];
  productPickerChoices: T[];
  autoPick: T | null;
};

/**
 * Decide how to resolve duplicate barcode scan matches.
 * MRP-tier duplicates (Jockey / shared EAN) → dedicated MRP dialog.
 * Other duplicates → existing product search picker.
 */
export function resolveBarcodeScanPicker<T extends BarcodeProductVariantMatch<unknown, BarcodePriceVariant>>(
  matches: T[],
  isInStock: (match: T) => boolean,
): BarcodeScanPickerResolution<T> {
  if (matches.length <= 1) {
    return {
      needMrpPicker: false,
      showMrpDialog: false,
      showProductPicker: false,
      mrpDialogChoices: [],
      productPickerChoices: [],
      autoPick: matches[0] ?? null,
    };
  }

  const needMrpPicker = posBarcodeMatchesNeedMrpPicker(matches);
  const inStock = matches.filter(isInStock);

  if (needMrpPicker) {
    // Sell-side: hide zero-stock price tiers when any in-stock tier exists
    // (purchase callers pass isInStock = always true, so they still see every SKU).
    const mrpDialogChoices = inStock.length > 0 ? inStock : matches;
    if (mrpDialogChoices.length <= 1) {
      return {
        needMrpPicker: true,
        showMrpDialog: false,
        showProductPicker: false,
        mrpDialogChoices: [],
        productPickerChoices: [],
        autoPick: mrpDialogChoices[0] ?? null,
      };
    }
    return {
      needMrpPicker: true,
      showMrpDialog: true,
      showProductPicker: false,
      mrpDialogChoices,
      productPickerChoices: [],
      autoPick: null,
    };
  }

  const productPickerChoices = inStock.length > 0 ? inStock : matches;
  const showProductPicker = productPickerChoices.length > 1;

  if (showProductPicker) {
    return {
      needMrpPicker: false,
      showMrpDialog: false,
      showProductPicker: true,
      mrpDialogChoices: [],
      productPickerChoices,
      autoPick: null,
    };
  }

  return {
    needMrpPicker: false,
    showMrpDialog: false,
    showProductPicker: false,
    mrpDialogChoices: [],
    productPickerChoices: [],
    autoPick: productPickerChoices[0] ?? matches[0] ?? null,
  };
}
