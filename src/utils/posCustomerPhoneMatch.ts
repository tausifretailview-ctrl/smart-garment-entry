/**
 * POS inline phone → existing-customer match rules.
 * Digits-only normalize; no country-code library.
 */

export type PosPhoneMatchCustomer = {
  id: string;
  customer_name: string;
  phone: string | null;
};

export type PosPhoneMatchResult =
  | { kind: "incomplete" }
  | { kind: "none" }
  | { kind: "unique"; customer: PosPhoneMatchCustomer }
  | { kind: "ambiguous"; matches: PosPhoneMatchCustomer[] };

/** Strip to digits only (same approach as useCustomerSearch). */
export function normalizePosPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Enough digits for a complete Indian mobile (WhatsApp enablement uses any non-empty). */
export const POS_PHONE_COMPLETE_DIGITS = 10;

/**
 * Exact digit match: compare last 10 digits when either side is longer,
 * otherwise full digit equality. Avoids guessing on partial prefixes.
 */
export function phonesMatchExactly(a: string, b: string): boolean {
  const da = normalizePosPhoneDigits(a);
  const db = normalizePosPhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= POS_PHONE_COMPLETE_DIGITS && db.length >= POS_PHONE_COMPLETE_DIGITS) {
    return da.slice(-POS_PHONE_COMPLETE_DIGITS) === db.slice(-POS_PHONE_COMPLETE_DIGITS);
  }
  return false;
}

/**
 * Resolve whether typed digits should link a customer.
 * - incomplete: fewer than POS_PHONE_COMPLETE_DIGITS
 * - none: complete, zero exact matches → walk-in phone only
 * - unique: link that customer
 * - ambiguous: do not guess; cashier must pick (or leave unlinked)
 */
export function resolvePosCustomerPhoneMatch(
  typedPhone: string,
  customers: PosPhoneMatchCustomer[],
  completeDigits: number = POS_PHONE_COMPLETE_DIGITS,
): PosPhoneMatchResult {
  const digits = normalizePosPhoneDigits(typedPhone);
  if (digits.length < completeDigits) {
    return { kind: "incomplete" };
  }

  const matches = customers.filter((c) => phonesMatchExactly(digits, c.phone || ""));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "unique", customer: matches[0] };
  return { kind: "ambiguous", matches };
}
