import { describe, expect, it } from "vitest";
import {
  isKsFootwearSlug,
  pickLastPurchaseScanPrice,
  resolveSaleScanPriceSource,
} from "./saleScanPricePreference";

describe("isKsFootwearSlug", () => {
  it("matches ks-footwear only", () => {
    expect(isKsFootwearSlug("ks-footwear")).toBe(true);
    expect(isKsFootwearSlug("KS-FOOTWEAR")).toBe(true);
    expect(isKsFootwearSlug(" ella-noor ")).toBe(false);
    expect(isKsFootwearSlug(null)).toBe(false);
  });
});

describe("resolveSaleScanPriceSource", () => {
  it("defaults KS Footwear to last purchase even when ask is on", () => {
    expect(
      resolveSaleScanPriceSource({
        orgSlug: "ks-footwear",
        askPriceOnScan: true,
        autoUseLastPurchasePrice: null,
      }),
    ).toBe("last_purchase");
  });

  it("lets KS Footwear turn auto-use off and keep the Select Price dialog", () => {
    expect(
      resolveSaleScanPriceSource({
        orgSlug: "ks-footwear",
        askPriceOnScan: true,
        autoUseLastPurchasePrice: false,
      }),
    ).toBe("ask");
  });

  it("other orgs still ask by default", () => {
    expect(
      resolveSaleScanPriceSource({
        orgSlug: "ella-noor",
        askPriceOnScan: true,
      }),
    ).toBe("ask");
  });

  it("explicit auto-use wins for any org", () => {
    expect(
      resolveSaleScanPriceSource({
        orgSlug: "demo",
        askPriceOnScan: true,
        autoUseLastPurchasePrice: true,
      }),
    ).toBe("last_purchase");
  });

  it("ask_price_on_scan off still uses master when auto-use is not set", () => {
    expect(
      resolveSaleScanPriceSource({
        orgSlug: "demo",
        askPriceOnScan: false,
      }),
    ).toBe("master");
  });
});

describe("pickLastPurchaseScanPrice", () => {
  it("uses last purchase sale and MRP (KS Footwear FL505 7)", () => {
    expect(
      pickLastPurchaseScanPrice({
        masterSalePrice: 258.65,
        masterMrp: 369.5,
        lastPurchaseSalePrice: 230.65,
        lastPurchaseMrp: 329.5,
      }),
    ).toEqual({ sale_price: 230.65, mrp: 329.5 });
  });

  it("returns null when last purchase is missing", () => {
    expect(
      pickLastPurchaseScanPrice({
        masterSalePrice: 100,
        masterMrp: 120,
        lastPurchaseSalePrice: null,
        lastPurchaseMrp: null,
      }),
    ).toBeNull();
  });
});
