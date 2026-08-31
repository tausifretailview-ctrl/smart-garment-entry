import { matchesProductSearchFields, scoreProductSearchMatch } from "@/utils/productSearch";
import { shouldPosEnterUseExactBarcodeLookup } from "@/utils/posBarcodeCartLookup";

/**
 * Sale Return product-dropdown matching.
 *
 * This is wiring, not a second search implementation: matching and ranking are delegated
 * to the same `matchesProductSearchFields` / `scoreProductSearchMatch` helpers that
 * `searchSaleOrderVariants` (POS Sales, Delivery Challan, command palette) uses
 * internally, so name / brand / category / style / barcode resolve identically.
 *
 * The candidate set stays Sale Return's own sold-products list. Sale Return may only
 * return what was actually sold, and every downstream rule (sold-qty caps, pricing
 * validation, credit notes) keys off that list, so it is deliberately not widened here.
 */

export type SaleReturnSearchProduct = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  style: string | null;
};

export type SaleReturnSearchVariant = {
  product_id: string;
  size: string | null;
  barcode: string | null;
};

function productParts(product: SaleReturnSearchProduct) {
  return {
    product_name: product.product_name,
    brand: product.brand ?? "",
    category: product.category ?? "",
    style: product.style ?? "",
  };
}

export function groupSaleReturnVariantsByProduct<T extends SaleReturnSearchVariant>(
  variants: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const v of variants) {
    const list = map.get(v.product_id);
    if (list) list.push(v);
    else map.set(v.product_id, [v]);
  }
  return map;
}

/** Empty term returns the full sold-products list unchanged (existing dropdown behaviour). */
export function filterSaleReturnProducts<P extends SaleReturnSearchProduct>(
  products: P[],
  variantsByProduct: Map<string, SaleReturnSearchVariant[]>,
  rawTerm: string,
): P[] {
  const term = rawTerm.trim();
  if (!term) return products;

  const matched = products.filter((product) => {
    const parts = productParts(product);
    if (matchesProductSearchFields(parts, term)) return true;
    // barcode / size live on the sold variants, not on the product row
    return (variantsByProduct.get(product.id) ?? []).some((v) =>
      matchesProductSearchFields(
        { ...parts, barcode: v.barcode ?? "", size: v.size ?? "" },
        term,
      ),
    );
  });

  return [...matched].sort(
    (a, b) =>
      scoreProductSearchMatch(productParts(b), term) -
      scoreProductSearchMatch(productParts(a), term),
  );
}

/**
 * Flatten filtered sold products into pickable variant rows (name + size), matching
 * the Sale Return magnifying-glass list. Cap keeps the dropdown keyboard-navigable.
 */
export function flattenSaleReturnSearchRows<
  P extends SaleReturnSearchProduct,
  V extends SaleReturnSearchVariant,
>(
  products: P[],
  variantsByProduct: Map<string, V[]>,
  rawTerm: string,
  limit = 50,
): Array<{ product: P; variant: V }> {
  const filtered = filterSaleReturnProducts(products, variantsByProduct, rawTerm);
  const rows: Array<{ product: P; variant: V }> = [];
  for (const product of filtered) {
    for (const variant of variantsByProduct.get(product.id) ?? []) {
      rows.push({ product, variant });
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

/** Name / brand / category typing — not a scanner SKU. Opens the POS-style picker. */
export function shouldSaleReturnShowNameDropdown(term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return !shouldPosEnterUseExactBarcodeLookup(t);
}

export type SaleReturnBarcodeEnterAction =
  | { kind: "noop" }
  | { kind: "exact-barcode"; term: string }
  | { kind: "pick-row"; index: number }
  | { kind: "not-found"; term: string };

/**
 * Enter / Add on the Sale Return scan box: barcodes add immediately; name terms
 * pick the highlighted sold-product row instead of the first ILIKE hit.
 */
export function resolveSaleReturnBarcodeEnterAction(
  rawTerm: string,
  nameSearchRowCount: number,
  highlightedIndex: number,
): SaleReturnBarcodeEnterAction {
  const term = rawTerm.trim();
  if (!term) return { kind: "noop" };
  if (shouldPosEnterUseExactBarcodeLookup(term)) {
    return { kind: "exact-barcode", term };
  }
  if (nameSearchRowCount > 0) {
    const index = Math.min(Math.max(highlightedIndex, 0), nameSearchRowCount - 1);
    return { kind: "pick-row", index };
  }
  return { kind: "not-found", term };
}
