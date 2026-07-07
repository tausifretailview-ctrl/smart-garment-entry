/** Strip spaces/hyphens for compact product code matching (PUL 204 ↔ pul204). */
export function compactProductToken(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s\-_./]/g, "");
}

/** Split a product label into code tokens (FL20 - FL - RLX → fl20, fl, rlx). */
export function productSearchTokens(value: string): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[\s\-_./]+/)
    .filter(Boolean);
}

/** First token of product_name — used to separate FL20 from FL2067 in grouped search. */
export function leadingProductToken(productName: string): string {
  return productSearchTokens(productName)[0] ?? "";
}

/**
 * PostgREST or() filter: match a code token on word boundaries.
 * FL20 matches "FL20 - FL - RLX" but not "FL2067-FL-RLX".
 */
export function buildProductTokenBoundaryOrFilter(term: string): string {
  const safe = term.trim().toLowerCase().replace(/[%_]/g, "");
  if (!safe) return "";

  const fields = ["product_name", "brand", "style", "category"];
  const patterns = [
    `${safe} %`,
    `${safe}-%`,
    `%-${safe}-%`,
    `%-${safe} %`,
    `% ${safe} %`,
    `% ${safe}-%`,
    safe,
  ];

  const clauses: string[] = [];
  for (const field of fields) {
    for (const pattern of patterns) {
      clauses.push(`${field}.ilike.${pattern}`);
    }
  }
  return clauses.join(",");
}

/** Expand typed codes so DB ilike finds spaced/hyphenated product names. */
export function expandProductSearchTerms(raw: string): string[] {
  const cleaned = raw.trim().toLowerCase().replace(/[%_(),."']/g, "");
  if (!cleaned) return [];

  const terms = new Set<string>([cleaned]);

  const letterThenDigits = cleaned.match(/^([a-z]+)(\d+)$/i);
  if (letterThenDigits) {
    terms.add(`${letterThenDigits[1]} ${letterThenDigits[2]}`);
    terms.add(`${letterThenDigits[1]}-${letterThenDigits[2]}`);
  }

  const digitsThenLetters = cleaned.match(/^(\d+)([a-z]+)$/i);
  if (digitsThenLetters) {
    terms.add(`${digitsThenLetters[1]} ${digitsThenLetters[2]}`);
    terms.add(`${digitsThenLetters[1]}-${digitsThenLetters[2]}`);
  }

  const spaced = cleaned
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced && spaced !== cleaned) {
    terms.add(spaced);
  }

  return Array.from(terms).filter(Boolean);
}

export function buildProductTextOrFilter(terms: string[]): string {
  const fields = ["product_name", "brand", "style", "category"];
  const clauses: string[] = [];

  for (const term of terms) {
    const safe = term.replace(/[%_]/g, "");
    if (!safe) continue;
    for (const field of fields) {
      clauses.push(`${field}.ilike.%${safe}%`);
    }
  }

  return clauses.join(",");
}

export function productHaystack(
  parts: { product_name?: string; brand?: string; style?: string; category?: string; barcode?: string; color?: string; size?: string },
): string {
  return `${parts.product_name ?? ""} ${parts.brand ?? ""} ${parts.style ?? ""} ${parts.category ?? ""} ${parts.barcode ?? ""} ${parts.color ?? ""} ${parts.size ?? ""}`;
}

/** True when compact query appears in compact product fields (pul204 matches PUL 204). */
export function matchesCompactProductSearch(
  parts: { product_name?: string; brand?: string; style?: string; category?: string; barcode?: string; color?: string; size?: string },
  rawQuery: string,
): boolean {
  const compactQuery = compactProductToken(rawQuery);
  if (compactQuery.length < 2) return false;
  return compactProductToken(productHaystack(parts)).includes(compactQuery);
}

/** Token-aware match used by sale order / sale bill search (Quick Stock AND-style). */
export function matchesProductSearchFields(
  parts: { product_name?: string; brand?: string; style?: string; category?: string; barcode?: string; color?: string; size?: string },
  rawQuery: string,
): boolean {
  const term = rawQuery.trim().toLowerCase();
  const compactTerm = compactProductToken(rawQuery);
  if (!term) return false;

  const queryTokens = term.split(/[\s-]+/).filter(Boolean);
  const fieldTokens = productSearchTokens(productHaystack(parts));

  const tokenMatch = queryTokens.every((qt) => {
    const compactQt = compactProductToken(qt);
    if (fieldTokens.some((ft) => ft === qt || compactProductToken(ft) === compactQt)) return true;
    if (fieldTokens.some((ft) => ft.startsWith(qt) || compactProductToken(ft).startsWith(compactQt))) return true;
    return productHaystack(parts).toLowerCase().includes(qt);
  });

  return tokenMatch || matchesCompactProductSearch(parts, rawQuery);
}

export function scoreProductSearchMatch(
  parts: { product_name?: string; brand?: string; style?: string; category?: string; barcode?: string },
  rawQuery: string,
): number {
  const term = rawQuery.trim().toLowerCase();
  const compactQuery = compactProductToken(rawQuery);
  if (!term) return 0;

  const name = (parts.product_name ?? "").toLowerCase();
  const compactName = compactProductToken(parts.product_name ?? "");
  const leading = leadingProductToken(parts.product_name ?? "");
  const compactLeading = compactProductToken(leading);
  const barcode = (parts.barcode ?? "").toLowerCase();
  const style = (parts.style ?? "").toLowerCase();
  const haystack = productHaystack(parts).toLowerCase();

  if (barcode === term) return 1000;
  if (leading === term || compactLeading === compactQuery) return 950;
  if (compactName === compactQuery) return 900;
  if (name === term) return 850;
  if (leading.startsWith(term) || compactLeading.startsWith(compactQuery)) return 820;
  if (compactName.startsWith(compactQuery)) return 800;
  if (name.startsWith(term)) return 750;
  if (barcode.startsWith(term)) return 700;
  if (style.startsWith(term)) return 650;
  if (compactName.includes(compactQuery) && (leading.startsWith(term) || leading === term)) return 600;
  if (haystack.includes(term)) return 500;
  if (matchesCompactProductSearch(parts, rawQuery)) return 400;
  return 0;
}
