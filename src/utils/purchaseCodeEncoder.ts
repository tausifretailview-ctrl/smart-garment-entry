/**
 * Encodes a purchase price into an alphabetic code using a custom alphabet mapping.
 * Each digit (0-9) is mapped to a letter in the provided alphabet.
 *
 * Default format is letters only (Settings example: ₹100 → BAA).
 * Optional MMCODEYR wrap (e.g. 09SEWN26) when includeDate is true.
 */

export const DEFAULT_PURCHASE_CODE_ALPHABET = "ABCDEFGHIK";

export type EncodePurchasePriceOptions = {
  /** When true, wrap as MM + code + YY using billDate or today. Default false. */
  includeDate?: boolean;
};

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

const parseBillDate = (billDate?: string): Date => {
  if (!billDate) return new Date();
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(billDate);
  if (isoDay) {
    return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
  }
  const parsed = new Date(billDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
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
    includeDate: options?.includeDate === true,
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
