/**
 * Mobile numbers typed into "Add customer" forms.
 *
 * A number is accepted when, after removing spaces / dashes / brackets, it is exactly
 * 10 digits. A leading +91 / 91 (12 digits) or 0 (11 digits) is allowed and ignored.
 * Anything else (typically a missed digit: 8 or 9 digits) is rejected so a wrong number
 * is not saved and WhatsApp / SMS do not silently fail later.
 */

export const MOBILE_NUMBER_LENGTH = 10;

/** Digits of the number with an optional +91 / 0 prefix removed. */
export function mobileDigits(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === MOBILE_NUMBER_LENGTH + 2 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === MOBILE_NUMBER_LENGTH + 1 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Error text for a mobile number, or null when it is acceptable.
 * Blank is acceptable unless `required` is set (many forms treat mobile as optional).
 */
export function mobileNumberError(
  raw: string | null | undefined,
  options: { required?: boolean } = {},
): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return options.required ? "Mobile number is required" : null;
  const digits = mobileDigits(text);
  if (digits.length === MOBILE_NUMBER_LENGTH) return null;
  const entered = text.replace(/\D/g, "").length;
  return `Mobile number must be exactly ${MOBILE_NUMBER_LENGTH} digits (you entered ${entered}).`;
}

export function isValidMobileNumber(
  raw: string | null | undefined,
  options: { required?: boolean } = {},
): boolean {
  return mobileNumberError(raw, options) === null;
}
