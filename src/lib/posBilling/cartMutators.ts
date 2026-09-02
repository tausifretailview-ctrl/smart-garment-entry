import type { GarmentGstRuleSettings } from "@/utils/gstRules";
import { clampQty, minQtyForUom } from "@/utils/qtyInput";
import { maxCombinedDiscountForGross } from "@/utils/saleSettlement";
import {
  applyPosGarmentGstToItem,
  calculatePosCartLineNet,
  findPosGoodsMergeIndex,
  findPosServiceMergeIndex,
  sumLineDiscount,
  sumMrpTotal,
} from "./lineMath";
import { isNonStockTrackedProduct } from "@/utils/productStockDisplay";
import { resolveVariantColor } from "@/utils/resolveVariantColor";
import type { PosBillingError, PosCartItem, PosGrossBasis } from "./types";

export type CartMutatorResult = {
  items: PosCartItem[];
  error?: PosBillingError;
  /** True when an existing barcode/service line qty was incremented. */
  merged?: boolean;
  mergedItemId?: string;
  addedItemId?: string;
};

function discountCapError(mrpTotal: number): PosBillingError {
  const maxCombined = maxCombinedDiscountForGross(mrpTotal);
  return {
    code: "DISCOUNT_CAP",
    mrpTotal,
    maxCombined,
    message: `Only ₹${maxCombined.toLocaleString("en-IN", { maximumFractionDigits: 0 })} discount can be applied to this bill`,
  };
}

/**
 * Minimum unitCost on `index` so bill line+flat discount stays within cap,
 * assuming Disc% / Disc Rs on that line are cleared (unit-authority path).
 */
export function minUnitPriceForDiscountCap(
  rows: PosCartItem[],
  index: number,
  flatDiscountAmount: number,
): number {
  const item = rows[index];
  if (!item) return 0;
  const mrp = Number(item.mrp) || 0;
  const qty = Math.max(0.0001, Number(item.quantity) || 0);
  const withClearedDisc = rows.map((r, i) =>
    i === index
      ? { ...r, discountPercent: 0, discountAmount: 0, unitCost: mrp, rateAuthority: "unit" as const }
      : r,
  );
  const mrpTotal = sumMrpTotal(withClearedDisc);
  const maxLine = Math.max(0, Math.round((mrpTotal - flatDiscountAmount) * 100) / 100);
  const otherDisc = sumLineDiscount(withClearedDisc);
  const room = Math.max(0, maxLine - otherDisc);
  return Math.max(0, Math.round((mrp - room / qty) * 100) / 100);
}

export function removeLine(items: PosCartItem[], index: number): CartMutatorResult {
  return { items: items.filter((_, i) => i !== index) };
}

export function clearCart(): CartMutatorResult {
  return { items: [] };
}

export function updateQty(
  items: PosCartItem[],
  index: number,
  newQty: number,
): CartMutatorResult {
  const item = items[index];
  if (!item) {
    return { items, error: { code: "INVALID_QTY", message: "Line not found" } };
  }
  const clampedQty = clampQty(newQty, item.uom);
  if (clampedQty < minQtyForUom(item.uom)) {
    return { items, error: { code: "INVALID_QTY", message: "Quantity below minimum" } };
  }
  const updatedItems = [...items];
  updatedItems[index] = {
    ...updatedItems[index],
    quantity: clampedQty,
    netAmount: calculatePosCartLineNet({ ...updatedItems[index], quantity: clampedQty }),
  };
  return { items: updatedItems };
}

export function updateDiscountPercent(
  items: PosCartItem[],
  index: number,
  discountPercent: number,
  flatDiscountAmount: number,
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): CartMutatorResult {
  if (discountPercent < 0 || discountPercent > 100) {
    return { items, error: { code: "INVALID_DISCOUNT", message: "Discount % out of range" } };
  }
  const updatedItems = [...items];
  const prevItem = updatedItems[index];
  if (!prevItem) {
    return { items, error: { code: "INVALID_DISCOUNT", message: "Line not found" } };
  }
  const switchingFromUnit = prevItem.rateAuthority === "unit";
  updatedItems[index] = {
    ...prevItem,
    rateAuthority: "discount",
    unitCost: switchingFromUnit ? Number(prevItem.mrp) || 0 : prevItem.unitCost,
    discountPercent,
    discountAmount: 0,
  };
  updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);

  let error: PosBillingError | undefined;
  const mrpTotal = sumMrpTotal(updatedItems);
  const maxLine = Math.max(0, Math.round((mrpTotal - flatDiscountAmount) * 100) / 100);
  const lineDisc = sumLineDiscount(updatedItems);
  if (lineDisc > maxLine + 0.01) {
    const item = updatedItems[index];
    const baseAmount = Math.max(0, (Number(item.mrp) || 0) * (Number(item.quantity) || 0));
    const otherLine = lineDisc - (baseAmount * discountPercent) / 100;
    const room = Math.max(0, maxLine - otherLine);
    updatedItems[index] = {
      ...item,
      rateAuthority: "discount",
      unitCost: switchingFromUnit ? Number(item.mrp) || 0 : item.unitCost,
      discountPercent: baseAmount > 0 ? Number(((room / baseAmount) * 100).toFixed(4)) : 0,
      discountAmount: 0,
    };
    updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);
    error = discountCapError(mrpTotal);
  }
  return { items: updatedItems, error };
}

/** Disc ₹ is mapped to Disc % (clears Disc ₹), except scheme lines keep extra rupees. */
export function updateDiscountAmount(
  items: PosCartItem[],
  index: number,
  discountAmount: number,
  flatDiscountAmount: number,
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): CartMutatorResult {
  if (discountAmount < 0) {
    return { items, error: { code: "INVALID_DISCOUNT", message: "Discount amount negative" } };
  }
  const updatedItems = [...items];
  const item = updatedItems[index];
  if (!item) {
    return { items, error: { code: "INVALID_DISCOUNT", message: "Line not found" } };
  }
  const switchingFromUnit = item.rateAuthority === "unit";
  const schemeLine = item.categoryTierApplied === true;
  const baseAmount = Math.max(0, (Number(item.mrp) || 0) * (Number(item.quantity) || 0));
  // Scheme lines: Disc ₹ is extra rupees off the scheme total (not mapped through MRP%).
  if (schemeLine) {
    updatedItems[index] = {
      ...item,
      rateAuthority: "discount",
      discountPercent: 0,
      discountAmount: Number(discountAmount.toFixed(2)),
    };
  } else {
    const mappedPercent = baseAmount > 0 ? Math.min(100, (discountAmount / baseAmount) * 100) : 0;
    updatedItems[index] = {
      ...item,
      rateAuthority: "discount",
      unitCost: switchingFromUnit ? Number(item.mrp) || 0 : item.unitCost,
      discountPercent: Number(mappedPercent.toFixed(4)),
      discountAmount: 0,
    };
  }
  updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);

  let error: PosBillingError | undefined;
  const mrpTotal = sumMrpTotal(updatedItems);
  const maxLine = Math.max(0, Math.round((mrpTotal - flatDiscountAmount) * 100) / 100);
  const lineDisc = sumLineDiscount(updatedItems);
  if (lineDisc > maxLine + 0.01) {
    const cappedItem = updatedItems[index];
    if (schemeLine) {
      const extra = Number(cappedItem.discountAmount) || 0;
      const otherLine = lineDisc - extra;
      const room = Math.max(0, maxLine - otherLine);
      updatedItems[index] = {
        ...cappedItem,
        rateAuthority: "discount",
        discountPercent: 0,
        discountAmount: Math.min(extra, Number(room.toFixed(2))),
      };
    } else {
      const base = Math.max(0, (Number(cappedItem.mrp) || 0) * (Number(cappedItem.quantity) || 0));
      const otherLine = lineDisc - (base * (Number(cappedItem.discountPercent) || 0)) / 100;
      const room = Math.max(0, maxLine - otherLine);
      updatedItems[index] = {
        ...cappedItem,
        rateAuthority: "discount",
        unitCost: switchingFromUnit ? Number(cappedItem.mrp) || 0 : cappedItem.unitCost,
        discountPercent: base > 0 ? Number(((room / base) * 100).toFixed(4)) : 0,
        discountAmount: 0,
      };
    }
    updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);
    error = discountCapError(mrpTotal);
  }
  return { items: updatedItems, error };
}

export function updatePrice(
  items: PosCartItem[],
  index: number,
  rawValue: number,
  flatDiscountAmount: number,
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): CartMutatorResult {
  if (rawValue < 0 || !Number.isFinite(rawValue)) {
    return { items, error: { code: "INVALID_UNIT_PRICE", message: "Invalid unit price" } };
  }
  if (index < 0 || index >= items.length) {
    return { items, error: { code: "INVALID_UNIT_PRICE", message: "Line not found" } };
  }
  const mrp = Number(items[index].mrp) || 0;
  const typed = Math.max(0, rawValue);
  // Typed rate above MRP is honoured: MRP rises with it so gross / cap / savings stay consistent.
  const raisesMrp = mrp > 0 ? typed > mrp + 0.005 : true;
  const unitCost = raisesMrp ? typed : Math.min(mrp, typed);
  const minUnit = minUnitPriceForDiscountCap(items, index, flatDiscountAmount);
  if (!raisesMrp && unitCost + 0.005 < minUnit) {
    return {
      items,
      error: {
        code: "UNIT_PRICE_BELOW_MIN",
        minUnit,
        message: `Minimum ₹${minUnit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} on this line.`,
      },
    };
  }
  const updatedItems = [...items];
  const nextMrp = raisesMrp ? unitCost : mrp;
  const nextUnit = unitCost;
  updatedItems[index] = {
    ...updatedItems[index],
    rateAuthority: "unit",
    mrp: nextMrp,
    unitCost: nextUnit,
    discountPercent: 0,
    discountAmount: 0,
    categoryTierApplied: undefined,
    categoryTierListPrice: undefined,
  };
  updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);
  return { items: updatedItems };
}

export function updateMrp(
  items: PosCartItem[],
  index: number,
  newMrp: number,
  flatDiscountAmount: number,
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): CartMutatorResult {
  if (newMrp < 0) {
    return { items, error: { code: "INVALID_UNIT_PRICE", message: "Invalid MRP" } };
  }
  const updatedItems = [...items];
  const item = updatedItems[index];
  if (!item) {
    return { items, error: { code: "INVALID_UNIT_PRICE", message: "Line not found" } };
  }
  updatedItems[index] = {
    ...item,
    mrp: newMrp,
    unitCost:
      item.rateAuthority === "unit" ? Math.min(Number(item.unitCost) || 0, newMrp) : newMrp,
  };
  updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);

  let error: PosBillingError | undefined;
  if (item.rateAuthority === "unit") {
    const minUnit = minUnitPriceForDiscountCap(updatedItems, index, flatDiscountAmount);
    if ((Number(updatedItems[index].unitCost) || 0) + 0.005 < minUnit) {
      updatedItems[index] = {
        ...updatedItems[index],
        unitCost: minUnit,
      };
      updatedItems[index] = applyPosGarmentGstToItem(updatedItems[index], garmentGstSettings);
      error = {
        code: "UNIT_PRICE_BELOW_MIN",
        minUnit,
        message: `Unit price raised to ₹${minUnit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} to stay within bill discount cap`,
      };
    }
  }
  return { items: updatedItems, error };
}

export function updateGstPer(items: PosCartItem[], index: number, newGstPer: number): CartMutatorResult {
  const updatedItems = [...items];
  if (!updatedItems[index]) {
    return { items, error: { code: "INVALID_DISCOUNT", message: "Line not found" } };
  }
  updatedItems[index] = { ...updatedItems[index], gstPer: newGstPer };
  return { items: updatedItems };
}

export type ResolveAddLinePricesInput = {
  grossBasis: PosGrossBasis;
  masterSalePrice: number;
  masterMrp: number;
  overridePrice?: { sale_price: number; mrp: number };
  brandDiscountPercent?: number;
  productSaleDiscountPercent?: number;
  /**
   * @deprecated Ignored. Master Disc % is bill-level flat only when the customer
   * has no brand-discount rows (handled in Sales/POS), never zeros brand %.
   */
  customerHasMasterDiscount?: boolean;
};

/**
 * Price resolution at add — mirrors POSSales addItemToCart pricing block.
 * grossBasis 'mrp' ⇒ unitCost = displayMrp and discountPercent forced 0 (unless override).
 */
export function resolveAddLinePrices(input: ResolveAddLinePricesInput): {
  salePrice: number;
  mrpToUse: number;
  displayMrp: number;
  unitCost: number;
  discountPercent: number;
  useMrpAsPrice: boolean;
  showDiscount: boolean;
} {
  const salePrice = input.overridePrice?.sale_price ?? input.masterSalePrice;
  const mrpToUse = input.overridePrice?.mrp ?? input.masterMrp;
  const useMrpAsPrice = input.grossBasis === "mrp" && !input.overridePrice;
  const displayMrp =
    mrpToUse && mrpToUse > 0 ? (mrpToUse > salePrice ? mrpToUse : salePrice) : salePrice;
  // brandDiscountPercent is already resolved by caller (master never suppresses brand).
  const brandDiscount = Math.max(0, Number(input.brandDiscountPercent) || 0);
  const productSaleDiscount = Math.max(0, Number(input.productSaleDiscountPercent) || 0);
  const discountPercent = useMrpAsPrice
    ? 0
    : brandDiscount > 0
      ? brandDiscount
      : productSaleDiscount > 0
        ? productSaleDiscount
        : 0;
  return {
    salePrice,
    mrpToUse,
    displayMrp,
    unitCost: useMrpAsPrice ? displayMrp : salePrice,
    discountPercent,
    useMrpAsPrice,
    showDiscount: !useMrpAsPrice && displayMrp > salePrice,
  };
}

export type AddLineProduct = {
  id: string;
  product_name: string;
  category?: string | null;
  style?: string | null;
  brand?: string | null;
  color?: string | null;
  hsn_code?: string | null;
  product_type?: string | null;
  uom?: string | null;
  gst_per?: number | null;
  sale_gst_percent?: number | null;
  purchase_gst_percent?: number | null;
  sale_discount_type?: string | null;
  sale_discount_value?: number | null;
};

export type AddLineVariant = {
  id: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  sale_price?: number | string | null;
  mrp?: number | string | null;
  is_dc_product?: boolean | null;
  /** Scan-time stock snapshot; omitted for non-tracked / custom-size lines. */
  stock_qty?: number | null;
};

export type AddLineInput = {
  items: PosCartItem[];
  product: AddLineProduct;
  variant: AddLineVariant;
  grossBasis: PosGrossBasis;
  garmentGstSettings: GarmentGstRuleSettings | null | undefined;
  overridePrice?: { sale_price: number; mrp: number };
  brandDiscountPercent?: number;
  customerHasMasterDiscount?: boolean;
  /** Injected id factory for services (default: variant.id-timestamp-random). */
  makeLineId?: () => string;
};

export function addLine(input: AddLineInput): CartMutatorResult {
  const { product, variant } = input;
  const isServiceProduct = product.product_type === "service";
  const masterSalePrice = parseFloat(String(variant.sale_price || 0)) || 0;
  const rawMrp = variant.mrp ? parseFloat(String(variant.mrp)) : 0;
  const masterMrp = rawMrp > 0 ? rawMrp : masterSalePrice;
  const productSaleDiscount = (() => {
    const sdt = product.sale_discount_type;
    const sdv = product.sale_discount_value || 0;
    if (sdv > 0 && (!sdt || sdt === "percent")) return sdv;
    return 0;
  })();

  const priced = resolveAddLinePrices({
    grossBasis: input.grossBasis,
    masterSalePrice,
    masterMrp,
    overridePrice: input.overridePrice,
    brandDiscountPercent: input.brandDiscountPercent,
    productSaleDiscountPercent: productSaleDiscount,
  });

  const descriptionParts = [product.product_name];
  if (product.category) descriptionParts.push(product.category);
  if (product.style) descriptionParts.push(product.style);
  let description = descriptionParts.join("-");
  const extraParts: string[] = [];
  if (product.brand) extraParts.push(product.brand);
  const displayColor = resolveVariantColor(variant.color, product.color);
  if (displayColor) extraParts.push(displayColor);
  if (extraParts.length > 0) description += "-" + extraParts.join("-");

  const makeId =
    input.makeLineId ??
    (() => `${variant.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Stock-tracked goods only — service/combo and lines without variantId get no snapshot (no badge).
  // Snapshot is add-time only; not refreshed while the bill stays open (v1).
  const stockQtySnapshot =
    !isNonStockTrackedProduct(product.product_type) && variant.id
      ? Number(variant.stock_qty ?? 0) || 0
      : undefined;

  const newItem: PosCartItem = {
    id: isServiceProduct ? makeId() : variant.id,
    barcode: variant.barcode || "",
    productName: description,
    baseProductName: product.product_name || description.split("-")[0] || description,
    category: product.category?.trim() || null,
    size: variant.size || "",
    color: displayColor,
    quantity: 1,
    mrp: priced.displayMrp,
    originalMrp: priced.mrpToUse,
    purchaseGstPer: product.purchase_gst_percent ?? product.gst_per ?? 0,
    gstPer: product.sale_gst_percent ?? product.gst_per ?? 0,
    discountPercent: priced.discountPercent,
    discountAmount: 0,
    unitCost: priced.unitCost,
    netAmount: 0,
    productId: product.id,
    variantId: variant.id,
    hsnCode: product.hsn_code || "",
    productType: product.product_type || undefined,
    isDcProduct: variant.is_dc_product === true,
    uom: product.uom || "NOS",
    showDiscount: priced.showDiscount,
    stockQty: stockQtySnapshot,
  };
  const pricedItem = applyPosGarmentGstToItem(newItem, input.garmentGstSettings);

  const prev = input.items;
  if (!isServiceProduct) {
    const mergeIdx = findPosGoodsMergeIndex(prev, variant.id);
    if (mergeIdx >= 0) {
      const updated = [...prev];
      const line = updated[mergeIdx];
      const mergedQty = line.quantity + 1;
      updated[mergeIdx] = {
        ...line,
        quantity: mergedQty,
        netAmount: calculatePosCartLineNet({ ...line, quantity: mergedQty }),
      };
      return { items: updated, merged: true, mergedItemId: line.id };
    }
  } else if (input.overridePrice) {
    const mergeIdx = findPosServiceMergeIndex(prev, {
      barcode: variant.barcode || "",
      variantId: variant.id,
      mrp: input.overridePrice.mrp || input.overridePrice.sale_price,
      unitCost: input.overridePrice.sale_price || input.overridePrice.mrp || input.overridePrice.sale_price,
    });
    if (mergeIdx >= 0) {
      const updated = [...prev];
      const line = updated[mergeIdx];
      const mergedQty = line.quantity + 1;
      updated[mergeIdx] = {
        ...line,
        quantity: mergedQty,
        netAmount: calculatePosCartLineNet({ ...line, quantity: mergedQty }),
      };
      return { items: updated, merged: true, mergedItemId: line.id };
    }
  }

  return { items: [...prev, pricedItem], addedItemId: pricedItem.id };
}
