import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OFFER_PHONE_CAP,
  campaignPhonesFromTarget,
  isHttpsOfferImage,
  parseOfferPhones,
} from "../../supabase/functions/_shared/offerAudience";
import {
  filterOfferContacts,
  offerContactsFromSubscriptions,
  offerProbeAuthRejected,
  offerSendBody,
  offerSendFailureMessage,
} from "./offerNotificationAudience";

describe("parseOfferPhones", () => {
  it("treats a missing or empty list as send-to-all", () => {
    expect(parseOfferPhones(null)).toEqual({ ok: true, phones: null });
    expect(parseOfferPhones(undefined)).toEqual({ ok: true, phones: null });
    expect(parseOfferPhones([])).toEqual({ ok: true, phones: null });
  });

  it("keeps unique last-10 numbers and drops a country code", () => {
    expect(parseOfferPhones(["+91 98765 43210", "9876543210", "9123456789"])).toEqual({
      ok: true,
      phones: ["9876543210", "9123456789"],
    });
  });

  it("refuses a selection that has no real numbers instead of sending to everyone", () => {
    const parsed = parseOfferPhones(["abc", "12345", { nope: true }]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/valid phone/i);
  });

  it("caps the list", () => {
    const raw = Array.from({ length: OFFER_PHONE_CAP + 25 }, (_, i) => `9${String(i).padStart(9, "0")}`);
    const parsed = parseOfferPhones(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.phones).toHaveLength(OFFER_PHONE_CAP);
  });
});

describe("campaignPhonesFromTarget", () => {
  it("leaves campaigns without a phone list as send-to-all", () => {
    expect(campaignPhonesFromTarget(null).active).toBe(false);
    expect(campaignPhonesFromTarget({}).active).toBe(false);
    expect(campaignPhonesFromTarget({ platform: "android" }).active).toBe(false);
  });

  it("keeps a phone filter active even when every stored number is unusable", () => {
    expect(campaignPhonesFromTarget({ phones: ["nope", "12"] })).toEqual({ active: true, phones: [] });
  });

  it("reads only 10-digit strings", () => {
    expect(campaignPhonesFromTarget({ phones: ["9876543210", "bad", 9123456789] })).toEqual({
      active: true,
      phones: ["9876543210"],
    });
  });
});

describe("offer photo url", () => {
  it("accepts https only", () => {
    expect(isHttpsOfferImage("https://cdn.example/a.jpg")).toBe(true);
    expect(isHttpsOfferImage("HTTPS://cdn.example/a.jpg")).toBe(true);
    expect(isHttpsOfferImage("http://cdn.example/a.jpg")).toBe(false);
    expect(isHttpsOfferImage("")).toBe(false);
    expect(isHttpsOfferImage(null)).toBe(false);
  });
});

describe("offer contacts", () => {
  const subs = [
    { customer_phone_last10: "9876543210", customer_id: "c1", status: "confirmed" },
    { customer_phone_last10: "919876543210", customer_id: null, status: "confirmed" },
    { customer_phone_last10: "9000000001", customer_id: null, status: "confirmed" },
    { customer_phone_last10: "9000000002", customer_id: "c2", status: "inactive" },
  ];
  const customers = [
    { id: "c1", customer_name: "AAMANA", phone: "9876543210" },
    { id: "c3", customer_name: "MEENA", phone: "+91 9000000001" },
    { id: "c2", customer_name: "INACTIVE", phone: "9000000002" },
  ];

  it("dedupes confirmed phones and attaches names", () => {
    expect(offerContactsFromSubscriptions(subs, customers)).toEqual([
      { phone: "9876543210", name: "AAMANA", customerId: "c1" },
      { phone: "9000000001", name: "MEENA", customerId: null },
    ]);
  });

  it("filters by name or digits", () => {
    const rows = offerContactsFromSubscriptions(subs, customers);
    expect(filterOfferContacts(rows, "mee").map((r) => r.phone)).toEqual(["9000000001"]);
    expect(filterOfferContacts(rows, "98765").map((r) => r.phone)).toEqual(["9876543210"]);
  });
});

describe("offerSendBody", () => {
  const base = {
    title: " Diwali ",
    body: " New stock ",
    offerCode: "DIWALI",
    validTill: "2026-11-01",
    imageUrl: "http://insecure.example/a.jpg",
  };

  it("omits phones for send-to-all and drops a non-https photo", () => {
    expect(offerSendBody({ ...base, phones: null })).toEqual({
      newCampaign: {
        title: "Diwali",
        body: "New stock",
        offerCode: "DIWALI",
        validTill: "2026-11-01",
        imageUrl: null,
      },
    });
  });

  it("includes phones for a selected send so the server cannot treat it as everyone", () => {
    const built = offerSendBody({
      ...base,
      imageUrl: "https://cdn.example/offers/1.jpg",
      phones: ["+91 9876543210"],
    });
    expect(built).toEqual({
      newCampaign: {
        title: "Diwali",
        body: "New stock",
        offerCode: "DIWALI",
        validTill: "2026-11-01",
        imageUrl: "https://cdn.example/offers/1.jpg",
        phones: ["9876543210"],
      },
    });
    expect("phones" in (built as { newCampaign: { phones?: string[] } }).newCampaign).toBe(true);
  });

  it("does not build a send-all body from a bad selection", () => {
    const built = offerSendBody({ ...base, phones: ["abc"] });
    expect("error" in built).toBe(true);
    expect("newCampaign" in built).toBe(false);
  });
});

describe("offerProbeAuthRejected", () => {
  it("treats Unauthorized as a rejected login, and a missing phone target as an old service", () => {
    expect(offerProbeAuthRejected("Unauthorized")).toBe(true);
    expect(offerProbeAuthRejected("Sign in again, then send the offer.")).toBe(true);
    expect(offerProbeAuthRejected("No authorization header")).toBe(true);
    expect(offerProbeAuthRejected("Exactly one of saleId, campaignId or newCampaign is required")).toBe(false);
    expect(offerProbeAuthRejected(null)).toBe(false);
    expect(offerSendFailureMessage("Unauthorized")).toContain("Sign out, sign in again");
    expect(offerSendFailureMessage("Turn on Customer page")).toBe("Turn on Customer page");
  });
});

describe("push-send wiring", () => {
  const src = readFileSync(new URL("../../supabase/functions/push-send/index.ts", import.meta.url), "utf8");

  it("filters the campaign audience by the stored phone list and probes before sending", () => {
    expect(src).toContain("campaignPhonesFromTarget");
    expect(src).toContain('.in("customer_phone_last10", phoneTarget.phones)');
    expect(src).toContain("supportsPhoneTarget");
    expect(src).toContain("parseOfferPhones");
    expect(src).toContain("supabase.auth.getUser(token)");
    expect(src).not.toContain("supabaseAuth.auth.getUser()");
  });
});
