import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPIN_CAMPAIGN,
  appendSpinLinkLine,
  normalizeSpinCode,
  parsePublicSpin,
  parseSpinOutcome,
  spinChances,
  spinDiscountForBill,
  spinLinkForBill,
  spinPrizeDescription,
  spinTargetRotation,
  starterSpinPrizes,
  validateSpinSetup,
} from "./spinAndWin";

describe("Spin & Win set-up", () => {
  it("chances are each prize's share of the active weights", () => {
    expect(spinChances([{ weight: 30, active: true }, { weight: 10, active: true }, { weight: 60, active: false }])).toEqual([75, 25, 0]);
    expect(spinChances([{ weight: 0, active: true }])).toEqual([0]);
  });

  it("the starter wheel is valid; turning on needs 2 prizes and a gift product", () => {
    const prizes = starterSpinPrizes();
    expect(validateSpinSetup(DEFAULT_SPIN_CAMPAIGN, prizes)).toEqual(["Prize 3: pick the gift product."]);
    prizes[2] = { ...prizes[2], variant_id: "v1", product_id: "p1" };
    expect(validateSpinSetup({ ...DEFAULT_SPIN_CAMPAIGN, enabled: true }, prizes)).toEqual([]);
    expect(validateSpinSetup({ ...DEFAULT_SPIN_CAMPAIGN, enabled: true }, prizes.slice(0, 1))).toContain(
      "Add at least 2 active prizes before turning Spin & Win on.",
    );
    expect(validateSpinSetup({ ...DEFAULT_SPIN_CAMPAIGN, starts_on: "2026-12-10", ends_on: "2026-12-01" }, prizes)).toContain(
      "End date is before the start date.",
    );
  });

  it("describes prizes as the customer reads them", () => {
    expect(spinPrizeDescription({ prize_type: "discount_percent", value: 10, max_discount: 200, label: "10% OFF" })).toBe("10% off (up to ₹200)");
    expect(spinPrizeDescription({ prize_type: "discount_amount", value: 100, label: "x" })).toBe("₹100 off");
    expect(spinPrizeDescription({ prize_type: "gift_item", value: 0, label: "Free socks" })).toBe("Free socks");
  });
});

describe("Spin & Win wheel and link", () => {
  it("turns the won slice under the top pointer", () => {
    // 4 slices of 90°: slice 0's middle is at 45°, so 360 - 45 brings it to the top.
    expect(spinTargetRotation(0, 4, 0)).toBe(315);
    expect(spinTargetRotation(1, 4, 0)).toBe(225);
    expect(spinTargetRotation(3, 4, 6) % 360).toBe(45);
  });

  it("gives the spin link only to bills the campaign covers", () => {
    const c = { enabled: true, starts_on: null, ends_on: null, pos_only: true, min_bill_amount: 500 };
    const bill = { sale_id: "s1", net_amount: 999, sale_number: "POS/26-27/10", bill_context: "pos" };
    expect(spinLinkForBill(c, bill, "2026-11-26", "https://app.x")).toBe("https://app.x/spin/s1");
    expect(spinLinkForBill({ ...c, enabled: false }, bill, "2026-11-26")).toBe("");
    expect(spinLinkForBill(c, { ...bill, net_amount: 400 }, "2026-11-26")).toBe("");
    expect(spinLinkForBill(c, { sale_id: "s2", net_amount: 999, sale_number: "INV/26-27/4" }, "2026-11-26")).toBe("");
    expect(spinLinkForBill({ ...c, pos_only: false }, { sale_id: "s2", net_amount: 999, sale_number: "INV/26-27/4" }, "2026-11-26", "https://app.x")).toBe("https://app.x/spin/s2");
    expect(spinLinkForBill({ ...c, ends_on: "2026-11-25" }, bill, "2026-11-26")).toBe("");
    expect(spinLinkForBill(null, bill)).toBe("");
  });

  it("adds the Spin & Win line once to the WhatsApp message", () => {
    const msg = appendSpinLinkLine("Thanks!", "https://app.x/spin/s1");
    expect(msg).toBe("Thanks!\n\n🎡 *Spin & Win!* Spin the wheel for your gift:\nhttps://app.x/spin/s1");
    expect(appendSpinLinkLine(msg, "https://app.x/spin/s1")).toBe(msg);
    expect(appendSpinLinkLine("Thanks!", "")).toBe("Thanks!");
  });
});

describe("Spin & Win public page and codes", () => {
  it("reads the page data and the spin result", () => {
    const v = parsePublicSpin({
      ok: true, shop_name: "KS", logo_url: "javascript:x", title: "Spin", sale_number: "POS/1", blocked: null,
      prizes: [{ id: "a", label: "10% OFF", color: "#F97316" }, { id: "b", label: "Better luck", color: null }],
      result: null,
    });
    expect("error" in v).toBe(false);
    if ("error" in v) return;
    expect(v.logoUrl).toBeNull(); // only http(s) logos
    expect(v.prizes).toHaveLength(2);
    expect(parsePublicSpin({ ok: false, error: "Bill not found" })).toEqual({ error: "Bill not found" });
    expect(parseSpinOutcome({ ok: true, prize_id: "a", label: "10% OFF", type: "discount_percent", value: 10, max_discount: 200, code: "SW-7K3QX", status: "won" })).toMatchObject({
      code: "SW-7K3QX", max_discount: 200,
    });
    expect(parseSpinOutcome({ ok: false, error: "This Spin & Win link has expired." })).toEqual({ error: "This Spin & Win link has expired." });
  });

  it("codes: typed with or without SW-, any case", () => {
    expect(normalizeSpinCode(" sw-7k3qx ")).toBe("SW-7K3QX");
    expect(normalizeSpinCode("7k3qx")).toBe("SW-7K3QX");
    expect(normalizeSpinCode("")).toBe("");
  });

  it("discount on the next bill, capped", () => {
    expect(spinDiscountForBill({ type: "discount_percent", value: 10, max_discount: 200 }, 3500)).toBe(200);
    expect(spinDiscountForBill({ type: "discount_percent", value: 10, max_discount: null }, 1234)).toBe(123.4);
    expect(spinDiscountForBill({ type: "discount_amount", value: 100, max_discount: null }, 60)).toBe(60);
    expect(spinDiscountForBill({ type: "gift_item", value: 0, max_discount: null }, 900)).toBe(0);
  });
});
