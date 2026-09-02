import { describe, expect, it } from "vitest";
import {
  posBarcodeMatchesNeedMrpPicker,
  posVariantDisplayMrp,
  shouldPromptPosPriceSelection,
} from "@/utils/posScanPriceSelection";

describe("shouldPromptPosPriceSelection", () => {
  it("prompts when sale prices differ", () => {
    expect(
      shouldPromptPosPriceSelection({
        askPriceOnScan: true,
        hasOverridePrice: false,
        masterSalePrice: 164.5,
        masterMrp: 164.5,
        lastPurchaseSalePrice: 180,
        lastPurchaseMrp: 180,
      }),
    ).toBe(true);
  });

  it("prompts when MRP differs but sale prices match (KS Footwear BHG215 pattern)", () => {
    expect(
      shouldPromptPosPriceSelection({
        askPriceOnScan: true,
        hasOverridePrice: false,
        masterSalePrice: 164.5,
        masterMrp: 164.5,
        lastPurchaseSalePrice: 164.5,
        lastPurchaseMrp: 204.5,
      }),
    ).toBe(true);
  });

  it("skips when prices match within tolerance", () => {
    expect(
      shouldPromptPosPriceSelection({
        askPriceOnScan: true,
        hasOverridePrice: false,
        masterSalePrice: 204.5,
        masterMrp: 204.5,
        lastPurchaseSalePrice: 204.5,
        lastPurchaseMrp: 204.5,
      }),
    ).toBe(false);
  });

  it("respects ask_price_on_scan off", () => {
    expect(
      shouldPromptPosPriceSelection({
        askPriceOnScan: false,
        hasOverridePrice: false,
        masterSalePrice: 164.5,
        masterMrp: 164.5,
        lastPurchaseSalePrice: 164.5,
        lastPurchaseMrp: 204.5,
      }),
    ).toBe(false);
  });

  it("skips when POS bills at MRP (sale-price drift irrelevant)", () => {
    expect(
      shouldPromptPosPriceSelection({
        askPriceOnScan: true,
        hasOverridePrice: false,
        posUsesMrpAsPrice: true,
        masterSalePrice: 115.15,
        masterMrp: 204.5,
        lastPurchaseSalePrice: 143,
        lastPurchaseMrp: 204.5,
      }),
    ).toBe(false);
  });
});

describe("posBarcodeMatchesNeedMrpPicker", () => {
  it("detects duplicate barcode at 164.5 vs 204.5 MRP tiers", () => {
    expect(
      posBarcodeMatchesNeedMrpPicker([
        { variant: { mrp: 164.5, sale_price: 164.5 } },
        { variant: { mrp: 204.5, sale_price: 204.5 } },
      ]),
    ).toBe(true);
  });

  it("detects Jockey-style tiers from variant sale_price when MRP disabled (549 vs 569)", () => {
    expect(
      posBarcodeMatchesNeedMrpPicker([
        { variant: { mrp: 0, sale_price: 549 } },
        { variant: { mrp: 0, sale_price: 569 } },
      ]),
    ).toBe(true);
  });

  it("detects Jockey-style tiers from product default_sale_price when variant MRP unset", () => {
    expect(
      posBarcodeMatchesNeedMrpPicker([
        { variant: { mrp: 0, sale_price: 0 }, product: { default_sale_price: 549 } },
        { variant: { mrp: 0, sale_price: 0 }, product: { default_sale_price: 569 } },
      ]),
    ).toBe(true);
  });

  it("detects same-MRP-different-sale-price tiers (Jockey/Enamor old vs new stock, real MRP printed and unchanged)", () => {
    expect(
      posBarcodeMatchesNeedMrpPicker([
        { variant: { mrp: 999, sale_price: 749 } },
        { variant: { mrp: 999, sale_price: 899 } },
      ]),
    ).toBe(true);
  });

  it("single tier when MRP and sale price both match across duplicate rows", () => {
    expect(
      posBarcodeMatchesNeedMrpPicker([
        { variant: { mrp: 999, sale_price: 749 } },
        { variant: { mrp: 999, sale_price: 749 } },
      ]),
    ).toBe(false);
  });

  it("false for single match", () => {
    expect(posBarcodeMatchesNeedMrpPicker([{ variant: { mrp: 204.5 } }])).toBe(false);
  });
});

describe("posVariantDisplayMrp", () => {
  it("falls back to sale_price when mrp is zero", () => {
    expect(posVariantDisplayMrp({ mrp: 0, sale_price: 164.5 })).toBe(164.5);
  });

  it("falls back to product default_sale_price when variant prices unset", () => {
    expect(
      posVariantDisplayMrp({ mrp: 0, sale_price: 0 }, { default_sale_price: 549 }),
    ).toBe(549);
  });
});
