/**
 * FSSAI licence / registration number (food shops in India).
 * Optional everywhere: shop number lives in settings.bill_barcode_settings.fssai_number
 * (no new column), customer number in customers.fssai_number (needs the FSSAI SQL).
 */

export const FSSAI_LABEL = "FSSAI Lic. No.";

/** Trim, drop spaces and uppercase. FSSAI numbers are 14 digits but we do not block other text. */
export function normalizeFssaiNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Shop FSSAI number from the org settings row (empty string when not set). */
export function getShopFssaiNumber(settings: { bill_barcode_settings?: unknown } | null | undefined): string {
  const bbs = settings?.bill_barcode_settings as { fssai_number?: unknown } | null | undefined;
  return normalizeFssaiNumber(bbs?.fssai_number);
}

/** Adds an "FSSAI Lic. No." line under the shop address for printing; unchanged when empty. */
export function appendFssaiToAddress(address: string | null | undefined, fssai: string): string {
  const base = String(address ?? "");
  if (!fssai) return base;
  const line = `${FSSAI_LABEL}: ${fssai}`;
  return base.trim() ? `${base.replace(/\s+$/, "")}\n${line}` : line;
}

/** Soft check shown under the field; never blocks saving. */
export function fssaiWarning(value: string): string | null {
  const v = normalizeFssaiNumber(value);
  if (!v) return null;
  return /^\d{14}$/.test(v) ? null : "FSSAI number is usually 14 digits";
}

/**
 * Customer save payload part. Only sends the column when there is something to write
 * (new value, or clearing an old one), so saving keeps working before the SQL is run.
 */
export function customerFssaiPatch(value: string, previous?: string | null): { fssai_number?: string | null } {
  const next = normalizeFssaiNumber(value);
  const prev = normalizeFssaiNumber(previous);
  if (next === prev) return {};
  return { fssai_number: next || null };
}

/** Print copy of the settings row with the shop FSSAI line added under the address (no-op when empty). */
export function applyShopFssaiToSettings<T extends Record<string, any>>(settings: T): T {
  const fssai = getShopFssaiNumber(settings);
  if (!fssai) return settings;
  return { ...settings, address: appendFssaiToAddress(settings.address, fssai) };
}
