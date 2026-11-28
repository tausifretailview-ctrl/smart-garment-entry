/**
 * Weighing-scale barcodes (supermarket go-live, Nov 2026).
 *
 * A label scale (Essae, CAS, Mettler Toledo, Avery…) prints an EAN-13 for loose items:
 *
 *   PP IIIII VVVVV C      e.g. 21 00123 00250 5
 *   │  │     │     └ check digit
 *   │  │     └ weight in grams (0.250 kg) — or the price in paise, per the scale's setting
 *   │  └ item code (PLU) — the item's barcode in EzzyERP
 *   └ prefix 20–29 (GS1 keeps these for in-store codes, so no company EAN starts with them)
 *
 * The layout differs between scales, so it is set in Settings → Sale → Weighing scale.
 * A scan that does not fit the layout, or whose item code is not found, goes through the
 * normal barcode lookup as before.
 */
export type ScaleValueType = "weight" | "price";

export type ScaleBarcodeConfig = {
  enabled: boolean;
  /** Barcode starts: "21" … or "2" for a 1-digit prefix. */
  prefixes: string[];
  itemDigits: number;
  valueDigits: number;
  valueType: ScaleValueType;
  /** Weight: decimals in the printed value (3 = grams → kg). Price: 2 = paise → ₹. */
  valueDecimals: number;
  /** Reject a code whose EAN-13 check digit is wrong (a misread). */
  checkDigit: boolean;
};

export const DEFAULT_SCALE_BARCODE: ScaleBarcodeConfig = {
  enabled: false,
  prefixes: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"],
  itemDigits: 5,
  valueDigits: 5,
  valueType: "weight",
  valueDecimals: 3,
  checkDigit: true,
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Read the shop's setting (sale_settings.scale_barcode); anything missing takes the default. */
export function readScaleBarcodeConfig(saleSettings: unknown): ScaleBarcodeConfig {
  const raw = ((saleSettings as { scale_barcode?: unknown } | null)?.scale_barcode ?? {}) as Record<string, unknown>;
  const prefixes = (Array.isArray(raw.prefixes) ? raw.prefixes : String(raw.prefixes ?? "").split(","))
    .map((p) => String(p).trim())
    .filter((p) => /^\d{1,3}$/.test(p));
  return {
    enabled: raw.enabled === true,
    prefixes: prefixes.length > 0 ? prefixes : DEFAULT_SCALE_BARCODE.prefixes,
    itemDigits: int(raw.itemDigits, 3, 7, DEFAULT_SCALE_BARCODE.itemDigits),
    valueDigits: int(raw.valueDigits, 4, 6, DEFAULT_SCALE_BARCODE.valueDigits),
    valueType: raw.valueType === "price" ? "price" : "weight",
    valueDecimals: int(raw.valueDecimals, 0, 3, raw.valueType === "price" ? 2 : DEFAULT_SCALE_BARCODE.valueDecimals),
    checkDigit: raw.checkDigit !== false,
  };
}

function ean13CheckOk(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

export type ScaleScan = {
  /** Item code as printed (with leading zeros). */
  itemCode: string;
  /** Weight in kg (weight labels). */
  weightKg?: number;
  /** Price in ₹ (price labels). */
  price?: number;
};

/** The parts of a scale label, or null when the code is not one (scan goes on as usual). */
export function parseScaleBarcode(rawCode: string, config: ScaleBarcodeConfig): ScaleScan | null {
  if (!config.enabled) return null;
  const code = String(rawCode || "").trim();
  if (!/^\d+$/.test(code)) return null;
  const prefix = config.prefixes.find((p) => code.startsWith(p));
  if (!prefix) return null;
  if (prefix.length + config.itemDigits + config.valueDigits + 1 !== code.length) return null;
  if (config.checkDigit && code.length === 13 && !ean13CheckOk(code)) return null;

  const itemCode = code.slice(prefix.length, prefix.length + config.itemDigits);
  const valueRaw = code.slice(prefix.length + config.itemDigits, prefix.length + config.itemDigits + config.valueDigits);
  const value = Number(valueRaw) / 10 ** config.valueDecimals;
  if (!(value > 0)) return null;
  if (config.valueType === "price") return { itemCode, price: Math.round(value * 100) / 100 };
  return { itemCode, weightKg: Math.round(value * 1000) / 1000 };
}

/** Barcodes the item may be saved under: "00123" as printed, and "123" without the zeros. */
export function scaleItemBarcodeCandidates(itemCode: string): string[] {
  const out = [itemCode];
  const trimmed = itemCode.replace(/^0+/, "");
  if (trimmed && trimmed !== itemCode) out.push(trimmed);
  return out;
}

/**
 * Quantity to bill: the printed weight; for a price label, price ÷ the item's rate (3 decimals).
 * null when it cannot be worked out (a price label for an item with no rate).
 */
export function scaleQuantity(scan: ScaleScan, ratePerUnit: number): number | null {
  if (scan.weightKg != null) return scan.weightKg > 0 ? scan.weightKg : null;
  if (scan.price != null && ratePerUnit > 0) {
    const q = Math.round((scan.price / ratePerUnit) * 1000) / 1000;
    return q > 0 ? q : null;
  }
  return null;
}
