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
}): { newCampaign: OfferCampaignPayload } | { error: string } {
  const parsed = parseOfferPhones(input.phones);
  if (!parsed.ok) return { error: parsed.error };
  const image = String(input.imageUrl ?? "").trim();
  const newCampaign: OfferCampaignPayload = {
    title: input.title.trim(),
    body: input.body.trim(),
    offerCode: input.offerCode,
    validTill: input.validTill,
    imageUrl: isHttpsOfferImage(image) ? image.slice(0, 500) : null,
  };
  if (parsed.phones) newCampaign.phones = parsed.phones;
  return { newCampaign };
}
