import { canonicalCustomerName, isWalkInCustomerName } from "./salePartyCustomerMaster";

export type CustomerAddressCandidate = {
  customer_name: string | null;
  phone: string | null;
  address: string | null;
};

function digitsOnly(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Last 10 digits, so "+91 97688 59501" and "9768859501" match. */
export function normalizeInvoicePhone(value?: string | null): string {
  const d = digitsOnly(value);
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * Bills keep a copy of the customer address taken at save time. A customer quick-added
 * on the Sale Bill page has no address yet, so their bills print without one even after
 * the address is filled in Customer Master. Look the customer up only when the bill has
 * no address and names a real (non walk-in) party.
 */
export function needsInvoiceCustomerAddressLookup(
  customerName?: string | null,
  customerAddress?: string | null,
): boolean {
  if (String(customerAddress ?? "").trim()) return false;
  return !isWalkInCustomerName(customerName);
}

/**
 * Pick the Customer Master address for the bill's party: same mobile and name first,
 * then the only same-mobile (or only same-name) customer that has an address.
 */
export function pickInvoiceCustomerAddress(
  candidates: CustomerAddressCandidate[],
  customerName?: string | null,
  customerMobile?: string | null,
): string {
  const withAddress = candidates.filter((c) => String(c.address ?? "").trim());
  if (withAddress.length === 0) return "";
  const name = canonicalCustomerName(customerName);
  const phone = normalizeInvoicePhone(customerMobile);
  const samePhone = phone ? withAddress.filter((c) => normalizeInvoicePhone(c.phone) === phone) : [];
  const sameName = name ? withAddress.filter((c) => canonicalCustomerName(c.customer_name) === name) : [];

  const exact = samePhone.find((c) => canonicalCustomerName(c.customer_name) === name);
  if (exact) return String(exact.address).trim();
  if (samePhone.length === 1) return String(samePhone[0].address).trim();
  if (!phone && sameName.length === 1) return String(sameName[0].address).trim();
  return "";
}
