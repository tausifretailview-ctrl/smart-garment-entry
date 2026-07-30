/**
 * Real check-digit validation for retail barcodes and IMEIs, plus provenance
 * classification (manufacturer code vs our own generated series).
 *
 * Deliberately separate from src/utils/imeiValidation.ts — those helpers are
 * length heuristics used by the scan UI and stay as they are.
 */

const digitsOnly = (raw: string) => raw.replace(/\s|-/g, "");

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

/** GTIN mod-10: weights alternate 3/1 from the right, excluding the check digit. */
function gtinCheckDigitValid(code: string): boolean {
  const body = code.slice(0, -1);
  const check = Number(code[code.length - 1]);
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidEan13(raw: string): boolean {
  const code = digitsOnly(raw);
  return code.length === 13 && isNumeric(code) && gtinCheckDigitValid(code);
}

export function isValidUpcA(raw: string): boolean {
  const code = digitsOnly(raw);
  return code.length === 12 && isNumeric(code) && gtinCheckDigitValid(code);
}

export function isValidEan8(raw: string): boolean {
  const code = digitsOnly(raw);
  return code.length === 8 && isNumeric(code) && gtinCheckDigitValid(code);
}

export function isValidGtin14(raw: string): boolean {
  const code = digitsOnly(raw);
  return code.length === 14 && isNumeric(code) && gtinCheckDigitValid(code);
}

/** 15-digit IMEI with Luhn check digit. */
export function isValidImeiLuhn(raw: string): boolean {
  const code = digitsOnly(raw);
  if (code.length !== 15 || !isNumeric(code)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(code[i]);
    // Double every second digit counting from the right (0-based even index from left of 15).
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export type BarcodeSource = "generated" | "external";

export interface BarcodeClassification {
  source: BarcodeSource;
  /** true when nothing matched confidently — kept as 'generated' but worth review. */
  needsReview: boolean;
  reason:
    | "non-numeric"
    | "gtin-check-digit"
    | "imei-luhn"
    | "org-series"
    | "empty"
    | "unmatched";
}

export interface OrgSeriesShape {
  /** organizations.organization_number */
  organizationNumber?: number | null;
  /** settings.bill_barcode_settings.barcode_digits */
  barcodeDigits?: number | null;
}

/**
 * Order matters — a non-digit character rules out generate_next_barcode entirely,
 * so it is tested before any check-digit maths (an alphanumeric brand serial such as
 * SHHY62451C4Z263MA must never be filed as 'generated').
 */
export function classifyBarcodeSource(
  rawBarcode: string | null | undefined,
  org: OrgSeriesShape = {},
): BarcodeClassification {
  const code = (rawBarcode || "").trim();
  if (!code) return { source: "generated", needsReview: false, reason: "empty" };

  if (!isNumeric(digitsOnly(code))) {
    return { source: "external", needsReview: false, reason: "non-numeric" };
  }
  if (isValidEan13(code) || isValidUpcA(code) || isValidEan8(code) || isValidGtin14(code)) {
    return { source: "external", needsReview: false, reason: "gtin-check-digit" };
  }
  if (isValidImeiLuhn(code)) {
    return { source: "external", needsReview: false, reason: "imei-luhn" };
  }

  const digits = digitsOnly(code);
  const orgNum = org.organizationNumber;
  if (orgNum && orgNum > 0) {
    const expectedLength = org.barcodeDigits && org.barcodeDigits > 0 ? org.barcodeDigits : null;
    const lengthOk = expectedLength ? digits.length === expectedLength : true;
    const num = Number(digits);
    const inRange =
      Number.isSafeInteger(num) && num >= orgNum * 10000000 && num < (orgNum + 1) * 10000000;
    if (lengthOk && inRange) {
      return { source: "generated", needsReview: false, reason: "org-series" };
    }
  }

  return { source: "generated", needsReview: true, reason: "unmatched" };
}
