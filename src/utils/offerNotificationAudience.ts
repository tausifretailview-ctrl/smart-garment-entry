import {
  isHttpsOfferImage,
  last10Digits,
  parseOfferPhones,
} from "../../supabase/functions/_shared/offerAudience";

export interface OfferCustomerRow {
  id: string;
  customer_name: string | null;
  phone: string | null;
}

export interface OfferSubscriptionRow {
  customer_phone_last10: string;
  customer_id: string | null;
  status: string;
}

export interface OfferContact {
  phone: string;
  name: string;
  customerId: string | null;
}

export interface OfferCampaignPayload {
  title: string;
  body: string;
  offerCode: string | null;
  validTill: string | null;
  imageUrl: string | null;
  phones?: string[];
  /** Discount the offer code gives at website checkout. Omitted = applied by the shop at billing. */
  websiteDiscount?: OfferWebsiteDiscount;
}

export interface OfferWebsiteDiscount {
  percent: number | null;
  flat: number | null;
  minOrder: number | null;
}

/**
 * Website discount from the dialog's fields: "10%" style percent (1–90) or rupees off,
 * with an optional minimum order. Null when nothing usable was entered.
 */
export function parseOfferWebsiteDiscount(input: {
  kind: "percent" | "flat";
  amount: string;
  minOrder: string;
}): OfferWebsiteDiscount | null {
  const amount = Number(String(input.amount ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const min = Number(String(input.minOrder ?? "").replace(/[^\d.]/g, ""));
  const minOrder = Number.isFinite(min) && min > 0 ? Math.round(min) : null;
  if (input.kind === "percent") {
    return { percent: Math.min(90, Math.round(amount * 100) / 100), flat: null, minOrder };
  }
  return { percent: null, flat: Math.round(amount), minOrder };
}

/** One row per confirmed phone. Names come from the linked customer, then from the same phone. */
export function offerContactsFromSubscriptions(
  subs: OfferSubscriptionRow[],
  customers: OfferCustomerRow[],
): OfferContact[] {
  const nameById = new Map<string, string>();
  const nameByPhone = new Map<string, string>();
  for (const c of customers) {
    const name = (c.customer_name ?? "").trim();
    if (!name) continue;
    nameById.set(c.id, name);
    const phone = last10Digits(c.phone);
    if (phone && !nameByPhone.has(phone)) nameByPhone.set(phone, name);
  }

  const byPhone = new Map<string, OfferContact>();
  for (const s of subs) {
    if (s.status !== "confirmed") continue;
    const phone = last10Digits(s.customer_phone_last10);
    if (!phone) continue;
    const existing = byPhone.get(phone);
    const name =
      (s.customer_id ? nameById.get(s.customer_id) : "") ||
      nameByPhone.get(phone) ||
      existing?.name ||
      "";
    byPhone.set(phone, {
      phone,
      name,
      customerId: s.customer_id || existing?.customerId || null,
    });
  }

  return [...byPhone.values()].sort((a, b) => {
    const an = (a.name || a.phone).toLowerCase();
    const bn = (b.name || b.phone).toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

/** Probe failed because the shop login was rejected, not because the service is old. */
export function offerProbeAuthRejected(message: string | null | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes("unauthorized") || text.includes("sign in again") || text.includes("no authorization");
}

export const OFFER_AUTH_REJECTED_MESSAGE =
  "The notification service did not accept this login. Sign out, sign in again, then send.";

/** Replace a bare Unauthorized from push-send with the sign-in instruction. */
export function offerSendFailureMessage(message: string | null | undefined, fallback = "Could not send the offer"): string {
  if (offerProbeAuthRejected(message)) return OFFER_AUTH_REJECTED_MESSAGE;
  const text = (message ?? "").trim();
  return text || fallback;
}

export function filterOfferContacts(contacts: OfferContact[], query: string): OfferContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  const digits = q.replace(/\D/g, "");
  return contacts.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (digits && c.phone.includes(digits)) return true;
    return false;
  });
}

/**
 * Body for push-send `newCampaign`. A selected send always includes `phones`.
 * Omitting `phones` is send-to-all. A non-https photo is dropped.
 */
export function offerSendBody(input: {
  title: string;
  body: string;
  offerCode: string | null;
  validTill: string | null;
  imageUrl: string | null;
  phones: string[] | null;
  websiteDiscount?: OfferWebsiteDiscount | null;
}): { newCampaign: OfferCampaignPayload } | { error: string } {
  const parsed = parseOfferPhones(input.phones);
  // `=== false` narrows the union with strictNullChecks off (tsconfig); `!parsed.ok` does not.
  if (parsed.ok === false) return { error: parsed.error };
  const image = String(input.imageUrl ?? "").trim();
  const newCampaign: OfferCampaignPayload = {
    title: input.title.trim(),
    body: input.body.trim(),
    offerCode: input.offerCode,
    validTill: input.validTill,
    imageUrl: isHttpsOfferImage(image) ? image.slice(0, 500) : null,
  };
  if (parsed.phones) newCampaign.phones = parsed.phones;
  if (input.offerCode && input.websiteDiscount) newCampaign.websiteDiscount = input.websiteDiscount;
  return { newCampaign };
}
