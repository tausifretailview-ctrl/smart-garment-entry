import { describe, expect, it } from "vitest";
import { invoicePushText, pushTtlSeconds, richPushData } from "../supabase/functions/_shared/customerPushPayload";

describe("invoicePushText", () => {
  it("names the shop and the bill", () => {
    expect(invoicePushText({ shopName: "Ella Noor", saleNumber: "POS/26-27/363", netAmount: 1250, totalQty: 3 })).toEqual({
      title: "🧾 Thank you for shopping at Ella Noor",
      body: "Bill POS/26-27/363 · ₹1,250 · 3 items. Tap to view, download or share your bill.",
    });
  });
  it("falls back without a shop name or quantity", () => {
    const t = invoicePushText({ shopName: " ", saleNumber: "S/1", netAmount: null, totalQty: 0 });
    expect(t.title).toBe("🧾 Your bill S/1");
    expect(t.body).toBe("Bill S/1 · ₹0. Tap to view, download or share your bill.");
    expect(invoicePushText({ shopName: "A", saleNumber: "S/2", netAmount: 10, totalQty: 1 }).body).toContain("· 1 item.");
  });
});

describe("pushTtlSeconds", () => {
  const now = new Date("2026-10-09T06:30:00Z"); // 12:00 IST

  it("keeps bills for FCM's 28 days and undated offers for a week", () => {
    expect(pushTtlSeconds("invoice", "2026-10-09", now)).toBe(28 * 86_400);
    expect(pushTtlSeconds("offer", null, now)).toBe(7 * 86_400);
  });
  it("stops an offer at the end of its last day (India time), at least an hour", () => {
    expect(pushTtlSeconds("offer", "2026-10-09", now)).toBe(12 * 3600 - 1);
    expect(pushTtlSeconds("offer", "2026-10-01", now)).toBe(3600);
    expect(pushTtlSeconds("offer", "2027-12-31", now)).toBe(28 * 86_400);
  });
});

describe("richPushData", () => {
  const shop = { name: "Ella Noor", logo_url: "https://cdn.example/logo.png", whatsapp: "919876543210" };

  it("offer: logo, picture, code, WhatsApp", () => {
    expect(richPushData({ kind: "offer", shop, imageUrl: "https://cdn.example/banner.jpg", offerCode: " DIWALI30 " })).toEqual({
      kind: "offer",
      icon: "https://cdn.example/logo.png",
      wa: "919876543210",
      shop: "Ella Noor",
      image: "https://cdn.example/banner.jpg",
      code: "DIWALI30",
    });
  });
  it("invoice never carries an offer picture or code; bad URLs are dropped", () => {
    expect(
      richPushData({ kind: "invoice", shop: { name: "", logo_url: "http://x/logo.png", whatsapp: null }, imageUrl: "https://x/y.jpg", offerCode: "X" }),
    ).toEqual({ kind: "invoice" });
    expect(richPushData({ kind: "offer", shop: null, imageUrl: "javascript:alert(1)" })).toEqual({ kind: "offer" });
  });
});
