import { describe, expect, it } from "vitest";
import {
  ellaOfferDiscount,
  ellaOrderSavings,
  ellaRedeemablePoints,
  ellaSavingsLines,
  normalizeShopperMobile,
  offerFromRpc,
  perksFromRpc,
  shopperAppUrl,
  type StorefrontPerks,
} from "./ellaPerks";
import { buildEllaOrderMessage } from "./ellaOrder";
import type { EllaCartLine } from "./ellaCart";

const perks: StorefrontPerks = {
  known: true,
  pointsEnabled: true,
  points: 500,
  redemptionEnabled: true,
  pointValue: 1,
  minPoints: 100,
  maxRedeemPercent: 20,
  minPurchaseForRedemption: 0,
  appSubdomain: "ella",
};

describe("normalizeShopperMobile", () => {
  it("reduces Indian numbers to the 10 digits the ERP matches on", () => {
    expect(normalizeShopperMobile("98765 43210")).toBe("9876543210");
    expect(normalizeShopperMobile("+91 98765-43210")).toBe("9876543210");
    expect(normalizeShopperMobile("09876543210")).toBe("9876543210");
  });

  it("rejects short and non-mobile numbers", () => {
    expect(normalizeShopperMobile("98765")).toBeNull();
    expect(normalizeShopperMobile("1234567890")).toBeNull();
    expect(normalizeShopperMobile("")).toBeNull();
  });

  it("keeps full international numbers", () => {
    expect(normalizeShopperMobile("+971 50 123 45678")).toBe("9715012345678");
  });
});

describe("rpc parsing", () => {
  it("reads perks and ignores failed lookups", () => {
    expect(perksFromRpc({ ok: false })).toBeNull();
    const p = perksFromRpc({
      ok: true,
      known: true,
      points_enabled: true,
      points: 240.7,
      redemption_enabled: true,
      point_value: "0.5",
      min_points: 50,
      max_redeem_percent: 30,
      app_subdomain: " ella ",
    });
    expect(p?.points).toBe(240);
    expect(p?.pointValue).toBe(0.5);
    expect(p?.appSubdomain).toBe("ella");
  });

  it("reads a valid offer and treats invalid as null", () => {
    expect(offerFromRpc({ ok: true, valid: false })).toBeNull();
    const o = offerFromRpc({ ok: true, valid: true, code: "diwali", title: "Diwali", discount_percent: 10, discount_flat: null });
    expect(o).toMatchObject({ code: "DIWALI", discountPercent: 10, discountFlat: null, minOrder: null });
  });
});

describe("discounts", () => {
  const offer = { code: "DIWALI", title: "Diwali", validTill: null, discountPercent: 10, discountFlat: null, minOrder: 1000 };

  it("applies percent and flat codes with a minimum order", () => {
    expect(ellaOfferDiscount(2000, offer)).toBe(200);
    expect(ellaOfferDiscount(999, offer)).toBe(0);
    expect(ellaOfferDiscount(300, { ...offer, discountPercent: null, discountFlat: 500, minOrder: null })).toBe(300);
    expect(ellaOfferDiscount(2000, { ...offer, discountPercent: null })).toBe(0);
  });

  it("caps points like POS: minimum balance and max share of the bill", () => {
    expect(ellaRedeemablePoints(1000, perks)).toEqual({ points: 200, amount: 200 });
    expect(ellaRedeemablePoints(1000, { ...perks, points: 80 })).toEqual({ points: 0, amount: 0 });
    expect(ellaRedeemablePoints(1000, { ...perks, redemptionEnabled: false })).toEqual({ points: 0, amount: 0 });
    expect(ellaRedeemablePoints(1000, { ...perks, pointValue: 0.5 })).toEqual({ points: 400, amount: 200 });
  });

  it("takes the code first, then points on what is left", () => {
    const s = ellaOrderSavings({ subtotal: 2000, offer, perks, usePoints: true });
    expect(s).toMatchObject({ codeDiscount: 200, pointsRedeemed: 360, pointsAmount: 360, payable: 1440 });
    expect(ellaOrderSavings({ subtotal: 2000, offer: null, perks, usePoints: false }).payable).toBe(2000);
  });
});

describe("order message", () => {
  const cart = [
    { key: "p1:M", productId: "p1", code: "EN-101", name: "Kurta", size: "M", qty: 1, price: 2000, priceLabel: "₹2,000" },
  ] as unknown as EllaCartLine[];

  it("carries the code and points so the shop applies them on the bill", () => {
    const savings = { offerCode: "DIWALI", codeDiscount: 200, pointsRedeemed: 360, pointsAmount: 360 };
    const msg = buildEllaOrderMessage({
      cart,
      total: 1440,
      method: "upi",
      customer: { customerName: "Asha", customerPhone: "9876543210", address: "12 Main Road, Pune", pincode: "411001" },
      upiReference: "123456789012",
      savings,
    });
    expect(msg).toContain("Code DIWALI -₹200");
    expect(msg).toContain("Points 360 -₹360");
    expect(msg).toContain("Total ₹1,440");
  });

  it("marks a code with no website discount for billing", () => {
    expect(ellaSavingsLines({ offerCode: "VIP", codeDiscount: 0, pointsRedeemed: 0, pointsAmount: 0 }, "long")).toEqual([
      "Offer code: VIP (apply at billing)",
    ]);
  });
});

describe("shopperAppUrl", () => {
  it("builds the shop's app address only when both parts are known", () => {
    expect(shopperAppUrl("ella", "https://Ezzy.Shop/")).toBe("https://ella.ezzy.shop/");
    expect(shopperAppUrl(null, "ezzy.shop")).toBeNull();
    expect(shopperAppUrl("ella", "")).toBeNull();
  });
});
