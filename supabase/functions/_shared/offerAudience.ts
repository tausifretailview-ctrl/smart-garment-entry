/** Offer campaign audience. Shared by push-send and the staff Send offer dialog. */

/** PostgREST sends `.in()` on the query string. 500 × 10 digits stays under typical URL limits. */
export const OFFER_PHONE_CAP = 500;

/** Last 10 digits, or "" when the value is too short to be a mobile number. */
export function last10Digits(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export type OfferPhoneParse =
  | { ok: true; phones: string[] | null }
  | { ok: false; error: string };

/**
 * null / omitted / [] = send to every confirmed subscriber (existing clients).
 * A non-empty list becomes unique 10-digit phones. If nothing in that list is a
 * real number, fail — never fall through to send-to-all.
 */
export function parseOfferPhones(raw: unknown): OfferPhoneParse {
  if (raw == null) return { ok: true, phones: null };
  if (!Array.isArray(raw)) return { ok: false, error: "Contacts must be a list of phone numbers" };
  if (raw.length === 0) return { ok: true, phones: null };

  const phones: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = typeof item === "string" || typeof item === "number" ? String(item) : "";
    const last = last10Digits(text);
    if (!/^\d{10}$/.test(last) || seen.has(last)) continue;
    seen.add(last);
    phones.push(last);
    if (phones.length >= OFFER_PHONE_CAP) break;
  }
  if (phones.length === 0) return { ok: false, error: "No valid phone numbers in the selection" };
  return { ok: true, phones };
}

/**
 * `active` means the campaign was created for a phone list. An active filter
 * with zero usable numbers must send to nobody, not to every subscriber.
 */
export function campaignPhonesFromTarget(target: unknown): { active: boolean; phones: string[] } {
  if (!target || typeof target !== "object") return { active: false, phones: [] };
  const raw = (target as { phones?: unknown }).phones;
  if (!Array.isArray(raw)) return { active: false, phones: [] };
  const phones = raw
    .filter((p): p is string => typeof p === "string" && /^\d{10}$/.test(p))
    .slice(0, OFFER_PHONE_CAP);
  return { active: true, phones };
}

export function isHttpsOfferImage(url: string | null | undefined): boolean {
  return /^https:\/\//i.test(String(url ?? "").trim());
}
