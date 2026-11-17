import { normalizePhoneNumber } from "@/utils/excelImportUtils";

/** Settings → POS: ask for the customer's mobile before a POS bill is saved. Default off. */
export function isPosMobileRequired(saleSettings: { pos_require_customer_mobile?: boolean } | null | undefined): boolean {
  return saleSettings?.pos_require_customer_mobile === true;
}

/** Indian mobile: 10 digits starting 6–9 (a +91 / 0 prefix is dropped first). */
export function normalizePosMobile(raw: string | null | undefined): string {
  return normalizePhoneNumber(raw ?? "");
}

export function isValidPosMobile(raw: string | null | undefined): boolean {
  return /^[6-9]\d{9}$/.test(normalizePosMobile(raw));
}

/** True when the bill still needs a mobile before it can be saved. */
export function posBillNeedsMobile(
  saleSettings: { pos_require_customer_mobile?: boolean } | null | undefined,
  customerPhone: string | null | undefined,
): boolean {
  return isPosMobileRequired(saleSettings) && !isValidPosMobile(customerPhone);
}
