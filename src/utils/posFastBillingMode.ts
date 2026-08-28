import { parsePosQuickPriceCode } from "@/utils/posQuickPriceCode";
import { isPosAlphanumericBarcodeTerm } from "@/utils/posBarcodeCartLookup";

/** Settings → Sale → POS quick price-code search (Trendzo fast billing). */
export function isPosFastBillingEnabled(
  saleSettings?: { pos_quick_price_code?: boolean | null } | null,
): boolean {
  return saleSettings?.pos_quick_price_code === true;
}

export function isPosFastBillingQuickCodeTerm(term: string): boolean {
  return parsePosQuickPriceCode(term.trim()) != null;
}

/**
 * "TBJEANS" → "tb jeans" for brand+name typing without a space (Trendzo fast billing).
 * Skips quick price codes (J900) and terms that already contain spaces.
 */
export function expandFastBillingCompoundSearchTerm(term: string): string {
  const raw = term.trim();
  if (!raw || /\s/.test(raw) || parsePosQuickPriceCode(raw)) return raw;

  const cleaned = raw.toLowerCase().replace(/[%_(),."']/g, "");
  if (cleaned.length < 4 || !/^[a-z]+$/i.test(cleaned)) return raw;

  // Prefer 2–4 letter brand prefix + name suffix (TB + JEANS). Suffix must be ≥4 chars
  // so "Jeans" alone is not split into "je ans".
  for (let prefixLen = 2; prefixLen <= Math.min(4, cleaned.length - 4); prefixLen++) {
    const prefix = cleaned.slice(0, prefixLen);
    const suffix = cleaned.slice(prefixLen);
    if (suffix.length >= 4) {
      return `${prefix} ${suffix}`;
    }
  }

  return raw;
}

/**
 * Brand + category line for fast-billing POS dropdown (e.g. "TB · Jeans").
 * Omits category when it is already part of the product name.
 */
export function posFastBillingMetaLabel(
  product: { product_name?: string | null; brand?: string | null; category?: string | null } | null | undefined,
): string {
  if (!product) return "";
  const parts: string[] = [];
  const brand = String(product.brand ?? "").trim();
  const category = String(product.category ?? "").trim();
  const nameLower = String(product.product_name ?? "").trim().toLowerCase();

  if (brand) parts.push(brand);
  if (category && !nameLower.includes(category.toLowerCase())) {
    parts.push(category);
  }
  return parts.join(" · ");
}

/**
 * Fast billing text search (e.g. "Jeans") — show dropdown with brand + category + price;
 * do not auto-add the first DB hit on Enter. J900 and barcodes use other paths.
 */
export function posFastBillingUsesDropdownPick(term: string, fastBillingEnabled: boolean): boolean {
  if (!fastBillingEnabled) return false;
  const trimmed = term.trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (isPosFastBillingQuickCodeTerm(trimmed)) return false;
  if (isPosAlphanumericBarcodeTerm(trimmed)) return false;
  return true;
}
