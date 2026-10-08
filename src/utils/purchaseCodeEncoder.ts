/**
 * Encodes a purchase price into an alphabetic code using a custom alphabet mapping.
 * Each digit (0-9) is mapped to a letter in the provided alphabet.
 *
 * Default format is letters only (Settings example: ₹100 → BAA).
 * Optional MMCODEYR wrap (e.g. 09SEWN26) when includeDate is true.
 */

export const DEFAULT_PURCHASE_CODE_ALPHABET = "ABCDEFGHIK";

export type EncodePurchasePriceOptions = {
  /** When true, wrap as MM + code + YY using billDate or today. Default true (org setting). */
  includeDate?: boolean;
};

/** Default on for all orgs unless explicitly disabled in purchase_settings. */
export function resolvePurchaseCodeIncludeDate(
  purchaseSettings?: { purchase_code_include_date?: boolean | null } | null,
): boolean {
  return purchaseSettings?.purchase_code_include_date !== false;
}

/**
 * Shop alphabets are 10 unique A–Z / 0–9 characters (digit 0 = first letter).
 * Handwritten lists sometimes repeat the first letter at the end (NEASYFITOWN).
 */
export const normalizePurchaseCodeAlphabet = (raw?: string | null): string => {
  const cleaned = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  if (cleaned.length === 11 && cleaned[0] === cleaned[10]) {
    return cleaned.slice(0, 10);
  }
  if (cleaned.length > 10) return cleaned.slice(0, 10);
  return cleaned;
};

export const resolvePurchaseCodeAlphabet = (raw?: string | null): string => {
  const normalized = normalizePurchaseCodeAlphabet(raw);
  if (/^[A-Z0-9]{10}$/.test(normalized)) return normalized;
  return DEFAULT_PURCHASE_CODE_ALPHABET;
};

/**
 * Calendar day written on the purchase invoice (YYYY-MM-DD).
 * Uses the date prefix so `2026-09-01T00:00:00.000Z` stays 1 September,
 * not the previous local day.
 */
export function normalizePurchaseBillDate(value?: string | null): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

/**
 * Month/year on a barcode purchase code follows the purchase invoice date.
 * After save, Purchase Entry resets the form to today. That reset must not
 * replace the invoice the user selected (September stays 09, not the current month).
 * A saved invoice date wins over the label payload when both are present.
 */
export function resolveLabelPurchaseBillDate(input: {
  savedInvoiceDate?: string | null;
  itemBillDate?: string | null;
}): string | undefined {
  return (
    normalizePurchaseBillDate(input.savedInvoiceDate) ??
    normalizePurchaseBillDate(input.itemBillDate)
  );
}

const parseBillDate = (billDate?: string): Date => {
  const normalized = normalizePurchaseBillDate(billDate);
  if (!normalized) return new Date();
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (!isoDay) return new Date();
  return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
};

/**
 * @param price - The purchase price to encode (integer part only)
 * @param alphabet - 10-character mapping for digits 0-9
 * @param billDate - Optional bill date (ISO) used only when includeDate is true
 * @param options.includeDate - Prefix month and suffix year (MMCODEYR)
 */
export const encodePurchasePrice = (
  price: number,
  alphabet?: string,
  billDate?: string,
  options?: EncodePurchasePriceOptions,
): string => {
  const codeAlphabet = resolvePurchaseCodeAlphabet(alphabet);

  const intPrice = Math.floor(Math.abs(price));
  const encodedCode = intPrice
    .toString()
    .split("")
    .map((digit) => codeAlphabet[parseInt(digit, 10)] ?? "")
    .join("");

  if (!options?.includeDate) {
    return encodedCode;
  }

  const date = parseBillDate(billDate);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${encodedCode}${year}`;
};

const clampExtraPercent = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, value);
};

/**
 * Calculates the effective purchase price for encoding on barcode labels.
 * Order: purchase rate → optional GST → optional extra % (e.g. 500 + 10% = 550).
 */
export const getEffectivePurchasePrice = (
  purPrice: number,
  gstPer: number = 0,
  includeGst: boolean = false,
  extraPercentEnabled: boolean = false,
  extraPercent: number = 0,
): number => {
  let amount = purPrice;
  if (includeGst && gstPer > 0) {
    amount = amount + (amount * gstPer / 100);
  }
  if (extraPercentEnabled) {
    const pct = clampExtraPercent(extraPercent);
    if (pct > 0) {
      amount = amount + (amount * pct / 100);
    }
  }
  if (amount !== purPrice) return Math.round(amount);
  return purPrice;
};

export type EncodeLabelPurchaseCodeOptions = EncodePurchasePriceOptions & {
  gstPer?: number;
  includeGst?: boolean;
  extraPercentEnabled?: boolean;
  extraPercent?: number;
  billDate?: string;
};

/** Encode a purchase-bill / label line using org alphabet and optional GST / extra %. */
export const encodePurchasePriceForLabel = (
  purPrice: number | null | undefined,
  alphabet?: string,
  options?: EncodeLabelPurchaseCodeOptions,
): string => {
  const price = Number(purPrice) || 0;
  if (price <= 0) return "";
  const effective = getEffectivePurchasePrice(
    price,
    options?.gstPer || 0,
    options?.includeGst === true,
    options?.extraPercentEnabled === true,
    options?.extraPercent || 0,
  );
  return encodePurchasePrice(effective, alphabet, options?.billDate, {
    includeDate: options?.includeDate !== false,
  });
};

/**
 * Validates a purchase code alphabet string.
 * Must be exactly 10 unique uppercase letters/digits (A-Z, 0-9).
 */
export const validatePurchaseCodeAlphabet = (alphabet: string): boolean => {
  const normalized = normalizePurchaseCodeAlphabet(alphabet);
  if (normalized.length !== 10) return false;
  if (!/^[A-Z0-9]{10}$/.test(normalized)) return false;
  return new Set(normalized.split("")).size === 10;
};

export type PosPurchaseCodeSettings = {
  show_purchase_code_on_pos?: boolean | null;
  purchase_code_alphabet?: string | null;
  purchase_code_include_gst?: boolean | null;
  purchase_code_extra_percent_enabled?: boolean | null;
  purchase_code_extra_percent?: number | null;
};

/** POS cart purchase-code column. Default off: cost is only shown when the org opts in. */
export function resolvePosPurchaseCodeEnabled(
  purchaseSettings?: PosPurchaseCodeSettings | null,
): boolean {
  return purchaseSettings?.show_purchase_code_on_pos === true;
}

/**
 * Letters-only purchase code for a POS cart line (no month/year wrap — POS
 * doesn't know the purchase bill date). Uses the same alphabet and GST /
 * extra % options as barcode labels so the letters match the printed tag.
 */
export function encodePosLinePurchaseCode(
  line: { purPrice?: number | null; purchaseGstPer?: number | null },
  purchaseSettings?: PosPurchaseCodeSettings | null,
): string {
  return encodePurchasePriceForLabel(line.purPrice, purchaseSettings?.purchase_code_alphabet ?? undefined, {
    includeDate: false,
    gstPer: Number(line.purchaseGstPer) || 0,
    includeGst: purchaseSettings?.purchase_code_include_gst === true,
    extraPercentEnabled: purchaseSettings?.purchase_code_extra_percent_enabled === true,
    extraPercent: Number(purchaseSettings?.purchase_code_extra_percent) || 0,
  });
}
