/** Strip spaces/hyphens for compact product code matching (PUL 204 ↔ pul204). */
export function compactProductToken(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s\-_./]/g, "");
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

export function scoreProductSearchMatch(
  parts: { product_name?: string; brand?: string; style?: string; category?: string; barcode?: string },
  rawQuery: string,
): number {
  const term = rawQuery.trim().toLowerCase();
  const compactQuery = compactProductToken(rawQuery);
  if (!term) return 0;

  const name = (parts.product_name ?? "").toLowerCase();
  const compactName = compactProductToken(parts.product_name ?? "");
  const barcode = (parts.barcode ?? "").toLowerCase();
  const style = (parts.style ?? "").toLowerCase();
  const haystack = productHaystack(parts).toLowerCase();

  if (barcode === term) return 1000;
  if (compactName === compactQuery) return 900;
  if (name === term) return 850;
  if (compactName.startsWith(compactQuery)) return 800;
  if (name.startsWith(term)) return 750;
  if (barcode.startsWith(term)) return 700;
  if (style.startsWith(term)) return 650;
  if (compactName.includes(compactQuery)) return 600;
  if (haystack.includes(term)) return 500;
  if (matchesCompactProductSearch(parts, rawQuery)) return 400;
  return 0;
}
