/**
 * Customer Master location filter.
 *
 * There is no dedicated city column — location lives in `customers.address`
 * (Excel import maps City / Location / Area into that field). Filter matches
 * the address with Indian city aliases (Bangalore = Bengaluru, etc.).
 */

const ILIKE_META = /[%_,.()'"\\]/g;

export function sanitizeCustomerLocationTerm(raw: string): string {
  return raw.replace(ILIKE_META, " ").replace(/\s+/g, " ").trim();
}

/** Canonical city key → spellings found in addresses. */
export const CUSTOMER_CITY_ALIASES: Record<string, string[]> = {
  bangalore: ["bangalore", "bengaluru"],
  bengaluru: ["bangalore", "bengaluru"],
  mumbai: ["mumbai", "bombay"],
  bombay: ["mumbai", "bombay"],
  delhi: ["delhi", "new delhi", "ncr"],
  kolkata: ["kolkata", "calcutta"],
  calcutta: ["kolkata", "calcutta"],
  chennai: ["chennai", "madras"],
  madras: ["chennai", "madras"],
  gurugram: ["gurugram", "gurgaon"],
  gurgaon: ["gurugram", "gurgaon"],
  pune: ["pune", "poona"],
  hyderabad: ["hyderabad", "secunderabad"],
  kochi: ["kochi", "cochin", "ernakulam"],
  cochin: ["kochi", "cochin", "ernakulam"],
  thiruvananthapuram: ["thiruvananthapuram", "trivandrum"],
  trivandrum: ["thiruvananthapuram", "trivandrum"],
  vadodara: ["vadodara", "baroda"],
  baroda: ["vadodara", "baroda"],
};

export function customerLocationMatchTerms(raw: string): string[] {
  const term = sanitizeCustomerLocationTerm(raw).toLowerCase();
  if (!term) return [];
  const direct = CUSTOMER_CITY_ALIASES[term];
  if (direct) return [...direct];
  for (const [city, aliases] of Object.entries(CUSTOMER_CITY_ALIASES)) {
    if (term.includes(city) || aliases.some((a) => term.includes(a))) {
      return [...aliases];
    }
  }
  return [term];
}

/** PostgREST `.or()` clause: address matches any city spelling. */
export function customerLocationOrFilter(raw: string): string | null {
  const terms = customerLocationMatchTerms(raw);
  if (terms.length === 0) return null;
  return terms.map((t) => `address.ilike.%${t}%`).join(",");
}

export function customerAddressMatchesLocation(
  address: string | null | undefined,
  location: string,
): boolean {
  const hay = (address || "").toLowerCase();
  if (!hay) return false;
  return customerLocationMatchTerms(location).some((t) => hay.includes(t));
}

/** Last comma/slash segment of an address, PIN stripped — usually the city. */
export function extractLocationLabelFromAddress(
  address: string | null | undefined,
): string | null {
  const raw = (address || "").trim();
  if (!raw) return null;
  const parts = raw.split(/[,/|-]+/).map((p) => p.trim()).filter(Boolean);
  const candidate = (parts[parts.length - 1] || raw)
    .replace(/\b\d{6}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (candidate.length < 2 || /^\d+$/.test(candidate)) return null;
  return candidate;
}

export function uniqueCustomerLocations(
  addresses: Array<string | null | undefined>,
): string[] {
  const byKey = new Map<string, string>();
  for (const address of addresses) {
    const label = extractLocationLabelFromAddress(address);
    if (!label) continue;
    const key = (customerLocationMatchTerms(label)[0] || label).toLowerCase();
    if (!byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}
