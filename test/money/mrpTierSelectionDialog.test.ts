import { describe, expect, it } from "vitest";
import {
  mrpTierPrimaryValue,
  sortMrpTierChoices,
  toMrpTierSelectionChoices,
  type MrpTierSelectionChoice,
} from "@/components/MrpTierSelectionDialog";

describe("toMrpTierSelectionChoices", () => {
  it("maps brand, style, and MRP tiers for Jockey-style shared EANs", () => {
    const choices = toMrpTierSelectionChoices([
      {
        product: {
          product_name: "Jockey Brief Saver Pack",
          brand: "JOCKEY",
          style: "COM06",
        },
        variant: {
          id: "v1",
          size: "L",
          color: null,
          mrp: 578,
          sale_price: 549,
          stock_qty: 3,
        },
      },
      {
        product: {
          product_name: "Jockey Brief Saver Pack",
          brand: "JOCKEY",
          style: "COM11",
        },
        variant: {
          id: "v2",
          size: "L",
          color: null,
          mrp: 598,
          sale_price: 569,
          stock_qty: 1,
        },
      },
    ]);

    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({
      id: "v1",
      brand: "JOCKEY",
      style: "COM06",
      mrp: 578,
      salePrice: 549,
      stockQty: 3,
    });
    expect(choices[1]).toMatchObject({
      id: "v2",
      style: "COM11",
      mrp: 598,
      salePrice: 569,
    });
  });

  it("maps sale-only tiers for Jockey-style shared EANs (549 vs 569)", () => {
    const choices = toMrpTierSelectionChoices([
      {
        product: { product_name: "BOXER BRIEF", brand: "JOCKEY", style: "8008" },
        variant: { id: "v1", size: "L", mrp: 0, sale_price: 549, stock_qty: 14 },
      },
      {
        product: { product_name: "BOXER BRIEF", brand: "JOCKEY", style: "8008" },
        variant: { id: "v2", size: "L", mrp: 0, sale_price: 569, stock_qty: 0 },
      },
    ]);

    expect(choices.map((c) => c.mrp)).toEqual([549, 569]);
    expect(choices.map((c) => c.salePrice)).toEqual([549, 569]);
  });

  it("still maps a stale unused MRP onto choice.mrp (the mapper is MRP-preferring)", () => {
    const choices = toMrpTierSelectionChoices([
      {
        product: { product_name: "BOXER BRIEF" },
        variant: { id: "v1", mrp: 200, sale_price: 500, stock_qty: 2 },
      },
      {
        product: { product_name: "BOXER BRIEF" },
        variant: { id: "v2", mrp: 200, sale_price: 600, stock_qty: 1 },
      },
    ]);

    expect(choices.map((c) => c.mrp)).toEqual([200, 200]);
    expect(choices.map((c) => c.salePrice)).toEqual([500, 600]);
  });
});

function staleMrpChoices(): MrpTierSelectionChoice[] {
  return [
    {
      id: "v1",
      productName: "BOXER BRIEF",
      mrp: 200,
      salePrice: 500,
      stockQty: 2,
    },
    {
      id: "v2",
      productName: "BOXER BRIEF",
      mrp: 200,
      salePrice: 600,
      stockQty: 1,
    },
  ];
}

describe("mrpTierPrimaryValue", () => {
  it("uses salePrice as the big number when enableMrp is off, even if a stale MRP is stuck in the DB", () => {
    const [low, high] = staleMrpChoices();
    expect(mrpTierPrimaryValue(low, false)).toBe(500);
    expect(mrpTierPrimaryValue(high, false)).toBe(600);
  });

  it("still shows MRP as the big number when enableMrp is on", () => {
    const [low, high] = staleMrpChoices();
    expect(mrpTierPrimaryValue(low, true)).toBe(200);
    expect(mrpTierPrimaryValue(high, true)).toBe(200);
  });

  it("falls back to salePrice for the MRP card when MRP is unset", () => {
    expect(mrpTierPrimaryValue({ mrp: 0, salePrice: 549 }, true)).toBe(549);
  });
});

describe("sortMrpTierChoices", () => {
  it("sorts by salePrice descending when enableMrp is off (stale shared MRP must not collapse the order)", () => {
    const sorted = sortMrpTierChoices(staleMrpChoices(), false);
    expect(sorted.map((c) => c.id)).toEqual(["v2", "v1"]);
    expect(sorted.map((c) => mrpTierPrimaryValue(c, false))).toEqual([600, 500]);
  });

  it("sorts by MRP descending when enableMrp is on", () => {
    const sorted = sortMrpTierChoices(
      [
        { id: "cheap", productName: "A", mrp: 578, salePrice: 549, stockQty: 1 },
        { id: "dear", productName: "A", mrp: 598, salePrice: 569, stockQty: 1 },
      ],
      true,
    );
    expect(sorted.map((c) => c.id)).toEqual(["dear", "cheap"]);
  });
});
