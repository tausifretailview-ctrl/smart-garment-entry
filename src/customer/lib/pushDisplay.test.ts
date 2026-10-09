import { describe, expect, it } from "vitest";
import { APP_ICON, buildPushDisplay, clickTarget, notificationOptions } from "./pushDisplay";

describe("buildPushDisplay", () => {
  it("reads a data-only payload", () => {
    const d = buildPushDisplay({ data: { message_id: "m1", title: "Invoice POS/26-27/340", body: "₹900 — tap to view" } });
    expect(d).toMatchObject({ title: "Invoice POS/26-27/340", body: "₹900 — tap to view", messageId: "m1", tag: "m1" });
    expect(d.url).toBe("/m/m1?title=Invoice%20POS%2F26-27%2F340&body=%E2%82%B9900%20%E2%80%94%20tap%20to%20view");
  });
  it("prefers a notification block and falls back sensibly", () => {
    expect(buildPushDisplay({ notification: { title: "T", body: "B" }, data: { title: "x" } })).toMatchObject({ title: "T", body: "B" });
    expect(buildPushDisplay({})).toMatchObject({ title: "New update", body: "", tag: "shop-update", messageId: undefined });
  });
  it("opens the bill page when the push carries its link", () => {
    const origin = "https://adtech.inventoryshop.in";
    const d = buildPushDisplay({ data: { message_id: "m2", url: "https://adtech.inventoryshop.in/t/tok_123" } }, origin);
    expect(d.url).toBe("https://adtech.inventoryshop.in/t/tok_123");
    // Another site, or a non-bill path, falls back to the message page.
    expect(buildPushDisplay({ data: { message_id: "m3", url: "https://evil.example/t/x" } }, origin).url).toMatch(/^\/m\/m3/);
    expect(buildPushDisplay({ data: { message_id: "m4", url: "https://adtech.inventoryshop.in/x" } }, origin).url).toMatch(/^\/m\/m4/);
  });
  it("carries sale_id / campaign_id to the message page so it can open the bill or offers", () => {
    const sale = "0b0c2f3e-1111-4222-8333-944455556666";
    const d = buildPushDisplay({ data: { message_id: "m5", title: "Invoice X", body: "B", sale_id: sale } });
    expect(d.url).toBe(`/m/m5?title=Invoice%20X&body=B&sale=${sale}`);
    const c = buildPushDisplay({ data: { message_id: "m6", title: "Sale", body: "50% off", campaign_id: sale } });
    expect(c.url).toMatch(new RegExp(`&campaign=${sale}$`));
    // Junk ids are dropped, never injected into the URL.
    expect(buildPushDisplay({ data: { message_id: "m7", sale_id: "x&y=1" } }).url).not.toContain("sale=");
  });
  it("builds a rich offer: shop logo, big picture, code and two buttons", () => {
    const campaign = "0b0c2f3e-1111-4222-8333-944455556666";
    const d = buildPushDisplay({
      data: {
        message_id: "m8",
        title: "Diwali sale",
        body: "Flat 30% off",
        campaign_id: campaign,
        icon: "https://cdn.example/logo.png",
        image: "https://cdn.example/banner.jpg",
        code: "DIWALI30",
        wa: "919876543210",
      },
    });
    expect(d.kind).toBe("offer");
    expect(d.icon).toBe("https://cdn.example/logo.png");
    expect(d.image).toBe("https://cdn.example/banner.jpg");
    expect(d.body).toBe("Flat 30% off\n🏷️ Code: DIWALI30");
    expect(d.actions.map((a) => a.action)).toEqual(["open", "wa"]);
    expect(clickTarget(d, "wa")).toBe("https://wa.me/919876543210");
    expect(clickTarget(d, undefined)).toBe(d.url);
    // The message page link keeps the shop's own text, without the code line.
    expect(d.url).toContain("body=Flat%2030%25%20off&");
    const opts = notificationOptions(d);
    expect(opts).toMatchObject({ image: "https://cdn.example/banner.jpg", tag: "m8", renotify: true });
  });
  it("invoice: no picture, falls back to app icon and 'All my bills' without a shop number", () => {
    const sale = "0b0c2f3e-1111-4222-8333-944455556666";
    const d = buildPushDisplay({
      data: { message_id: "m9", sale_id: sale, image: "https://cdn.example/x.jpg", icon: "http://insecure/logo.png" },
    });
    expect(d.kind).toBe("invoice");
    expect(d.image).toBeUndefined();
    expect(d.icon).toBe(APP_ICON);
    expect(d.actions.map((a) => a.action)).toEqual(["open", "bills"]);
    expect(clickTarget(d, "bills")).toBe("/bills");
    expect(notificationOptions(d)).not.toHaveProperty("image");
  });
  it("plain message has no buttons", () => {
    expect(buildPushDisplay({ data: { message_id: "m10", title: "Hi" } }).actions).toEqual([]);
  });
});
