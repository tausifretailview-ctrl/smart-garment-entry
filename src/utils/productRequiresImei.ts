/**
 * Mobile ERP: effective IMEI requirement for a product.
 * Org master switch narrows only — never widens.
 * Missing/undefined requires_imei → true (safe default before/without migration).
 */
export function productRequiresImei(
  product: { requires_imei?: boolean | null } | null | undefined,
  mobileErp: { enabled?: boolean; imei_scan_enforcement?: boolean } | null | undefined,
): boolean {
  if (!mobileErp?.enabled || !mobileErp?.imei_scan_enforcement) return false;
  return product?.requires_imei !== false;
}

const REQUIRES_IMEI_FORM_KEY = "ezzyerp.requires_imei.form_prefs";

type RequiresImeiFormPrefs = {
  lastValue: boolean;
  byCategory: Record<string, boolean>;
};

function readRequiresImeiFormPrefs(): RequiresImeiFormPrefs {
  try {
    const raw = localStorage.getItem(REQUIRES_IMEI_FORM_KEY);
    if (!raw) return { lastValue: true, byCategory: {} };
    const parsed = JSON.parse(raw) as RequiresImeiFormPrefs;
    return {
      lastValue: parsed.lastValue !== false,
      byCategory: parsed.byCategory && typeof parsed.byCategory === "object" ? parsed.byCategory : {},
    };
  } catch {
    return { lastValue: true, byCategory: {} };
  }
}

/** Form default for new products (column default stays true). Prefer category memory, else last-used. */
export function getRequiresImeiFormDefault(category?: string | null): boolean {
  const prefs = readRequiresImeiFormPrefs();
  const cat = (category || "").trim().toLowerCase();
  if (cat && Object.prototype.hasOwnProperty.call(prefs.byCategory, cat)) {
    return prefs.byCategory[cat] !== false;
  }
  return prefs.lastValue !== false;
}

export function rememberRequiresImeiFormChoice(
  requiresImei: boolean,
  category?: string | null,
): void {
  try {
    const prefs = readRequiresImeiFormPrefs();
    prefs.lastValue = requiresImei;
    const cat = (category || "").trim().toLowerCase();
    if (cat) prefs.byCategory[cat] = requiresImei;
    localStorage.setItem(REQUIRES_IMEI_FORM_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
